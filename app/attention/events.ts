// UI events carry real IDs. Producers emit only after the underlying action succeeds.
// Extra event kinds are a contract for later research workers, not simulated activity.
export type CognitiveEvent =
  | { type: 'concept.activate'; conceptId: string; strength: number }
  | { type: 'concept.deactivate'; conceptId: string }
  | { type: 'edge.activate'; source: string; target: string; strength: number }
  | { type: 'memory.retrieve'; memoryId: string; conceptIds: string[] }
  | { type: 'evidence.attach'; sourceId: string; conceptId: string }
  | { type: 'hypothesis.form'; conceptIds: string[]; hypothesisId: string }
  | { type: 'contradiction.detect'; conceptIds: string[] }
  | { type: 'synthesis.begin'; conceptIds: string[] }
  | { type: 'synthesis.complete'; resultId: string }
  | { type: 'knowledge.commit'; sourceId: string; conceptIds: string[] };

export type AttentionSignal = {
  id: string;
  type: 'memory.retrieve' | 'knowledge.commit';
  sourceIds: string[];
};
