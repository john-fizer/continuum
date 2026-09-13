import { documentParts } from './parse.mjs';
export async function readPdf(pdfjs, data, file, progress) {
  const task = pdfjs.getDocument({
    data: data,
    useWorkerFetch: false,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 300)
      throw new Error('PDFs are limited to 300 pages per import.');
    const docs = [];
    let blank = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      progress(`Reading ${file.name}: page ${number} of ${pdf.numPages}`);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
        )
        .join('')
        .trim();
      page.cleanup();
      if (!text) {
        blank++;
        continue;
      }
      docs.push(
        ...documentParts(`${file.name} — page ${number}`, text, {
          filename: file.name,
          format: 'pdf',
          page: number,
          page_count: pdf.numPages,
          file_modified_at: new Date(file.lastModified).toISOString(),
        }),
      );
    }
    if (!docs.length)
      throw new Error(
        'No selectable PDF text was found. Scanned pages need OCR, which is not connected yet.',
      );
    return docs.map((d) => ({
      ...d,
      warnings: [
        `Extracted PDF text only; keep the original PDF. Layout may be simplified.${blank ? ` ${blank} pages had no extractable text and were skipped.` : ''}`,
      ],
    }));
  } finally {
    await task.destroy();
  }
}
