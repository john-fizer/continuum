import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const directory = new URL('../public/setup/', import.meta.url);
await mkdir(directory, { recursive: true });
await copyFile(
  new URL('../supabase/migrations/001_cloud_memory.sql', import.meta.url),
  new URL('continuum.sql', directory),
);
await copyFile(
  new URL('../supabase/migrations/002_research_queue.sql', import.meta.url),
  new URL('continuum-research.sql', directory),
);
const sql = await readFile(new URL('continuum.sql', directory), 'utf8');
await writeFile(new URL('index.html', directory), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continuum database setup</title><style>body{max-width:1000px;margin:40px auto;padding:20px;background:#08121a;color:#c8e1ed;font:16px/1.6 system-ui}a{color:#83d2ed}textarea{display:block;width:100%;height:60vh;box-sizing:border-box;background:#02090f;color:#bdd7e5;padding:20px;border:1px solid #38515f;font:12px/1.5 monospace}button{padding:12px;margin:12px 0;background:#194154;color:#fff;border:1px solid #5591a7;border-radius:6px}</style><h1>Connect private cloud memory</h1><p>Run the base migration first, then the research migration. Together they create private brains, sources, a durable research queue, and evidence-backed candidate links.</p><p><a href="continuum.sql" download>1. Download base SQL</a> · <a href="continuum-research.sql" download>2. Download research SQL</a> · <a href="https://supabase.com/dashboard/project/strytppbpkvlkfmyeidu/sql/new">Open Supabase SQL Editor</a> · <a href="/">Return to Continuum</a></p><label for="migration">Base database setup SQL</label><textarea id="migration" readonly>${sql.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea><button id="copy">Copy base SQL</button><output id="status"></output><script>document.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(document.querySelector('#migration').value);document.querySelector('#status').textContent='Copied. Paste into your project’s SQL Editor.'}catch{document.querySelector('#migration').select();document.querySelector('#status').textContent='Press Ctrl+C or Copy to copy the selected SQL.'}};</script></html>`);
