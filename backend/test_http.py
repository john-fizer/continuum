"""End-to-end API checks against a disposable database and a real worker."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path


class HTTPTests(unittest.TestCase):
    def test_full_pipeline_and_experiment(self):
        with tempfile.TemporaryDirectory() as temp:
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0))
                port=sock.getsockname()[1]
            env={**os.environ,'BRAIN_DB':str(Path(temp)/'test.db'),'BRAIN_PORT':str(port)}
            process=subprocess.Popen([sys.executable,str(Path(__file__).with_name('server.py'))],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            def request(path,data=None):
                req=urllib.request.Request(f'http://127.0.0.1:{port}/api/{path}',data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(req,timeout=5) as response:return json.load(response)
            try:
                for _ in range(50):
                    try:
                        if request('health')['worker_alive']:break
                    except OSError:time.sleep(.1)
                else:self.fail('Service failed to start')
                parent=request('brains',{'name':'Integration','direction':'Feedback research'})['id']
                path='brains/'+parent
                request(path+'/configure',{'active':False})
                request(path+'/sources',{'title':'A','body':'Feedback systems connect memory and control.'})
                request(path+'/sources',{'title':'B','body':'Feedback and memory help control systems adapt.'})
                dataset='x,y\n'+'\n'.join(f'{i},{3*i+7}' for i in range(80))
                request(path+'/experiments',{'name':'Linear signal','target':'y','dataset':dataset})
                self.assertEqual(request(path)['brain']['cycles_used'],0)
                child=request(path+'/fork',{'name':'Independent fork'})['id']
                self.assertEqual(request('brains/'+child)['experiments'],[])
                request(path+'/configure',{'active':True})
                for _ in range(160):
                    snapshot=request(path)
                    if snapshot['pending']==0:break
                    time.sleep(.1)
                self.assertEqual(snapshot['pending'],0)
                self.assertTrue(snapshot['links'])
                self.assertTrue(request(path+'/ask',{'question':'feedback'})['citations'])
                report=snapshot['experiments'][0]['report']
                self.assertEqual(report['status'],'completed')
                self.assertLess(report['test_mae'],report['baseline_test_mae'])
                imported=request(path+'/imports',{'title':'Imported','body':'Imported feedback research','metadata':{'filename':'research.md'}})
                duplicate=request(path+'/imports',{'title':'Imported','body':'Imported feedback research'})
                self.assertEqual(duplicate['status'],'duplicate')
                self.assertEqual(duplicate['source_id'],imported['source_id'])
                for _ in range(80):
                    status=request(path+'/import-status',{'source_ids':[imported['source_id']]})
                    if status[0]['status']=='completed':break
                    time.sleep(.1)
                self.assertEqual(status[0]['status'],'completed')
                self.assertEqual(request('brains/'+child+'/import-status',{'source_ids':[imported['source_id']]}),[])
                request(path+'/sources',{'title':'Later','body':'This source arrives after the fork.'})
                self.assertEqual(len(request('brains/'+child)['sources']),2)
                request(path+'/experiments',{'name':'Invalid','target':'y','dataset':'x,y\n1,no'})
                for _ in range(80):
                    reports=request(path)['experiments']
                    failed=next(e for e in reports if e['name']=='Invalid')
                    if failed['report']:break
                    time.sleep(.1)
                self.assertEqual(failed['report']['status'],'failed')
            finally:
                process.terminate()
                process.communicate(timeout=5)
