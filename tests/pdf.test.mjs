import test from 'node:test';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readPdf } from '../app/ingestion/pdf.mjs';

function fixture(text) {
  const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let file = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = file.length;
  file += `xref\n0 6\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    file += `${String(offset).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(file);
}
const file = { name: 'research.pdf', lastModified: 0 };
test('PDF importer extracts actual text and retains page provenance', async () => {
  const docs = await readPdf(
    pdfjs,
    fixture('Feedback connects memory'),
    file,
    () => {},
  );
  assert.equal(docs[0].body, 'Feedback connects memory');
  assert.equal(docs[0].metadata.page, 1);
  assert.equal(docs[0].metadata.filename, file.name);
  assert.match(docs[0].warnings[0], /keep the original PDF/);
});
test('PDF without selectable text fails with an explicit OCR message', async () => {
  await assert.rejects(
    readPdf(pdfjs, fixture(''), file, () => {}),
    /need OCR/,
  );
});

test('PDF importer accepts a 301-page text PDF while preserving page provenance', async () => {
  const fakePdfjs = {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 301,
        getPage: async (number) => ({
          getTextContent: async () => ({ items: [{ str: `Page ${number}`, hasEOL: false }] }),
          cleanup: () => {},
        }),
      }),
      destroy: async () => {},
    }),
  };
  const docs = await readPdf(fakePdfjs, new Uint8Array(), file, () => {});
  assert.equal(docs.length, 301);
  assert.equal(docs.at(-1).metadata.page, 301);
});
