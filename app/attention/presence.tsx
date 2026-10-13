import { useMemo, type CSSProperties } from 'react';

export type PresencePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

const copy: Record<PresencePhase, string> = {
  idle: 'Present',
  listening: 'Listening',
  thinking: 'Synthesizing',
  speaking: 'Speaking',
};

export function EmbodiedPresence({
  phase,
  energy,
  spectrum,
}: {
  phase: PresencePhase;
  energy: number;
  spectrum: number[];
}) {
  const bands = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const source = spectrum.length ? spectrum[Math.floor(index / 18 * spectrum.length)] || 0 : 0;
    return Math.min(1, Math.max(0.08, source * 2.2 + energy * .65));
  }), [energy, spectrum]);
  const intensity = Math.min(1, Math.max(.08, energy));

  return (
    <aside className={`embodied-presence phase-${phase}`} aria-label={`Continuum presence: ${copy[phase]}`}>
      <div className="presence-status"><span /><strong>{copy[phase]}</strong></div>
      <svg viewBox="0 0 300 390" role="img" aria-label="An abstract holographic Continuum body responding to conversation" style={{ '--presence-energy': intensity } as CSSProperties}>
        <defs>
          <radialGradient id="presence-core" cx="50%" cy="45%">
            <stop offset="0" stopColor="#fff8de" />
            <stop offset=".22" stopColor="#f7b66b" />
            <stop offset=".55" stopColor="#76e7ef" stopOpacity=".72" />
            <stop offset="1" stopColor="#58cde5" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="presence-flow" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#82eff9" stopOpacity=".18" />
            <stop offset=".48" stopColor="#ffd187" stopOpacity=".9" />
            <stop offset="1" stopColor="#9c83ff" stopOpacity=".24" />
          </linearGradient>
          <filter id="presence-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g className="presence-rings" fill="none" stroke="url(#presence-flow)">
          <ellipse cx="150" cy="144" rx="66" ry="29" /><ellipse cx="150" cy="144" rx="28" ry="68" /><ellipse cx="150" cy="144" rx="57" ry="48" transform="rotate(47 150 144)" />
        </g>
        <path className="presence-silhouette" d="M151 44c-39 0-66 28-66 68 0 26 10 43 25 55-28 18-51 48-63 95 27-20 57-32 103-32s77 12 103 32c-12-47-35-77-63-95 15-12 25-29 25-55 0-40-27-68-65-68Z" />
        <path className="presence-filament" d="M49 262c37-35 58-76 74-120 12 62 1 113-33 158M251 262c-37-35-58-76-74-120-12 62-1 113 33 158M80 299c27-31 47-52 70-80 20 27 41 50 70 80" />
        <circle className="presence-core" cx="150" cy="144" r="55" fill="url(#presence-core)" />
        <circle className="presence-spark" cx="150" cy="144" r="6" filter="url(#presence-glow)" />
        <g className="presence-spectrum" transform="translate(60 337)">
          {bands.map((band, index) => <rect key={index} x={index * 10} y={18 - band * 18} width="4" height={band * 18} rx="2" />)}
        </g>
      </svg>
      <p>The body mirrors the active conversation. Your memory and evidence remain in Continuum.</p>
    </aside>
  );
}
