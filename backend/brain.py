"""Durable independent brains and a measured, non-generative research baseline."""
import hashlib
import json
import math
import re
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

STOP = set('the a an to and or of for is are in on it this that with from as be by at we i you our can has have was were not but through into its their they more than then'.split())


def terms(text):
    return set(re.findall(r'[a-z][a-z0-9]{2,}', text.lower())) - STOP


def uid():
    return uuid.uuid4().hex


class BrainStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.db() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS brains (
                  id TEXT PRIMARY KEY, name TEXT NOT NULL, direction TEXT NOT NULL,
                  parent_id TEXT, active INTEGER DEFAULT 1, cycle_limit INTEGER DEFAULT 500,
                  cycles_used INTEGER DEFAULT 0, created REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS sources (
                  id TEXT PRIMARY KEY, brain_id TEXT NOT NULL REFERENCES brains(id),
                  title TEXT NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL,
                  origin TEXT NOT NULL, created REAL NOT NULL, UNIQUE(brain_id,hash));
                CREATE TABLE IF NOT EXISTS links (
                  id TEXT PRIMARY KEY, brain_id TEXT NOT NULL REFERENCES brains(id),
                  source_a TEXT NOT NULL REFERENCES sources(id), source_b TEXT NOT NULL REFERENCES sources(id),
                  terms TEXT NOT NULL, similarity REAL NOT NULL, status TEXT DEFAULT 'candidate',
                  note TEXT NOT NULL, created REAL NOT NULL, UNIQUE(brain_id,source_a,source_b));
                CREATE TABLE IF NOT EXISTS jobs (
                  id TEXT PRIMARY KEY, brain_id TEXT NOT NULL REFERENCES brains(id),
                  kind TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL,
                  result TEXT DEFAULT '', created REAL NOT NULL, finished REAL,
                  dedupe TEXT NOT NULL, UNIQUE(brain_id,dedupe));
                CREATE TABLE IF NOT EXISTS experiments (
                  id TEXT PRIMARY KEY, brain_id TEXT NOT NULL REFERENCES brains(id),
                  name TEXT NOT NULL, target TEXT NOT NULL, dataset TEXT NOT NULL,
                  report TEXT, created REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS source_scope ON sources(brain_id);
                CREATE INDEX IF NOT EXISTS job_queue ON jobs(status,created);
            ''')
            if 'metadata' not in {r['name'] for r in db.execute('PRAGMA table_info(sources)')}:
                db.execute("ALTER TABLE sources ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def get_brain(self, brain_id, db):
        row = db.execute('SELECT * FROM brains WHERE id=?', (brain_id,)).fetchone()
        if not row:
            raise ValueError('Brain not found')
        return dict(row)

    def list_brains(self):
        with self.db() as db:
            return [dict(r) for r in db.execute('SELECT b.*, (SELECT count(*) FROM sources s WHERE s.brain_id=b.id) source_count FROM brains b ORDER BY created')]

    def create_brain(self, name, direction, parent_id=None):
        name, direction = str(name).strip(), str(direction).strip()
        if not name or len(name) > 80 or len(direction) > 4000:
            raise ValueError('Enter a name under 80 characters and direction under 4,000 characters')
        brain_id = uid()
        with self.db() as db:
            db.execute('INSERT INTO brains(id,name,direction,parent_id,created) VALUES(?,?,?,?,?)', (brain_id,name,direction,parent_id,time.time()))
            return self.get_brain(brain_id, db)

    def configure(self, brain_id, **values):
        with self.db() as db:
            self.get_brain(brain_id, db)
            if 'active' in values:
                db.execute('UPDATE brains SET active=? WHERE id=?', (int(bool(values['active'])),brain_id))
            if 'direction' in values:
                direction = str(values['direction']).strip()
                if len(direction) > 4000: raise ValueError('Direction is too long')
                db.execute('UPDATE brains SET direction=? WHERE id=?', (direction,brain_id))
            if 'cycle_limit' in values:
                limit = int(values['cycle_limit'])
                if not 1 <= limit <= 100000: raise ValueError('Job allowance must be between 1 and 100,000')
                db.execute('UPDATE brains SET cycle_limit=? WHERE id=?', (limit,brain_id))
            return self.get_brain(brain_id, db)

    def enqueue(self, db, brain_id, kind, payload, dedupe):
        db.execute('INSERT OR IGNORE INTO jobs(id,brain_id,kind,status,payload,created,dedupe) VALUES(?,?,?,?,?,?,?)',
                   (uid(),brain_id,kind,'queued',json.dumps(payload),time.time(),dedupe))

    def import_source(self, brain_id, document):
        if not isinstance(document,dict): raise ValueError('Expected an import document')
        title,body=document.get('title'),document.get('body')
        if not isinstance(title,str) or not isinstance(body,str) or not title.strip() or not body.strip() or len(title)>200 or len(body)>200000:
            raise ValueError('A title and text are required; maximum text length is 200,000 characters')
        metadata=document.get('metadata',{})
        if not isinstance(metadata,dict): raise ValueError('Metadata must be an object')
        try: encoded=json.dumps(metadata,allow_nan=False)
        except (ValueError,TypeError): raise ValueError('Metadata must contain JSON values')
        if len(encoded)>16000: raise ValueError('Source metadata is too large')
        title,body=title.strip(),body.strip()
        digest=hashlib.sha256(body.encode()).hexdigest()
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            self.get_brain(brain_id,db)
            existing=db.execute('SELECT id FROM sources WHERE brain_id=? AND hash=?',(brain_id,digest)).fetchone()
            if existing:return {'source_id':existing['id'],'status':'duplicate','hash':digest}
            source_id=uid()
            db.execute('INSERT INTO sources(id,brain_id,title,body,hash,origin,created,metadata) VALUES(?,?,?,?,?,?,?,?)',(source_id,brain_id,title,body,digest,str(document.get('origin','note'))[:500],time.time(),encoded))
            self.enqueue(db,brain_id,'explore',{'source_id':source_id},'explore:'+source_id)
            return {'source_id':source_id,'status':'imported','hash':digest}

    def add_source(self, brain_id, title, body, origin='note'):
        result=self.import_source(brain_id,{'title':title,'body':body,'origin':origin})
        with self.db() as db:
            source=dict(db.execute('SELECT * FROM sources WHERE id=?',(result['source_id'],)).fetchone())
            source['metadata']=json.loads(source['metadata'])
            return source

    def import_status(self, brain_id, source_ids):
        if not isinstance(source_ids,list) or len(source_ids)>500 or not all(isinstance(i,str) for i in source_ids):raise ValueError('Provide up to 500 source IDs')
        with self.db() as db:
            self.get_brain(brain_id,db)
            result=[]
            for source_id in source_ids:
                if not db.execute('SELECT 1 FROM sources WHERE id=? AND brain_id=?',(source_id,brain_id)).fetchone():continue
                job=db.execute('SELECT status,result FROM jobs WHERE brain_id=? AND dedupe=?',(brain_id,'explore:'+source_id)).fetchone()
                result.append({'source_id':source_id,'status':job['status'] if job else 'saved','detail':job['result'] if job else ''})
            return result

    def fork(self, brain_id, name, direction):
        name = str(name).strip()
        if not name or len(name)>80 or len(str(direction))>4000: raise ValueError('Invalid fork name or direction')
        child_id = uid()
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            parent = self.get_brain(brain_id,db)
            db.execute('INSERT INTO brains(id,name,direction,parent_id,cycle_limit,created) VALUES(?,?,?,?,?,?)',
                       (child_id,name,str(direction).strip() or parent['direction'],brain_id,parent['cycle_limit'],time.time()))
            for source in db.execute('SELECT * FROM sources WHERE brain_id=?',(brain_id,)).fetchall():
                new_id = uid()
                db.execute('INSERT INTO sources(id,brain_id,title,body,hash,origin,created,metadata) VALUES(?,?,?,?,?,?,?,?)',(new_id,child_id,source['title'],source['body'],source['hash'],source['origin'],time.time(),source['metadata']))
                self.enqueue(db,child_id,'explore',{'source_id':new_id},'explore:'+new_id)
            return self.get_brain(child_id,db)

    def snapshot(self, brain_id):
        with self.db() as db:
            brain = self.get_brain(brain_id,db)
            sources = [dict(r) for r in db.execute('SELECT * FROM sources WHERE brain_id=? ORDER BY created DESC',(brain_id,))]
            for source in sources: source['metadata']=json.loads(source['metadata'])
            links = [dict(r) for r in db.execute('SELECT * FROM links WHERE brain_id=? ORDER BY similarity DESC',(brain_id,))]
            for link in links: link['terms'] = json.loads(link['terms'])
            jobs = [dict(r) for r in db.execute('SELECT * FROM jobs WHERE brain_id=? ORDER BY created DESC LIMIT 100',(brain_id,))]
            pending = db.execute("SELECT count(*) FROM jobs WHERE brain_id=? AND status IN ('queued','running')",(brain_id,)).fetchone()[0]
            state = 'paused' if not brain['active'] else 'allowance reached' if brain['cycles_used']>=brain['cycle_limit'] else 'working' if pending else 'listening'
            experiments=[dict(r) for r in db.execute('SELECT id,name,target,report,created FROM experiments WHERE brain_id=? ORDER BY created DESC',(brain_id,))]
            for experiment in experiments:
                experiment['report']=json.loads(experiment['report']) if experiment['report'] else None
            return {'brain':brain,'sources':sources,'links':links,'jobs':jobs,'state':state,'pending':pending,'experiments':experiments,
                    'engine':'Local lexical baseline','model_connected':False}

    def ask(self, brain_id, question):
        data = self.snapshot(brain_id)
        query = terms(question)
        matches = []
        for s in data['sources']:
            overlap = query & terms(s['body']+' '+s['title'])
            if overlap:
                sentences = re.split(r'(?<=[.!?])\s+|\n+',s['body'])
                best = max(sentences,key=lambda x:len(query & terms(x)))
                matches.append((len(overlap),{'source_id':s['id'],'title':s['title'],'excerpt':best[:900]}))
        citations = [v for _,v in sorted(matches,key=lambda x:x[0],reverse=True)[:4]]
        return {'answer':'These source passages match your question. This is retrieval, not a generated explanation.' if citations else 'No matching evidence in this brain yet. Add a relevant source or try different words.',
                'citations':citations,'mode':'local retrieval'}

    def review(self, brain_id, link_id, status):
        if status not in ('candidate','accepted','dismissed'): raise ValueError('Unknown review state')
        with self.db() as db:
            changed = db.execute('UPDATE links SET status=? WHERE id=? AND brain_id=?',(status,link_id,brain_id)).rowcount
            if not changed: raise ValueError('Connection not found in this brain')

    def experiment(self,brain_id,name,target,dataset):
        if not isinstance(dataset,str) or len(dataset)>200000:raise ValueError('CSV text must be under 200,000 characters')
        if not str(name).strip() or not str(target).strip():raise ValueError('Experiment name and target column are required')
        experiment_id=uid()
        with self.db() as db:
            self.get_brain(brain_id,db)
            db.execute('INSERT INTO experiments VALUES(?,?,?,?,?,?,?)',(experiment_id,brain_id,str(name)[:200],str(target)[:200],dataset,None,time.time()))
            self.enqueue(db,brain_id,'experiment',{'experiment_id':experiment_id},'experiment:'+experiment_id)
        return {'id':experiment_id,'status':'queued'}

    def recover(self):
        with self.db() as db:
            db.execute("UPDATE jobs SET status='queued',result='Recovered after service interruption' WHERE status='running'")

    def claim_job(self):
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT j.* FROM jobs j JOIN brains b ON b.id=j.brain_id WHERE j.status='queued' AND b.active=1 AND b.cycles_used<b.cycle_limit ORDER BY j.created LIMIT 1").fetchone()
            if not row: return None
            job = dict(row)
            db.execute("UPDATE jobs SET status='running' WHERE id=?",(job['id'],))
            db.execute('UPDATE brains SET cycles_used=cycles_used+1 WHERE id=?',(job['brain_id'],))
            job['status']='running'
            return job


class Worker:
    def __init__(self, store):
        self.store = store
        self.stop = threading.Event()

    def tick(self):
        job = self.store.claim_job()
        if not job: return False
        try:
            payload = json.loads(job['payload'])
            with self.store.db() as db:
                sources = [dict(r) for r in db.execute('SELECT * FROM sources WHERE brain_id=?',(job['brain_id'],))]
                by_id = {s['id']:s for s in sources}
                if job['kind']=='experiment':
                    from lab import run_experiment
                    experiment=db.execute('SELECT * FROM experiments WHERE id=? AND brain_id=?',(payload['experiment_id'],job['brain_id'])).fetchone()
                    try:report=run_experiment(experiment['dataset'],experiment['target'])
                    except ValueError as exc:report={'status':'failed','error':str(exc)}
                    db.execute('UPDATE experiments SET report=? WHERE id=?',(json.dumps(report),experiment['id']))
                    result='Regression experiment completed; open Laboratory for the held-out results.' if report['status']=='completed' else report['error']
                    if report['status']=='failed':
                        db.execute("UPDATE jobs SET status='failed',result=?,finished=? WHERE id=?",(result,time.time(),job['id']))
                        return True
                elif job['kind']=='explore':
                    source = by_id[payload['source_id']]
                    count=0
                    for other in sources:
                        if other['id']==source['id']: continue
                        shared = terms(source['body']) & terms(other['body'])
                        if len(shared)<2: continue
                        a,b=sorted([source['id'],other['id']])
                        self.store.enqueue(db,job['brain_id'],'analyze',{'a':a,'b':b},'analyze:'+a+':'+b)
                        count+=1
                    result=f'Compared with {max(0,len(sources)-1)} sources; {count} overlapping pairs sent to analysis.'
                elif job['kind']=='analyze':
                    a,b=by_id[payload['a']],by_id[payload['b']]
                    ta,tb=terms(a['body']),terms(b['body'])
                    shared=sorted(ta & tb)
                    score=len(shared)/max(1,len(ta | tb))
                    note='Shared terminology is measured evidence of textual overlap, not proof of a causal or conceptual relationship. Check the original passages and alternative explanations.'
                    db.execute('INSERT OR IGNORE INTO links VALUES(?,?,?,?,?,?,?,?,?)',
                               (uid(),job['brain_id'],a['id'],b['id'],json.dumps(shared[:30]),score,'candidate',note,time.time()))
                    self.store.enqueue(db,job['brain_id'],'reflect',{'a':a['id'],'b':b['id'],'terms':shared[:8]},'reflect:'+a['id']+':'+b['id'])
                    result=f'Measured {len(shared)} shared terms. Saved a candidate connection with both sources.'
                elif job['kind']=='reflect':
                    result='Next inquiry: do '+', '.join(payload['terms'][:5])+' have the same meaning in both sources? Additional evidence is needed before promoting this association.'
                else:
                    raise ValueError('Unsupported job kind')
                db.execute("UPDATE jobs SET status='completed',result=?,finished=? WHERE id=?",(result,time.time(),job['id']))
        except Exception as exc:
            with self.store.db() as db:
                db.execute("UPDATE jobs SET status='failed',result=?,finished=? WHERE id=?",(str(exc)[:1000],time.time(),job['id']))
        return True

    def run(self):
        while not self.stop.is_set():
            try:
                worked=self.tick()
            except sqlite3.Error:
                worked=False
            self.stop.wait(0.5 if worked else 2)
