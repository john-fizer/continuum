// The attention surface keeps the full brain quiet until a question creates a
// working subgraph. Durable concepts and their evidence-backed relationships
// are preferred over a temporary word diagram; source documents remain one
// level deeper.
const stop = new Set(
  'about after again also and are because been before being between both can could does each find for from have here how into like more most notes only other our over see should show some source sources than that the their them then there these they this through what when where which while who why will with would you your'.split(
    ' ',
  ),
);
const words = (text) =>
  (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) || []).filter(
    (w) => !stop.has(w),
  );
export function workingAttention(
  query,
  citations,
  sources,
  storedConcepts = [],
  storedRelationships = [],
) {
  const wanted = new Set(citations.map((c) => c.source_id));
  const selected = sources.filter((s) => wanted.has(s.id));
  const tokens = new Map(
    selected.map((s) => [s.id, new Set(words(s.title + ' ' + s.body))]),
  );
  const queryWords = new Set(words(query));
  const transientConcepts = [...queryWords]
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
  const stored = storedConcepts
    .map((concept) => {
      const label = String(concept.label || '');
      const normalized = String(concept.normalized_label || label.toLowerCase());
      return {
        id: String(concept.id),
        label,
        sourceIds: selected
          .filter((source) => tokens.get(source.id)?.has(normalized))
          .map((source) => source.id),
        activation: Number(concept.activation_strength || 0),
        relevant: queryWords.has(normalized) || query.toLowerCase().includes(normalized),
      };
    })
    .filter((concept) => concept.label && (concept.relevant || concept.sourceIds.length));
  const concepts = (stored.length ? stored : transientConcepts)
    .sort((a, b) =>
      Number(Boolean(b.relevant)) - Number(Boolean(a.relevant)) ||
      (b.sourceIds.length - a.sourceIds.length) ||
      ((b.activation || 0) - (a.activation || 0)) ||
      a.label.localeCompare(b.label),
    )
    .slice(0, 6);
  const visible = new Set(concepts.map((concept) => concept.id));
  const durableEdges = storedRelationships
    .filter((relationship) =>
      visible.has(String(relationship.concept_a)) &&
      visible.has(String(relationship.concept_b)),
    )
    .map((relationship) => ({
      source_a: String(relationship.concept_a),
      source_b: String(relationship.concept_b),
      status: 'evidence_backed',
      relationship_type: relationship.relationship_type || 'co_occurs',
    }));
  const fallbackEdges = concepts.flatMap((concept, index) =>
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
    edges: durableEdges.length ? durableEdges : fallbackEdges,
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
