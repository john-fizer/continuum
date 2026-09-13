'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Minus,
  Plus,
  RotateCcw,
  Pause,
  Play,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { Nova } from './supernova';
import type { AttentionSignal } from './attention/events';
import { createScene } from './neural-model.mjs';
type Source = { id: string; title: string };
type Link = { source_a: string; source_b: string; status: string };
export function KnowledgeGraph({
  nodes,
  links,
  select,
  embedded = false,
  attentionMode = false,
  activatedIds = [],
  focusId,
  signal,
}: {
  nodes: Source[];
  links: Link[];
  select: (id: string) => void;
  embedded?: boolean;
  attentionMode?: boolean;
  activatedIds?: string[];
  focusId?: string;
  signal?: AttentionSignal;
}) {
  const [zoom, setZoom] = useState(1),
    [paused, setPaused] = useState(false),
    [available, setAvailable] = useState(true),
    [expanded, setExpanded] = useState(false),
    [cinematic, setCinematic] = useState(false),
    [renderState, setRenderState] = useState('Preparing 3D scene');
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null),
    buttons = useRef(new Map<string, HTMLButtonElement>()),
    engine = useRef<Nova | null>(null);
  const controls = useRef({
    zoom,
    paused,
    cinematic,
    attentionMode,
    activatedIds,
    focusId,
    signal,
  });
  const signature = JSON.stringify({
    nodes: nodes.map((n) => ({ id: n.id, title: n.title })),
    links,
    focusId,
  });
  const scene = useMemo(() => {
    const input = JSON.parse(signature);
    const next = createScene(input.nodes, input.links);
    if (attentionMode && next.nodes.length) {
      const total = next.nodes.length;
      next.nodes.forEach((node: Source & { x: number; y: number; phase: number }, index: number) => {
        const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
        const radius = total === 1 ? 145 : 162;
        node.x = Math.cos(angle) * radius;
        node.y = Math.sin(angle) * radius * 0.78;
        node.phase = index * 1.618;
      });
    }
    const focused = next.nodes.find((n: Source) => n.id === input.focusId);
    if (focused) {
      focused.x = 0;
      focused.y = 0;
      focused.phase = 0;
    }
    return next;
  }, [signature, attentionMode]);
  useEffect(() => {
    controls.current = {
      zoom,
      paused,
      cinematic,
      attentionMode,
      activatedIds,
      focusId,
      signal,
    };
    engine.current?.update(controls.current);
  }, [zoom, paused, cinematic, attentionMode, activatedIds, focusId, signal]);
  useEffect(() => {
    let disposed = false;
    const element = canvas.current,
      container = host.current;
    if (!element || !container) return;
    void import('./supernova')
      .then(({ mountSupernova }) => {
        if (disposed) return;
        try {
          engine.current = mountSupernova(
            element,
            container,
            scene,
            buttons.current,
            controls.current,
            setRenderState,
          );
          setAvailable(true);
        } catch (error) {
          console.error('3D scene could not start', error);
          setAvailable(false);
          setRenderState('3D unavailable');
        }
      })
      .catch(() => {
        if (!disposed) {
          setAvailable(false);
          setRenderState('3D unavailable');
        }
      });
    return () => {
      disposed = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [scene]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const exit = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
      if (e.key === 'Tab') {
        const targets = Array.from(
          host.current?.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ) || [],
        ).filter((button) => getComputedStyle(button).visibility !== 'hidden');
        const first = targets[0],
          last = targets[targets.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', exit);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', exit);
    };
  }, [expanded]);
  return (
    <section className={embedded ? 'graph-scene' : 'loop-panel graph-panel'}>
      {!embedded && (
        <div className="section-heading">
          <div>
            <h2>Living knowledge graph</h2>
            <p className="graph-subtitle">Explore the connections</p>
          </div>
          <span className="tag">
            {nodes.length ? 'Source network' : 'Procedural preview'}
          </span>
        </div>
      )}
      <div
        ref={host}
        className={`graph-canvas living-canvas nova-canvas ${expanded ? 'nova-expanded' : ''} ${!available ? 'nova-fallback' : ''}`}
      >
        <canvas ref={canvas} aria-hidden="true" />
        <div className="graph-tools">
          <button
            aria-label="Zoom in"
            disabled={zoom >= 1.6}
            onClick={() => setZoom((v) => Math.min(1.6, v + 0.2))}
          >
            <Plus size={17} />
          </button>
          <button
            aria-label="Zoom out"
            disabled={zoom <= 0.6}
            onClick={() => setZoom((v) => Math.max(0.6, v - 0.2))}
          >
            <Minus size={17} />
          </button>
          <button aria-label="Reset view" onClick={() => setZoom(1)}>
            <RotateCcw size={15} />
          </button>
          <button
            aria-label={paused ? 'Resume graph motion' : 'Pause graph motion'}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>
        {scene.nodes.map((n: Source) => (
          <button
            key={n.id}
            ref={(el) => {
              if (el) buttons.current.set(n.id, el);
              else buttons.current.delete(n.id);
            }}
            className={`living-node ${activatedIds.includes(n.id) ? 'activated' : ''} ${focusId === n.id ? 'selected' : ''}`}
            aria-label={`Read ${n.title}`}
            onClick={() => {
              setExpanded(false);
              select(n.id);
            }}
          >
            <span className="living-label">{n.title}</span>
          </button>
        ))}
        <div className="nova-options">
          <button
            className="nova-quality"
            aria-label="Cinematic rendering quality"
            aria-pressed={cinematic}
            onClick={() => setCinematic((v) => !v)}
          >
            {cinematic ? 'Cinematic' : 'Auto quality'}
          </button>
          <button
            aria-label={expanded ? 'Exit expanded graph' : 'Expand graph'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
        {!available && (
          <p className="canvas-unavailable">
            3D graphics are unavailable. Try a browser with WebGL 2 enabled;
            your sources remain available in Knowledge.
          </p>
        )}
        <div className="graph-legend">
          <span>
            <i />
            {nodes.length
              ? `${Math.min(nodes.length, 120)} sources`
              : 'Procedural preview · no knowledge loaded'}
          </span>
          <span>
            {renderState} · {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>
      <p className="fine graph-footnote">
        {nodes.length
          ? 'Hover or focus a node to reveal its name; select to read its source. Light pulses are visual, not proof of new knowledge.'
          : 'Procedural branches and particles demonstrate motion; they are not stored knowledge.'}
        {nodes.length > 120 ? ' Showing the first 120 sources.' : ''}
      </p>
    </section>
  );
}
