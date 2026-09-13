"""Start both local services: python run.py. Ctrl+C stops only these children."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parent

if __name__=='__main__':
    for port in (4173,8787):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',port))==0:
                sys.exit(f'Port {port} is already in use. If Continuum is running, open http://127.0.0.1:4173/. No existing process was stopped.')
    node=shutil.which('node')
    vinext=ROOT/'node_modules'/'vinext'/'dist'/'cli.js'
    if not node or not vinext.exists():sys.exit('Install Node.js and the frontend dependencies with npm ci first. See README.md.')
    children=[]
    try:
        children.append(subprocess.Popen([sys.executable,str(ROOT/'backend'/'server.py')],cwd=ROOT,env={**os.environ,'BRAIN_PORT':'8787'}))
        children.append(subprocess.Popen([node,str(vinext),'dev','--port','4173','--host','127.0.0.1'],cwd=ROOT))
        print('Continuum: http://127.0.0.1:4173/ — keep this launcher running.',flush=True)
        while all(p.poll() is None for p in children):time.sleep(1)
    except KeyboardInterrupt:pass
    finally:
        for p in children:
            if p.poll() is None:p.terminate()
        for p in children:
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
