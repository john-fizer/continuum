'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FlaskConical,
  GitFork,
  Layers3,
  Network,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Laboratory, type Experiment } from './laboratory';
import { KnowledgeGraph } from './knowledge-graph';
import { Masthead, MindBeacon } from './identity';
import { AttentionWorkspace } from './attention/workspace';
import { speakCloud } from './cloud/speech';
import { ImportWorkspace } from './ingestion/import-workspace';
import { api } from './api';
import { cloudEnabled } from './cloud/client';
import { askCloud } from './cloud/chat';
type Brain = {
  id: string;
  name: string;
  direction: string;
  parent_id: string | null;
  active: number;
  cycle_limit: number;
  cycles_used: number;
};
type Source = {
  id: string;
  title: string;
  body: string;
  origin: string;
  created: number;
  metadata?: Record<string, unknown>;
};
type Link = {
  id: string;
  source_a: string;
  source_b: string;
  terms: string[];
  similarity: number;
  status: string;
  note: string;
};
type Job = {
  id: string;
  kind: string;
  status: string;
  result: string;
  created: number;
};
type Snapshot = {
  brain: Brain;
  sources: Source[];
  links: Link[];
  jobs: Job[];
  experiments: Experiment[];
  state: string;
  pending: number;
  worker_connected?: boolean;
};
type Answer = {
  answer: string;
  citations: { source_id: string; title: string; excerpt: string }[];
};
type View =
  | 'Overview'
  | 'Knowledge'
  | 'Discoveries'
  | 'Activity'
  | 'Laboratory'
  | 'Import';
export default function Home() {
  const [brains, setBrains] = useState<Brain[]>([]),
    [id, setId] = useState(''),
    [data, setData] = useState<Snapshot | null>(null),
    [view, setView] = useState<View>('Overview');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<'new' | 'fork' | 'settings' | null>(null);
  const [name, setName] = useState(''),
    [direction, setDirection] = useState(''),
    [limit, setLimit] = useState(500);
  const [selected, setSelected] = useState<Source | null>(null),
    [filter, setFilter] = useState('');
  const current = useRef(id);
  const refresh = useCallback(async () => {
    const list = await api<Brain[]>('brains');
    setBrains(list);
    const target = current.current || list[0]?.id;
    if (!target) return;
    if (!current.current) {
      current.current = target;
      setId(target);
    }
    const next = await api<Snapshot>(`brains/${target}`);
    if (!current.current || target === current.current) setData(next);
  }, []);
  useEffect(() => {
    let alive = true;
    const poll = () =>
      refresh().catch((e) => {
        if (alive) setError(e.message);
      });
    void poll();
    const t = setInterval(poll, cloudEnabled ? 15000 : 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refresh]);
  const switchBrain = (nextId: string) => {
    current.current = nextId;
    setId(nextId);
    setSelected(null);
    setData(null);
    void refresh().catch((e) => setError(e.message));
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModal(null);
        setSelected(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!modal && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.overlay dialog');
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ),
      );
    if (!dialog.contains(document.activeElement)) focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('keydown', trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [modal, selected]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  const brain = data?.brain,
    lookup = (sid: string) => data?.sources.find((s) => s.id === sid),
    candidates =
      data?.links.filter((l) => l.status === 'candidate').length || 0;
  const open = (type: 'new' | 'fork' | 'settings') => {
    setName(type === 'fork' ? `${brain?.name || 'Brain'} fork` : '');
    setDirection(type === 'new' ? '' : brain?.direction || '');
    setLimit(brain?.cycle_limit || 500);
    setModal(type);
  };
  function exportBrain() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brain?.name || 'brain'}-snapshot.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const cards = (links: Link[]) =>
    links.length ? (
      links.map((l) => (
        <article className="connection" key={l.id}>
          <div className="row">
            <span className="tag amber">
              {l.status === 'candidate' ? 'Candidate association' : l.status}
            </span>
            <span className="muted">
              {Math.round(l.similarity * 100)}% term overlap
            </span>
          </div>
          <h3>
            {lookup(l.source_a)?.title} <span className="muted">↔</span>{' '}
            {lookup(l.source_b)?.title}
          </h3>
          <p>Shared terms: {l.terms.slice(0, 7).join(', ')}.</p>
          <p className="fine">{l.note}</p>
          <div className="connection-bottom">
            <div className="row">
              <button
                className="text-button"
                onClick={() => setSelected(lookup(l.source_a) || null)}
              >
                Source A <ArrowUpRight size={14} />
              </button>
              <button
                className="text-button"
                onClick={() => setSelected(lookup(l.source_b) || null)}
              >
                Source B <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="row">
              <Button
                variant="ghost"
                disabled={busy || l.status === 'dismissed'}
                onClick={() =>
                  void act(async () => {
                    await api(`brains/${id}/review`, {
                      id: l.id,
                      status: 'dismissed',
                    });
                  })
                }
              >
                Dismiss
              </Button>
              <Button
                variant="outline"
                disabled={busy || l.status === 'accepted'}
                onClick={() =>
                  void act(async () => {
                    await api(`brains/${id}/review`, {
                      id: l.id,
                      status: 'accepted',
                    });
                  })
                }
              >
                <Check size={14} />
                Keep
              </Button>
            </div>
          </div>
        </article>
      ))
    ) : (
      <div className="empty">
        <Network size={28} />
        <h3>Connections need something to connect.</h3>
        <p>
          {cloudEnabled
            ? 'Your sources are saved separately from their relationships. Automatic connection discovery needs the cloud research worker.'
            : 'Add two sources with related ideas. The background loops will compare them and show the evidence here.'}
        </p>
      </div>
    );
  return (
    <div
      className={`shell ${view === 'Overview' ? 'command-view attention-view' : ''}`}
    >
      <Masthead connected={!!data} />
      <aside className="sidebar">
        <div className="instance-label">
          Your brains
          <button aria-label="Create brain" onClick={() => open('new')}>
            <Plus size={17} />
          </button>
        </div>
        <label className="sr-only" htmlFor="brain-select">
          Active brain
        </label>
        <select
          id="brain-select"
          value={id}
          onChange={(e) => {
            switchBrain(e.target.value);
          }}
        >
          {brains.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="instance-context">
          <span className="small-dot" />
          Independent memory
        </div>
        <nav aria-label="Brain views">
          {(
            [
              ['Overview', Layers3],
              ['Knowledge', BookOpen],
              ['Import', Upload],
              ['Discoveries', Sparkles],
              ['Activity', Activity],
              ['Laboratory', FlaskConical],
            ] as const
          ).map(([label, Icon]) => (
            <button
              key={label}
              className={`nav-item ${view === label ? 'active' : ''}`}
              onClick={() => setView(label)}
            >
              <Icon size={19} />
              {label}
              {label === 'Discoveries' && candidates > 0 && (
                <span className="nav-count">{candidates}</span>
              )}
            </button>
          ))}
        </nav>
        <MindBeacon />
        <div className="sidebar-bottom">
          <div className="engine-label">
            <span className="small-dot" />
            Research engine
          </div>
          <p>
            {data
              ? data.worker_connected === false
                ? 'Cloud memory connected. Analysis worker not connected.'
                : 'Source analysis is active.'
              : 'Waiting for the brain service.'}
            <br />
            Answers stay linked to saved sources and citations.
          </p>
          <button
            className="nav-item"
            disabled={!brain}
            onClick={() => open('settings')}
          >
            <Settings2 size={18} />
            Brain settings
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={14} />
            <span>
              {brain?.name || (cloudEnabled ? 'Choose a brain' : 'Connecting…')}
            </span>
            {brain?.parent_id && <span className="tag">Fork</span>}
          </div>
          <div className="row">
            <Button variant="ghost" onClick={() => open('new')}>
              <Plus size={16} />
              New brain
            </Button>
            <Button variant="ghost" disabled={!brain} onClick={exportBrain}>
              <Download size={16} />
              Export
            </Button>
            <Button
              variant="outline"
              disabled={!brain}
              onClick={() => open('fork')}
            >
              <GitFork size={16} />
              Fork brain
            </Button>
          </div>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={17} />
            </button>
          </div>
        )}
        <div className="page-heading">
          <div>
            <h1>{view === 'Overview' ? 'Your connected mind.' : view}</h1>
            <p>
              {view === 'Overview'
                ? brain?.direction || 'Create a brain and give it a direction.'
                : view === 'Knowledge'
                  ? 'Original sources, kept within this brain.'
                  : view === 'Discoveries'
                    ? 'Explore proposed connections. Keep the useful ones.'
                    : view === 'Import'
                      ? 'Preview, select, and preserve your sources.'
                      : view === 'Activity'
                        ? 'A durable record of work happening behind the conversation.'
                        : 'Define what to learn, then measure whether it learned it.'}
            </p>
          </div>
          <span className="status">
            <span className="small-dot" />
            {data?.state ||
              (error
                ? 'Service unavailable'
                : cloudEnabled
                  ? 'Create or open a brain'
                  : 'Connecting')}
          </span>
        </div>
        {view === 'Overview' ? (
          <AttentionWorkspace
            key={id}
            data={data}
            onCreate={() => open('new')}
            onImport={() => setView('Import')}
            onCapture={async (title, body) => {
              const saved = await api<{ id: string }>(`brains/${id}/sources`, {
                title,
                body,
                origin: 'observation',
              });
              await refresh();
              return saved.id;
            }}
            onAsk={(query, history = []) =>
              cloudEnabled
                ? askCloud(id, query, history)
                : api<Answer>(`brains/${id}/ask`, { question: query })
            }
            onSpeak={(text) => {
              if (!cloudEnabled)
                return Promise.reject(new Error('Neural voice is available in the private cloud workspace.'));
              return speakCloud(text);
            }}
          />
        ) : view === 'Import' ? (
          <ImportWorkspace brains={brains} activeId={id} onSaved={refresh} />
        ) : !data ? (
          <div className="overview-grid offline-workspace">
            <KnowledgeGraph nodes={[]} links={[]} select={() => {}} />
            <section className="capture-panel connection-standby">
              <span className="tag amber">Connection required</span>
              <h2>Your workspace is ready.</h2>
              <p>
                Sign in and create a brain, then import sources into that
                workspace. Automatic cloud research is a separate next step.
              </p>
              <div className="standby-rule" />
              <h3>Capture. Connect. Understand.</h3>
              <p className="fine">
                Your local notes are still on your computer. This view contains
                no example knowledge or invented discoveries.
              </p>
            </section>
          </div>
        ) : (
          <>
            {view === 'Knowledge' && (
              <>
                <KnowledgeGraph
                  nodes={data.sources}
                  links={data.links}
                  select={(sid) => setSelected(lookup(sid) || null)}
                />
                <div className="toolbar">
                  <div className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Filter sources"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Find a source…"
                    />
                  </div>
                  <Button disabled={busy} onClick={() => setView('Import')}>
                    <Upload size={16} />
                    Import sources
                  </Button>
                  <Button variant="outline" onClick={() => setView('Overview')}>
                    <Plus size={16} />
                    Add observation
                  </Button>
                </div>
                <div className="source-list">
                  {data.sources
                    .filter((s) =>
                      (s.title + ' ' + s.body)
                        .toLowerCase()
                        .includes(filter.toLowerCase()),
                    )
                    .map((s) => (
                      <button
                        key={s.id}
                        className="source-row"
                        onClick={() => setSelected(s)}
                      >
                        <BookOpen size={21} />
                        <div>
                          <h3>{s.title}</h3>
                          <p>{s.body.slice(0, 160)}</p>
                          <span className="fine">
                            {s.origin} ·{' '}
                            {new Date(s.created * 1000).toLocaleDateString()}
                          </span>
                        </div>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  {!data.sources.length && (
                    <div className="empty">
                      <BookOpen />
                      <h3>Your first source starts the graph.</h3>
                      <p>Add an observation or import a text file.</p>
                    </div>
                  )}
                </div>
              </>
            )}
            {view === 'Discoveries' && (
              <div className="connection-grid">{cards(data.links)}</div>
            )}
            {view === 'Activity' && (
              <>
                <div className="toolbar">
                  <p>
                    {data.pending} pending jobs · {brain?.cycles_used} of{' '}
                    {brain?.cycle_limit} job allowance used
                  </p>
                  <Button variant="outline" onClick={() => open('settings')}>
                    Adjust allowance
                  </Button>
                </div>
                <div className="activity-list">
                  {data.jobs.map((j) => (
                    <article className="job" key={j.id}>
                      <div className={`job-icon ${j.kind}`}>
                        <Activity size={17} />
                      </div>
                      <div>
                        <div className="row">
                          <h3>
                            {j.kind === 'explore'
                              ? 'Explore source connections'
                              : j.kind === 'analyze'
                                ? 'Analyze shared evidence'
                                : j.kind === 'experiment'
                                  ? 'Run model comparison'
                                  : 'Reflect on the finding'}
                          </h3>
                          <span className="tag">{j.status}</span>
                        </div>
                        <p>{j.result || 'Waiting for a background worker.'}</p>
                      </div>
                      <time>
                        {new Date(j.created * 1000).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </article>
                  ))}
                  {!data.jobs.length && (
                    <div className="empty">
                      <Activity />
                      <p>
                        {data.worker_connected === false
                          ? 'Cloud sources are saved. Background research is not connected yet.'
                          : 'Adding a source will create the first research job.'}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
            {view === 'Laboratory' &&
              (cloudEnabled ? (
                <div className="empty">
                  <FlaskConical />
                  <h3>The cloud laboratory is next.</h3>
                  <p>
                    Model experiments currently run in the local app. Your cloud
                    notes are stored, but are not training a model.
                  </p>
                </div>
              ) : (
                <Laboratory
                  key={id}
                  experiments={data.experiments || []}
                  busy={busy}
                  submit={async (name, target, dataset) => {
                    await act(async () => {
                      await api(`brains/${id}/experiments`, {
                        name,
                        target,
                        dataset,
                      });
                    });
                  }}
                />
              ))}
          </>
        )}
        <footer>
          <span>Continuum / research workspace</span>
          <span>
            Each brain has its own memory. Forks evolve independently.
          </span>
        </footer>
      </main>
      {selected && (
        <div className="overlay">
          <dialog
            open
            className="source-dialog"
            aria-modal="true"
            aria-labelledby="source-heading"
          >
            <div className="row spread">
              <span className="tag">Original source</span>
              <Button
                autoFocus
                variant="ghost"
                aria-label="Close source"
                onClick={() => setSelected(null)}
              >
                <X />
              </Button>
            </div>
            <h2 id="source-heading">{selected.title}</h2>
            <p className="fine">{selected.origin}</p>
            {selected.metadata && Object.keys(selected.metadata).length > 0 && (
              <details className="source-provenance">
                <summary>Source dates and provenance</summary>
                <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
              </details>
            )}
            <pre>{selected.body}</pre>
          </dialog>
        </div>
      )}
      {modal && (
        <div className="overlay">
          <dialog
            open
            className="dialog"
            aria-modal="true"
            aria-labelledby="dialog-heading"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  if (modal === 'settings') {
                    await api(`brains/${id}/configure`, {
                      direction,
                      cycle_limit: limit,
                    });
                  } else {
                    const b = await api<Brain>(
                      modal === 'fork' ? `brains/${id}/fork` : 'brains',
                      { name, direction },
                    );
                    switchBrain(b.id);
                  }
                  setModal(null);
                });
              }}
            >
              <div className="row spread">
                <h2 id="dialog-heading">
                  {modal === 'new'
                    ? 'Create a brain'
                    : modal === 'fork'
                      ? 'Fork this brain'
                      : 'Brain settings'}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Close dialog"
                  onClick={() => setModal(null)}
                >
                  <X size={20} />
                </Button>
              </div>
              {modal === 'fork' && (
                <p>
                  Copies current sources and direction into an independent
                  brain. Future changes stay separate.{' '}
                  {cloudEnabled
                    ? 'Cloud connection discovery is not running yet.'
                    : 'Connections are recalculated.'}
                </p>
              )}
              {modal !== 'settings' && (
                <label>
                  Name
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Astrology research"
                  />
                </label>
              )}
              <label>
                Direction
                <textarea
                  maxLength={4000}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  placeholder="What should this brain focus on?"
                />
              </label>
              {modal === 'settings' && (
                <>
                  <label>
                    Total job allowance
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      required
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                    />
                  </label>
                  <p className="fine">
                    {brain?.cycles_used} used. Local jobs do not consume model
                    tokens. Direction is stored for future reasoning adapters;
                    the baseline compares terminology.
                  </p>
                </>
              )}
              <div className="row end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy
                    ? 'Saving…'
                    : modal === 'settings'
                      ? 'Save settings'
                      : modal === 'fork'
                        ? 'Create independent fork'
                        : 'Create brain'}
                </Button>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </form>
          </dialog>
        </div>
      )}
    </div>
  );
}
