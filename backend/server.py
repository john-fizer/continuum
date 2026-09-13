"""Loopback-only API; run with python backend/server.py."""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from brain import BrainStore, Worker

ROOT=Path(__file__).resolve().parent.parent
STORE=BrainStore(Path(os.environ.get('BRAIN_DB',str(ROOT/'data'/'brain.db'))))
WORKER=Worker(STORE)


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, data):
        body=json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_request(self):
        try:
            if self.headers.get('Host','').split(':')[0] not in ('127.0.0.1','localhost'):
                return self.reply(403,{'error':'Local access only'})
            origin=self.headers.get('Origin')
            if origin and origin not in ('http://localhost:3000','http://127.0.0.1:3000','http://localhost:4173','http://127.0.0.1:4173'):
                return self.reply(403,{'error':'Origin not allowed'})
            parts=urlparse(self.path).path.strip('/').split('/')
            data={}
            if self.command=='POST':
                if self.headers.get('Content-Type','').split(';')[0]!='application/json': return self.reply(415,{'error':'JSON required'})
                length=int(self.headers.get('Content-Length','0'))
                if length<0 or length>500000: return self.reply(413,{'error':'Request too large'})
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict): raise ValueError('Expected an object')
            if parts==['api','health']:
                return self.reply(200,{'ok':True,'worker_alive':any(t.name=='brain-worker' and t.is_alive() for t in threading.enumerate())})
            if parts==['api','brains']:
                return self.reply(200,STORE.create_brain(data.get('name',''),data.get('direction','')) if self.command=='POST' else STORE.list_brains())
            if len(parts)>=3 and parts[:2]==['api','brains']:
                brain_id=parts[2]
                action=parts[3] if len(parts)>3 else ''
                if self.command=='GET' and action in ('','export'):
                    return self.reply(200,STORE.snapshot(brain_id))
                if self.command=='POST':
                    if action=='imports': return self.reply(200,STORE.import_source(brain_id,data))
                    if action=='import-status': return self.reply(200,STORE.import_status(brain_id,data.get('source_ids',[])))
                    if action=='sources': return self.reply(200,STORE.add_source(brain_id,data.get('title',''),data.get('body',''),data.get('origin','note')))
                    if action=='configure': return self.reply(200,STORE.configure(brain_id,**data))
                    if action=='fork': return self.reply(200,STORE.fork(brain_id,data.get('name',''),data.get('direction','')))
                    if action=='ask': return self.reply(200,STORE.ask(brain_id,data.get('question','')))
                    if action=='experiments': return self.reply(200,STORE.experiment(brain_id,data.get('name',''),data.get('target',''),data.get('dataset','')))
                    if action=='review':
                        STORE.review(brain_id,data.get('id',''),data.get('status',''))
                        return self.reply(200,{'ok':True})
            self.reply(404,{'error':'Not found'})
        except (ValueError,TypeError,KeyError) as exc:
            self.reply(400,{'error':str(exc)})
        except Exception:
            self.reply(500,{'error':'Service error; inspect the local server terminal'})

    do_GET=handle_request
    do_POST=handle_request

    def log_message(self,fmt,*args):
        pass


if __name__=='__main__':
    port=int(os.environ.get('BRAIN_PORT','8787'))
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    STORE.recover()
    if not STORE.list_brains(): STORE.create_brain('First brain','Develop useful connections, preserve evidence, and distinguish ideas from facts.')
    threading.Thread(target=WORKER.run,name='brain-worker',daemon=True).start()
    print(f'Brain API listening on http://127.0.0.1:{port}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally:
        WORKER.stop.set()
        server.server_close()
