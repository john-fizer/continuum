const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export function chunkSource(source, maxChars = 1100, overlap = 180) {
  const text = clean(source.body);
  if (!text) return [];
  const passages = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('? ', end), text.lastIndexOf('! ', end), text.lastIndexOf('\n', end));
      if (boundary > start + Math.floor(maxChars * 0.48)) end = boundary + 1;
    }
    const body = text.slice(start, end).trim();
    if (body) passages.push({
      source_id: source.id,
      ordinal: passages.length,
      body,
      char_start: start,
      char_end: end,
    });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return passages;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0, left = 0, right = 0;
  for (let index = 0; index < a.length; index++) {
    const x = Number(a[index]) || 0, y = Number(b[index]) || 0;
    dot += x * y;
    left += x * x;
    right += y * y;
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
}
