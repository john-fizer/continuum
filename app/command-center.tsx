'use client';
import { useState } from 'react';
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Network,
  Plus,
  Search,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { KnowledgeGraph } from './knowledge-graph';
import { cloudEnabled } from './cloud/client';
type Source = {
  id: string;
  title: string;
  body: string;
  origin: string;
  created: number;
};
type Link = {
  id: string;
  source_a: string;
  source_b: string;
  status: string;
  terms: string[];
};
type Result = {
  answer: string;
  citations: { source_id: string; title: string; excerpt: string }[];
};
type Data = {
  sources: Source[];
  links: Link[];
  jobs: { id: string; kind: string; status: string; result: string }[];
  state: string;
  brain: { name: string; active: number };
  pending: number;
  worker_connected?: boolean;
};
export function CommandCenter({
  data,
  onRead,
  onImport,
  onCapture,
  onAsk,
  onPause,
}: {
  data: Data | null;
  onRead: (id: string) => void;
  onImport: () => void;
  onCapture: (title: string, body: string) => Promise<void>;
  onAsk: (query: string) => Promise<Result>;
  onPause: () => void;
}) {
  const [focusId, setFocusId] = useState(''),
    [filter, setFilter] = useState('All'),
    [search, setSearch] = useState(''),
    [capturing, setCapturing] = useState(false),
    [draft, setDraft] = useState(''),
    [query, setQuery] = useState(''),
    [answer, setAnswer] = useState<Result | null>(null),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const sources = data?.sources || [],
    links = data?.links || [],
    focused = sources.find((s) => s.id === focusId) || sources[0];
  const indexed = sources.filter((s) =>
    (s.title + ' ' + s.body).toLowerCase().includes(search.toLowerCase()),
  );
  const visible = sources.filter(
    (s) =>
      filter === 'All' ||
      (filter === 'Files'
        ? s.origin.startsWith('file:')
        : !s.origin.startsWith('file:')),
  );
  const index = Math.max(
    0,
    indexed.findIndex((s) => s.id === focused?.id),
  );
  async function work(fn: () => Promise<void>) {
    setWorking(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="command-center">
      <section className="command-panel command-graph">
        <div className="command-heading">
          <div>
            <h2>
              <Network />
              Knowledge graph
            </h2>
            <p>A living, evolving map of your mind</p>
          </div>
          <div className="command-actions">
            <button
              disabled={!data || data.worker_connected === false}
              onClick={onPause}
            >
              {data?.worker_connected === false
                ? 'Memory online'
                : data?.brain.active
                  ? 'Pause'
                  : 'Resume'}
            </button>
            <button
              aria-label="Capture a source"
              onClick={() => setCapturing(true)}
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
        <div className="graph-tabs">
          {['All', 'Notes', 'Files'].map((t) => (
            <button
              key={t}
              className={filter === t ? 'selected' : ''}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
          <span>{data?.state || 'Visual preview · memory offline'}</span>
        </div>
        <KnowledgeGraph
          embedded
          nodes={visible}
          links={links.filter(
            (l) =>
              visible.some((s) => s.id === l.source_a) &&
              visible.some((s) => s.id === l.source_b),
          )}
          select={setFocusId}
        />
        <div className="command-graph-status">
          <div>
            <span>
              Sources <b>{sources.length}</b>
            </span>
            <span>
              Connections <b>{links.length}</b>
            </span>
          </div>
          <span>
            {data
              ? data.worker_connected === false
                ? 'Saved sources · analysis not connected'
                : `${data.pending} jobs queued`
              : 'Decorative visualization · no knowledge loaded'}
          </span>
        </div>
      </section>
      <section className="command-panel command-index">
        <div className="command-heading">
          <div>
            <h2>
              <BookOpen />
              Source index
            </h2>
            <p>Notes. Ideas. Context. Always at hand.</p>
          </div>
        </div>
        <label className="index-search">
          <Search size={16} />
          <input
            aria-label="Search sources"
            placeholder="Search your sources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="source-deck">
          <div className="deck-ghost ghost-a" />
          <div className="deck-ghost ghost-b" />
          <article className="deck-card">
            <div className="deck-icon">
              <FileText size={33} />
            </div>
            <h3>{focused?.title || 'A home for every idea.'}</h3>
            <p>
              {focused
                ? focused.body.slice(0, 115)
                : 'Your notes become the starting points of a connected mind.'}
            </p>
            <span>
              {focused ? 'Original source' : 'Awaiting your first source'}
            </span>
            {focused && (
              <button onClick={() => onRead(focused.id)}>
                Read source <ChevronRight size={14} />
              </button>
            )}
          </article>
        </div>
        <div className="deck-navigation">
          <button
            aria-label="Previous source"
            disabled={indexed.length < 2}
            onClick={() =>
              setFocusId(
                indexed[(index - 1 + indexed.length) % indexed.length].id,
              )
            }
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {indexed.length
              ? `${index + 1} / ${indexed.length}`
              : 'No sources connected'}
          </span>
          <button
            aria-label="Next source"
            disabled={indexed.length < 2}
            onClick={() => setFocusId(indexed[(index + 1) % indexed.length].id)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {search && (
          <div className="index-results">
            {indexed.length ? (
              indexed.slice(0, 5).map((s) => (
                <button key={s.id} onClick={() => setFocusId(s.id)}>
                  {s.title}
                </button>
              ))
            ) : (
              <p>No matching sources.</p>
            )}
          </div>
        )}
      </section>
      <section className="command-panel command-context">
        <div className="command-heading">
          <h2>
            <Network />
            Selected node
          </h2>
        </div>
        <div className="context-body">
          <div className="context-orb" aria-hidden="true" />
          <div>
            <h3>{focused?.title || 'Your second brain'}</h3>
            <p>
              {focused
                ? 'Source context and evidence'
                : 'Capture a thought. Give it somewhere to grow.'}
            </p>
          </div>
        </div>
        <div className="context-tabs">
          <span>Overview</span>
          <span>{focused?.origin || 'Independent memory'}</span>
        </div>
        <p className="context-excerpt">
          {focused
            ? focused.body.slice(0, 230)
            : 'Select a node to explore its original source and connections. Names appear when you hover or focus a node.'}
        </p>
        {focused && (
          <button className="context-read" onClick={() => onRead(focused.id)}>
            Open original source
          </button>
        )}
      </section>
      <section className="command-panel command-captures">
        <div className="command-heading">
          <h2>
            <Activity />
            Recent captures
          </h2>
          <button aria-label="Add a note" onClick={() => setCapturing(true)}>
            <Plus size={16} />
          </button>
        </div>
        {sources.length ? (
          sources.slice(0, 3).map((s) => (
            <button
              className="capture-line"
              key={s.id}
              onClick={() => {
                setFocusId(s.id);
                onRead(s.id);
              }}
            >
              <FileText size={17} />
              <span>
                <strong>{s.title}</strong>
                <small>
                  {new Date(s.created * 1000).toLocaleDateString()} · {s.origin}
                </small>
              </span>
            </button>
          ))
        ) : (
          <div className="capture-empty">
            <p>A thought, a conversation, a possibility.</p>
            <button onClick={() => setCapturing(true)}>
              <Plus size={15} />
              Capture a note
            </button>
            <button onClick={onImport}>
              <Upload size={15} />
              Import sources
            </button>
          </div>
        )}
      </section>
      <section className="command-panel command-insights">
        <div className="command-heading">
          <h2>
            <Sparkles />
            Insights
          </h2>
        </div>
        {links.filter((l) => l.status !== 'dismissed').length ? (
          links
            .filter((l) => l.status !== 'dismissed')
            .slice(0, 3)
            .map((l) => (
              <button
                className="insight-line"
                key={l.id}
                onClick={() => setFocusId(l.source_a)}
              >
                <Sparkles size={19} />
                <span>
                  Possible connection
                  <small>{l.terms.slice(0, 4).join(' · ')}</small>
                </span>
              </button>
            ))
        ) : (
          <div className="insight-empty">
            <Sparkles />
            <p>Connections begin with curiosity.</p>
            <small>
              Evidence-backed associations will appear here as your knowledge
              grows.
            </small>
          </div>
        )}
      </section>
      <section className="command-panel command-ask">
        <div className="command-heading">
          <h2>
            <Search />
            Ask Continuum
          </h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void work(async () => setAnswer(await onAsk(query)));
          }}
        >
          <label className="sr-only" htmlFor="command-query">
            Ask your sources
          </label>
          <input
            id="command-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What would you like to explore?"
          />
          <button
            type="submit"
            disabled={!data || working || !query.trim()}
            aria-label="Search your knowledge"
          >
            <Send size={18} />
          </button>
        </form>
        {answer ? (
          <div className="command-answer">
            <p>{answer.answer}</p>
            {answer.citations.map((c) => (
              <button key={c.source_id} onClick={() => onRead(c.source_id)}>
                <strong>{c.title}</strong>
                {c.excerpt}
              </button>
            ))}
          </div>
        ) : (
          <div className="question-starters">
            {[
              'Find connections across my notes.',
              'What have I captured about feedback?',
              'Show me sources about learning.',
            ].map((q) => (
              <button key={q} onClick={() => setQuery(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {!data && (
          <small className="cloud-status">
            {cloudEnabled
              ? 'Sign in and create a brain to save sources. Local notes stay on your computer until imported.'
              : 'Memory connection pending. Your local notes remain on your computer.'}
          </small>
        )}
      </section>
      {error && (
        <p className="command-error" role="alert">
          {error}
        </p>
      )}
      {capturing && (
        <dialog
          ref={(node) => {
            if (node && !node.open) node.showModal();
          }}
          onCancel={() => setCapturing(false)}
          className="command-capture-dialog"
          aria-labelledby="capture-heading"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void work(async () => {
                await onCapture(
                  draft.trim().split('\n')[0].slice(0, 80),
                  draft,
                );
                setDraft('');
                setCapturing(false);
              });
            }}
          >
            <div className="command-heading">
              <h2 id="capture-heading">Capture a thought</h2>
              <button
                type="button"
                aria-label="Close capture"
                onClick={() => setCapturing(false)}
              >
                <X />
              </button>
            </div>
            <label htmlFor="capture-draft">Observation or source text</label>
            <textarea
              id="capture-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What are you noticing?"
              autoFocus
            />
            <button type="submit" disabled={!data || working || !draft.trim()}>
              Save to this brain
            </button>
            {!data && (
              <p>
                {cloudEnabled
                  ? 'Sign in and create your first brain, then capture a thought.'
                  : 'Create a brain to capture your first thought.'}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </form>
        </dialog>
      )}
    </div>
  );
}
