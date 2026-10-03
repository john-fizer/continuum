'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, CircleDashed, FlaskConical, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

type CandidateStage = 'watch' | 'prototype' | 'ready';
type Candidate = {
  id: string;
  title: string;
  category: string;
  stage: CandidateStage;
  signal: string;
  smallestTest: string;
  guardrail: string;
};

const storageKey = 'continuum-beta-radar-v1';
const initialCandidates: Candidate[] = [
  {
    id: 'belief-state',
    title: 'Validated belief state',
    category: 'Memory integrity',
    stage: 'prototype',
    signal: 'Keep candidate beliefs and unresolved questions separate from trusted knowledge.',
    smallestTest: 'Attach proposed and committed states to 50 existing retrieval workflows.',
    guardrail: 'Only cited source evidence or verified outcomes may commit a belief.',
  },
  {
    id: 'retention-retrieval',
    title: 'Retention versus retrieval instrumentation',
    category: 'Memory quality',
    stage: 'prototype',
    signal: 'Measure what the brain stores independently from what it surfaces for a question.',
    smallestTest: 'Compare recall quality and unnecessary context across a fixed source set.',
    guardrail: 'No source is deleted or rewritten by the measurement pass.',
  },
  {
    id: 'typed-dag',
    title: 'Typed relationship recovery',
    category: 'Graph reasoning',
    stage: 'watch',
    signal: 'Recover relationship paths through typed evidence rather than raw similarity edges.',
    smallestTest: 'Evaluate a typed path against ten accepted and ten dismissed connections.',
    guardrail: 'A graph edge remains proposed until its source spans are visible.',
  },
  {
    id: 'consensus-quarantine',
    title: 'Wrong-consensus quarantine',
    category: 'Agent safety',
    stage: 'watch',
    signal: 'Treat agreement between agents as confidence input, never as truth.',
    smallestTest: 'Inject conflicting summaries and confirm the system requests evidence.',
    guardrail: 'Consensus cannot promote a claim without an external citation.',
  },
  {
    id: 'evidence-readiness',
    title: 'Evidence-readiness gate',
    category: 'Decision quality',
    stage: 'ready',
    signal: 'Check whether evidence is sufficient before a consequential action or recommendation.',
    smallestTest: 'Record avoided errors, latency, and whether a requested source changed the decision.',
    guardrail: 'Escalation stays deterministic and budget-limited while evidence is incomplete.',
  },
];

const stageCopy: Record<CandidateStage, string> = {
  watch: 'Watch',
  prototype: 'Prototype now',
  ready: 'Ready for beta',
};

function nextStage(stage: CandidateStage): CandidateStage {
  return stage === 'watch' ? 'prototype' : 'ready';
}

export function BetaRadar() {
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setCandidates(JSON.parse(saved) as Candidate[]);
    } catch {
      // Beta state is intentionally disposable; the default candidate ledger remains usable.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(candidates));
    } catch {
      // The beta board remains usable in-memory when browser storage is unavailable.
    }
  }, [candidates, loaded]);

  const summary = useMemo(
    () => ({
      watch: candidates.filter((candidate) => candidate.stage === 'watch').length,
      prototype: candidates.filter((candidate) => candidate.stage === 'prototype').length,
      ready: candidates.filter((candidate) => candidate.stage === 'ready').length,
    }),
    [candidates],
  );

  function advance(id: string) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id && candidate.stage !== 'ready'
          ? { ...candidate, stage: nextStage(candidate.stage) }
          : candidate,
      ),
    );
  }

  return (
    <section className="beta-radar" aria-label="Continuum beta research radar">
      <div className="beta-hero">
        <div>
          <span className="tag amber">BETA CONTROL PLANE</span>
          <h2>Research becomes a tested capability.</h2>
          <p>
            This is the isolation layer between a new advancement and your private brain. Every candidate stays proposed until it has evidence, a smallest useful test, and a promotion decision.
          </p>
        </div>
        <div className="beta-proof">
          <ShieldCheck size={24} />
          <strong>Evidence-backed promotion gate</strong>
          <span>Beta changes do not alter stored memories or production behavior.</span>
        </div>
      </div>

      <div className="beta-metrics" aria-label="Candidate status summary">
        <div><strong>{summary.watch}</strong><span>Watching</span></div>
        <div><strong>{summary.prototype}</strong><span>In prototype</span></div>
        <div><strong>{summary.ready}</strong><span>Ready for beta</span></div>
      </div>

      <div className="section-heading below">
        <div>
          <h2>Proposed research</h2>
          <p>Seeded from the current Synthetic Intelligence research brief. Local decisions persist in this browser until cloud-ledger storage is connected.</p>
        </div>
        <span className="tag">Research Radar v0</span>
      </div>

      <div className="beta-candidate-grid">
        {candidates.map((candidate) => (
          <article className="beta-candidate" key={candidate.id}>
            <div className="row spread">
              <span className={`beta-stage ${candidate.stage}`}>{stageCopy[candidate.stage]}</span>
              <span className="fine">{candidate.category}</span>
            </div>
            <h3>{candidate.title}</h3>
            <p>{candidate.signal}</p>
            <dl>
              <div><dt><FlaskConical size={15} /> Smallest test</dt><dd>{candidate.smallestTest}</dd></div>
              <div><dt><CheckCircle2 size={15} /> Promotion rule</dt><dd>{candidate.guardrail}</dd></div>
            </dl>
            {candidate.stage === 'ready' ? (
              <div className="beta-ready"><CheckCircle2 size={16} /> Awaiting evaluated beta release</div>
            ) : (
              <Button variant="outline" onClick={() => advance(candidate.id)}>
                {candidate.stage === 'watch' ? 'Start prototype' : 'Mark ready for beta'} <ArrowRight size={15} />
              </Button>
            )}
          </article>
        ))}
      </div>

      <div className="beta-flow" aria-label="Beta promotion flow">
        <CircleDashed size={18} /><span>Research signal</span><ArrowRight size={16} /><span>Proposed capability</span><ArrowRight size={16} /><span>Measured prototype</span><ArrowRight size={16} /><span>Beta release</span>
      </div>
    </section>
  );
}
