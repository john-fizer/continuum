'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export type Experiment = {
  id: string;
  name: string;
  target: string;
  report: null | {
    status: string;
    error?: string;
    rows?: number;
    split_method?: string;
    test_mae?: number;
    baseline_test_mae?: number;
    selected?: { kind: string; feature: string | null };
    candidates?: {
      kind: string;
      feature: string | null;
      validation_mae: number;
    }[];
    limitations?: string;
    model_artifact?: unknown;
  };
};
export function Laboratory({
  experiments,
  submit,
  busy,
  cloud = false,
}: {
  experiments: Experiment[];
  submit: (name: string, target: string, dataset: string) => Promise<void>;
  busy: boolean;
  cloud?: boolean;
}) {
  const [name, setName] = useState(''),
    [target, setTarget] = useState(''),
    [dataset, setDataset] = useState(''),
    [error, setError] = useState('');
  return (
    <>
      <section className="capture-panel">
        <div className="section-heading">
          <h2>A small experiment. A measurable result.</h2>
          <span className="tag">{cloud ? 'Private cloud AutoML' : 'Local AutoML baseline'}</span>
        </div>
        <p>
          Compare a constant prediction, single-feature linear models, and
          decision stumps. The final 20% of rows stay separate until the winning
          model is chosen. The raw dataset and its held-out report stay in this brain.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await submit(name, target, dataset);
          }}
        >
          <div className="lab-grid">
            <label>
              Experiment name
              <input
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What are you trying to predict?"
              />
            </label>
            <label>
              Target column
              <input
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Exact CSV column name"
              />
            </label>
            <label>
              Import numeric CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 200000) {
                    setError('Choose a CSV under 200 KB.');
                    return;
                  }
                  setError('');
                  setDataset(await file.text());
                  if (!name) setName(file.name);
                }}
              />
            </label>
          </div>
          <label>
            Dataset
            <textarea
              required
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              placeholder={'input,target\n1,10\n2,14\n…'}
            />
          </label>
          <div className="capture-actions">
            <p className="fine">
              30–5,000 numeric rows. Up to 20 input columns. Row order is
              preserved.
            </p>
            <Button
              type="submit"
              disabled={busy || !dataset || !name || !target}
            >
              Run experiment
            </Button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      </section>
      <div className="section-heading below">
        <h2>Experiment results</h2>
      </div>
      <div className="connection-grid">
        {experiments.map((ex) => (
          <article className="connection" key={ex.id}>
            <span className="tag">{ex.report?.status || 'Queued'}</span>
            <h3>{ex.name}</h3>
            <p>Prediction target: {ex.target}</p>
            {ex.report?.error && <p role="alert">{ex.report.error}</p>}
            {ex.report?.status === 'completed' && (
              <>
                <p>
                  Selected: {ex.report.selected?.kind}
                  {ex.report.selected?.feature
                    ? ` using ${ex.report.selected.feature}`
                    : ''}
                </p>
                <div className="metrics">
                  <div>
                    <strong>{ex.report.test_mae?.toPrecision(4)}</strong>
                    <span>Test error (MAE)</span>
                  </div>
                  <div>
                    <strong>
                      {ex.report.baseline_test_mae?.toPrecision(4)}
                    </strong>
                    <span>Constant baseline error</span>
                  </div>
                </div>
                <p className="fine">
                  Lower error is better. {ex.report.rows} rows ·{' '}
                  {ex.report.split_method}
                </p>
                <details>
                  <summary>Model comparisons and limitations</summary>
                  {ex.report.candidates?.map((c, i) => (
                    <p key={i}>
                      {c.kind} {c.feature || ''}: validation MAE{' '}
                      {c.validation_mae.toPrecision(4)}
                    </p>
                  ))}
                  <p className="fine">{ex.report.limitations}</p>
                </details>
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(ex, null, 2)], {
                        type: 'application/json',
                      }),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'experiment-result.json';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export model & results
                </Button>
              </>
            )}
          </article>
        ))}
        {!experiments.length && (
          <p className="muted">
            Your first experiment will appear here. It follows this brain’s
            pause and job allowance settings.
          </p>
        )}
      </div>
      <div className="lab-grid below">
        {['Deep learning', 'Reinforcement learning'].map((label) => (
          <article className="lab-card" key={label}>
            <span className="tag">Not connected</span>
            <h3>{label}</h3>
            <p>
              Reserved for a future training adapter with suitable data,
              evaluation, and compute.
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
