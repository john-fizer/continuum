import { readPdf } from './pdf.mjs';
// Vite's ?url loader supplies the worker asset URL as a default export.
// eslint-disable-next-line import/default
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseText } from './parse.mjs';
export async function readFile(file: File, progress: (text: string) => void) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      'Choose files up to 20 MB each. Split larger exports first.',
    );
  if (!/\.pdf$/i.test(file.name))
    return parseText(file.name, await file.text(), file.lastModified);
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return readPdf(
    pdfjs,
    new Uint8Array(await file.arrayBuffer()),
    file,
    progress,
  );
}
