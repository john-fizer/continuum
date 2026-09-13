// The attention surface uses only concepts named in the question that are
// present in retrieved evidence. Source documents remain one level deeper.
// It does not infer semantic, causal, or cross-domain relationships.
const stop = new Set(
  'about after again also and are because been before being between both can could does each find for from have here how into like more most notes only other our over see should show some source sources than that the their them then there these they this through what when where which while who why will with would you your'.split(
    ' ',
  ),
);
const words = (text) =>
  (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) || []).filter(
    (w) => !stop.has(w),
  );
export function workingAttention(query, citations, sources) {
  const wanted = new Set(citations.map((c) => c.source_id));
  const selected = sources.filter((s) => wanted.has(s.id));
  const tokens = new Map(
    selected.map((s) => [s.id, new Set(words(s.title + ' ' + s.body))]),
  );
  const queryWords = new Set(words(query));
  const concepts = [...queryWords]
    .map((label) => ({
      id: `term:${label}`,
      label,
      sourceIds: selected
        .filter((s) => tokens.get(s.id).has(label))
        .map((s) => s.id),
    }))
    .filter((c) => c.sourceIds.length)
    .sort(
      (a, b) =>
        Number(queryWords.has(b.label)) - Number(queryWords.has(a.label)) ||
        b.sourceIds.length - a.sourceIds.length ||
        a.label.localeCompare(b.label),
    )
    .slice(0, 5);
  const edges = concepts.flatMap((concept, index) =>
    concepts.slice(index + 1).flatMap((other) => {
      const shared = concept.sourceIds.filter((id) => other.sourceIds.includes(id));
      return shared.length
        ? [{
            source_a: concept.id,
            source_b: other.id,
            status: 'evidence_overlap',
            relationship_type: 'co_occurs_in_retrieved_sources',
            sourceIds: shared,
          }]
        : [];
    }),
  );
  return {
    sourceIds: selected.map((s) => s.id),
    concepts,
    edges,
    evidenceEdges: concepts.flatMap((c) =>
      c.sourceIds.map((id) => ({
        source_a: c.id,
        source_b: id,
        status: 'accepted',
        relationship_type: 'term_occurs_in_source',
      })),
    ),
  };
}
