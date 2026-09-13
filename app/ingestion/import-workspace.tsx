'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, FileText, Upload, Download } from 'lucide-react';
import { readFile } from './read-file';
import { markDuplicates } from './parse.mjs';
import { api as request } from '../api';
import { cloudEnabled } from '../cloud/client';
type Brain = { id: string; name: string };
type Row = {
  id: string;
  title: string;
  body: string;
  origin: string;
  metadata: Record<string, unknown>;
  warnings: string[];
  hash: string;
  selected: boolean;
  state: string;
  source_id?: string;
  detail?: string;
};
export function ImportWorkspace({
  brains,
  activeId,
  onSaved,
}: {
  brains: Brain[];
  activeId: string;
  onSaved: () => Promise<void>;
}) {
  const [destination, setDestination] = useState(''),
    [rows, setRows] = useState<Row[]>([]),
    [known, setKnown] = useState<string[]>([]),
    [preview, setPreview] = useState(''),
    [errors, setErrors] = useState<string[]>([]),
    [progress, setProgress] = useState(''),
    [working, setWorking] = useState(false),
    [checking, setChecking] = useState(false);
  const picker = useRef<HTMLInputElement>(null),
    stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const target = destination || activeId;
  const saved = rows.some((r) => r.source_id);
  const selected = rows.find((r) => r.id === preview) || rows[0];
  const seen = new Set(known);
  const duplicates = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.hash)) duplicates.add(row.id);
    seen.add(row.hash);
  }
  const ready = rows.filter(
    (r) => r.selected && !duplicates.has(r.id) && !r.source_id,
  );
  useEffect(() => {
    if (!target) return;
    let active = true;
    queueMicrotask(() => setChecking(true));
    void request<{ sources: { hash: string }[] }>(`brains/${target}`)
      .then((data) => {
        if (active) setKnown(data.sources.map((s) => s.hash));
      })
      .catch(() => {
        if (active) setKnown([]);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [target]);
  const savedIds = JSON.stringify(
    rows.flatMap((r) => (r.source_id ? [r.source_id] : [])),
  );
  useEffect(() => {
    const ids = JSON.parse(savedIds) as string[];
    if (!target || !ids.length || working) return;
    let active = true;
    const poll = async () => {
      try {
        const statuses = await request<
          { source_id: string; status: string; detail: string }[]
        >(`brains/${target}/import-status`, { source_ids: ids });
        if (active)
          setRows((old) =>
            old.map((row) => {
              const s = statuses.find((v) => v.source_id === row.source_id);
              return s ? { ...row, state: s.status, detail: s.detail } : row;
            }),
          );
      } catch {
        /* The saved source IDs remain available for retry after reconnection. */
      }
    };
    void poll();
    const timer = setInterval(poll, cloudEnabled ? 15000 : 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [target, working, savedIds]);
  async function load(files: FileList | null) {
    if (!files) return;
    setWorking(true);
    setErrors([]);
    try {
      const documents = [];
      const failures = [];
      for (const file of Array.from(files).slice(0, 30)) {
        setProgress(`Reading ${file.name}`);
        try {
          const batch = await readFile(file, setProgress);
          if (!batch.length) throw new Error('The file contains no text.');
          if (rows.length + documents.length + batch.length > 500)
            throw new Error(
              'This selection exceeds 500 items. Import a smaller batch.',
            );
          documents.push(...batch);
        } catch (e) {
          failures.push(
            `${file.name}: ${e instanceof Error ? e.message : 'Could not read file'}`,
          );
        }
      }
      if (files.length > 30)
        failures.push(
          'Only the first 30 files were read. Add the remaining files in another batch.',
        );
      const parsed = await markDuplicates(documents, []);
      setRows((old) => [
        ...old,
        ...parsed.map((r) => ({
          ...r,
          id: crypto.randomUUID(),
          selected: true,
          state: 'ready',
        })),
      ]);
      setErrors(failures);
      setProgress(
        `${parsed.length} items prepared. Nothing has been saved yet.`,
      );
    } finally {
      setWorking(false);
      if (picker.current) picker.current.value = '';
    }
  }
  async function save() {
    if (!target || !ready.length) return;
    const items = [...ready],
      brainId = target;
    stop.current = false;
    setWorking(true);
    setErrors([]);
    try {
      for (let i = 0; i < items.length; i++) {
        if (stop.current) break;
        const row = items[i];
        setProgress(`Saving ${i + 1} of ${items.length}: ${row.title}`);
        setRows((old) =>
          old.map((r) => (r.id === row.id ? { ...r, state: 'saving' } : r)),
        );
        try {
          const result = await request<{ source_id: string; status: string }>(
            `brains/${brainId}/imports`,
            {
              title: row.title,
              body: row.body,
              origin: row.origin,
              metadata: row.metadata,
            },
          );
          setRows((old) =>
            old.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    source_id: result.source_id,
                    state:
                      result.status === 'duplicate'
                        ? 'already saved'
                        : cloudEnabled
                          ? 'saved'
                          : 'queued',
                    selected: false,
                  }
                : r,
            ),
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Save failed';
          setRows((old) =>
            old.map((r) =>
              r.id === row.id ? { ...r, state: 'failed', detail: message } : r,
            ),
          );
          setErrors((old) => [...old, `${row.title}: ${message}`]);
          stop.current = true;
        }
      }
      setProgress(
        stop.current
          ? 'Import stopped. Saved items remain saved; unsaved items can be retried.'
          : cloudEnabled
            ? 'Sources saved to private cloud memory. Automatic analysis is not connected yet.'
            : 'Sources saved. Background source scans are queued.',
      );
      try {
        await onSaved();
      } catch {
        setErrors((old) => [
          ...old,
          'Sources were saved, but the workspace could not refresh.',
        ]);
      }
    } finally {
      setWorking(false);
    }
  }
  function download() {
    const docs = ready;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: 'continuum-import-v1',
              documents: docs.map(({ title, body, origin, metadata }) => ({
                title,
                body,
                origin,
                metadata,
              })),
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'continuum-prepared-import.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="import-workspace">
      <section className="import-intake command-panel">
        <div className="command-heading">
          <h2>
            <Upload />
            Bring your knowledge in
          </h2>
        </div>
        <p>
          ChatGPT conversations, Markdown, text, and PDFs. Preview first, then
          choose what belongs in this brain.
        </p>
        <div className="import-controls">
          <button disabled={working} onClick={() => picker.current?.click()}>
            <Upload size={17} />
            Choose files
          </button>
          <label>
            Destination brain
            <select
              value={target}
              disabled={working || saved}
              onChange={(e) => {
                setDestination(e.target.value);
                setKnown([]);
              }}
            >
              {!brains.length && (
                <option value="">Connect a brain to save</option>
              )}
              {brains.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!ready.length || working} onClick={download}>
            <Download size={16} />
            Download prepared import
          </button>
        </div>
        <p className="fine">
          Files are parsed on this device. Preview text stays in this tab until
          you save or download it. Leaving this view or refreshing clears
          unsaved previews. Up to 20 MB per file, 30 files and 500 items per
          batch. Unzip ChatGPT exports and choose conversations.json.
        </p>
        {!brains.length && (
          <p className="import-notice">
            Create a brain to choose an import destination. You can preview
            files and download a prepared import for later; sign in before
            staging files you want to save to the cloud.
          </p>
        )}
        <input
          type="file"
          ref={picker}
          multiple
          hidden
          accept=".txt,.md,.markdown,.json,.pdf"
          onChange={(e) => void load(e.target.files)}
        />
      </section>
      {progress && <output className="import-progress">{progress}</output>}
      {errors.length > 0 && (
        <div className="import-errors" role="alert">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      <div className="import-review">
        <section className="command-panel import-list">
          <div className="command-heading">
            <h2>{rows.length} prepared items</h2>
            <button
              disabled={working || !rows.length}
              onClick={() => {
                setRows([]);
                setPreview('');
                setProgress('');
                setErrors([]);
              }}
            >
              Clear staging
            </button>
          </div>
          <div className="import-selection">
            <label>
              <input
                type="checkbox"
                checked={
                  ready.length > 0 &&
                  ready.length ===
                    rows.filter((r) => !duplicates.has(r.id) && !r.source_id)
                      .length
                }
                disabled={working || !rows.length}
                onChange={(e) =>
                  setRows((old) =>
                    old.map((r) => ({ ...r, selected: e.target.checked })),
                  )
                }
              />
              Select available
            </label>
            <span>{duplicates.size} duplicate matches</span>
          </div>
          <div className="import-items">
            {rows.map((row) => (
              <div
                className={`import-item ${selected?.id === row.id ? 'active' : ''}`}
                key={row.id}
              >
                <input
                  aria-label={`Import ${row.title}`}
                  type="checkbox"
                  checked={
                    row.selected && !duplicates.has(row.id) && !row.source_id
                  }
                  disabled={
                    working || duplicates.has(row.id) || !!row.source_id
                  }
                  onChange={(e) =>
                    setRows((old) =>
                      old.map((r) =>
                        r.id === row.id
                          ? { ...r, selected: e.target.checked }
                          : r,
                      ),
                    )
                  }
                />
                <button onClick={() => setPreview(row.id)}>
                  <strong>{row.title}</strong>
                  <small>
                    {row.source_id
                      ? `Source scan: ${row.state}`
                      : duplicates.has(row.id)
                        ? 'Duplicate — will be skipped'
                        : row.state === 'failed'
                          ? 'Save failed — retry available'
                          : `${row.body.length.toLocaleString()} characters · ${typeof row.metadata.format === 'string' ? row.metadata.format : 'text'}`}
                  </small>
                </button>
                {row.state === 'completed' && <Check size={15} />}
              </div>
            ))}
            {!rows.length && (
              <div className="empty">
                <FileText />
                <p>Choose files to inspect what will be imported.</p>
              </div>
            )}
          </div>
          <div className="import-save">
            <button
              disabled={!target || !ready.length || working || checking}
              onClick={() => void save()}
            >
              Save {ready.length} selected items
            </button>
            {working && (
              <button
                onClick={() => {
                  stop.current = true;
                }}
              >
                Stop after current item
              </button>
            )}
          </div>
          <p className="fine">
            Duplicate checks are scoped to the destination brain and this batch.
            Source scans run after saving; further connection analysis appears
            in Activity.
          </p>
        </section>
        <section className="command-panel import-preview">
          <div className="command-heading">
            <h2>Source preview</h2>
          </div>
          {selected ? (
            <>
              <h3>{selected.title}</h3>
              <dl>
                {Object.entries(selected.metadata)
                  .filter(([, v]) => v != null)
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replaceAll('_', ' ')}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
              </dl>
              {selected.warnings.map((w, i) => (
                <p className="import-notice" key={i}>
                  {w}
                </p>
              ))}
              {selected.detail && <p className="fine">{selected.detail}</p>}
              <pre>{selected.body}</pre>
            </>
          ) : (
            <p>
              Select an item to read the extracted text, dates, and provenance.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
