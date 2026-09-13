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
