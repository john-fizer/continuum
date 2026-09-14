const stop = new Set([
  'about', 'after', 'also', 'been', 'being', 'between', 'could', 'each',
  'from', 'have', 'into', 'just', 'more', 'only', 'other', 'over', 'same',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'through',
  'under', 'what', 'when', 'where', 'which', 'with', 'would', 'your',
]);

function terms(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .match(/[a-z][a-z0-9'-]{2,}/g)
      ?.filter((word) => !stop.has(word)) || [],
  );
}

export function analyzeSource(source, sources) {
  const sourceTerms = terms(source.body);
  const links = sources.flatMap((other) => {
    if (other.id === source.id) return [];
    const shared = [...sourceTerms]
      .filter((word) => terms(other.body).has(word))
      .sort();
    if (shared.length < 2) return [];
    const [source_a, source_b] = [source.id, other.id].sort();
    return [{ source_a, source_b, terms: shared.slice(0, 30) }];
  });
  return {
    links,
    summary: links.length
      ? `Measured ${links[0].terms.length} shared terms and saved ${links.length} candidate connection${links.length === 1 ? '' : 's'}.`
      : 'Compared available sources. No candidate connection met the two-term evidence threshold.',
  };
}

export function conceptCandidates(source, limit = 12) {
  const tokens = String(`${source.title || ''} ${source.body || ''}`)
    .toLowerCase()
    .match(/[a-z][a-z0-9'-]{2,}/g) || [];
  const counts = new Map();
  for (const token of tokens) {
    if (stop.has(token) || token.length < 4) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  const body = String(source.body || '');
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, mentions]) => {
      const sentence = body
        .split(/(?<=[.!?])\s+/)
        .find((part) => part.toLowerCase().includes(label));
      return { label, mentions, excerpt: String(sentence || body).slice(0, 700) };
    });
}
