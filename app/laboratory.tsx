'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ExperimentMode } from './cloud/automl';

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
    task_type?: 'regression' | 'classification' | 'reinforcement';
    metric?: 'mae' | 'accuracy' | 'logged_policy_reward';
    test_score?: number;
    baseline_test_score?: number;
    profile?: {
      duplicate_rows?: number;
      columns?: { name: string; type: string; missing: number; unique: number }[];
    };
    excluded_features?: { name: string; reason: string }[];
    transformations?: { feature: string; rule: string }[];
    quality_gates?: Record<string, string>;
    selected?: { kind: string; feature: string | null };
    candidates?: {
      kind: string;
      feature: string | null;
      validation_mae?: number;
      validation_score?: number;
    }[];
    limitations?: string;
    model_artifact?: unknown;
    mode?: ExperimentMode;
  };
};
export function Laboratory({
  experiments,
  submit,
  busy,
  cloud = false,
}: {
  experiments: Experiment[];
  submit: (name: string, target: string, dataset: string, mode: ExperimentMode) => Promise<void>;
  busy: boolean;
  cloud?: boolean;
}) {
  const [name, setName] = useState(''),
    [target, setTarget] = useState(''),
    [dataset, setDataset] = useState(''),
    [mode, setMode] = useState<ExperimentMode>('automl'),
    [error, setError] = useState('');
  return (
    <>
      <section className="capture-panel">
        <div className="section-heading">
          <h2>Prepare data. Test a hypothesis.</h2>
          <span className="tag">{cloud ? 'Private cloud AutoML' : 'Local AutoML baseline'}</span>
        </div>
        <p>
          Continuum profiles the CSV, removes identifier-like fields, checks for
          target leakage, and fits transformations on training rows only. Each runner
          keeps its final holdout isolated until model selection is complete.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await submit(name, target, dataset, mode);
          }}
        >
          <div className="lab-grid">
            <label>
              Training mode
              <select value={mode} onChange={(e) => setMode(e.target.value as ExperimentMode)}>
                <option value="automl">Interpretable AutoML baseline</option>
                <option value="deep_learning">Dense tabular neural network</option>
                <option value="reinforcement_learning">Offline tabular Q-learning</option>
              </select>
            </label>
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
              {mode === 'reinforcement_learning' ? 'Decision fields' : 'Target column'}
              <input
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={mode === 'reinforcement_learning' ? 'state, action, reward[, next_state]' : 'Exact CSV outcome column'}
              />
            </label>
            <label>
              Import CSV
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
              {mode === 'deep_learning' ? '30–1,500 rows · numeric tabular features · bounded dense-network search.' : mode === 'reinforcement_learning' ? '30–5,000 ordered decision rows · state, action, reward fields required.' : '30–5,000 rows · numeric and categorical features are supported.'}
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
            <p>{ex.report?.mode === 'reinforcement_learning' ? 'Decision fields' : 'Prediction target'}: {ex.target}</p>
            {ex.report?.error && <p role="alert">{ex.report.error}</p>}
            {ex.report?.status === 'completed' && (
              <>
                <p>
                  Selected: {ex.report.selected?.kind?.replaceAll('_', ' ')}
                  {ex.report.selected?.feature
                    ? ` using ${ex.report.selected.feature}`
                    : ''}
                </p>
                <div className="metrics">
                  <div>
                    <strong>{(ex.report.test_score ?? ex.report.test_mae)?.toPrecision(4)}</strong>
                    <span>Test {ex.report.metric?.toUpperCase() || 'error (MAE)'}</span>
                  </div>
                  <div>
                    <strong>{(ex.report.baseline_test_score ?? ex.report.baseline_test_mae)?.toPrecision(4)}</strong>
                    <span>Baseline {ex.report.metric?.toUpperCase() || 'error (MAE)'}</span>
                  </div>
                </div>
                <p className="fine">
                  {ex.report.metric === 'accuracy' || ex.report.metric === 'logged_policy_reward' ? 'Higher is better.' : 'Lower error is better.'} {ex.report.rows} rows ·{' '}
                  {ex.report.split_method}
                </p>
                <details>
                  <summary>Model comparisons and limitations</summary>
                  {ex.report.candidates?.map((c, i) => (
                    <p key={i}>
                      {c.kind.replaceAll('_', ' ')} {c.feature || ''}: validation{' '}
                      {(c.validation_score ?? c.validation_mae ?? 0).toPrecision(4)}
                    </p>
                  ))}
                  {ex.report.profile && (
                    <p className="fine">
                      Profile: {ex.report.profile.columns?.length || 0} fields ·{' '}
                      {ex.report.profile.duplicate_rows || 0} duplicate rows removed before splitting.
                    </p>
                  )}
                  {ex.report.transformations?.map((step) => (
                    <p key={step.feature} className="fine">{step.feature}: {step.rule}</p>
                  ))}
                  {ex.report.excluded_features?.map((field) => (
                    <p key={field.name} className="fine">Excluded {field.name}: {field.reason}.</p>
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
        <article className="lab-card">
          <span className="tag">Connected</span>
          <h3>Deep learning</h3>
          <p>Dense tabular networks run with bounded architecture search, a separate holdout, and no automatic deployment.</p>
        </article>
        <article className="lab-card">
          <span className="tag">Connected</span>
          <h3>Reinforcement learning</h3>
          <p>Offline tabular Q-learning evaluates logged decisions only. A simulator and prospective safety review are required before live control.</p>
        </article>
      </div>
    </>
  );
}
