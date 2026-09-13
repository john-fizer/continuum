export const COLORS = [
  '#60caff',
  '#d8b0ff',
  '#efbc72',
  '#ee8ac3',
  '#69daca',
  '#80afff',
];
export function hash(value) {
  let h = 2166136261;
  for (const c of value) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let n = seed;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function createScene(sources, links) {
  const nodes = sources.slice(0, 120).map((s) => {
    const h = hash(s.id),
      r = rng(h),
      angle = ((h % 6) * Math.PI) / 3 - 0.7 + (r() - 0.5) * 0.6,
      radius = 170 + r() * 110;
    return {
      ...s,
      x: Math.cos(angle) * radius * 1.22,
      y: Math.sin(angle) * radius * 0.86,
      phase: r() * Math.PI * 2,
      color: COLORS[h % 6],
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = links.filter(
    (l) =>
      l.status !== 'dismissed' && ids.has(l.source_a) && ids.has(l.source_b),
  );
  const branches = [];
  for (let arm = 0; arm < 6; arm++) {
    const random = rng(arm * 7253 + 85),
      base = (arm * Math.PI) / 3 - 0.6;
    function grow(x, y, angle, length, depth) {
      const endX = x + Math.cos(angle) * length * 1.27,
        endY = y + Math.sin(angle) * length * 0.9;
      branches.push({
        x,
        y,
        endX,
        endY,
        depth,
        phase: random() * 6.28,
        color: COLORS[arm],
      });
      if (depth > 0) {
        grow(
          endX,
          endY,
          angle + (random() - 0.45) * 0.85,
          length * 0.73,
          depth - 1,
        );
        grow(
          endX,
          endY,
          angle - (0.25 + random() * 0.65),
          length * 0.69,
          depth - 1,
        );
      }
    }
    grow(Math.cos(base) * 42, Math.sin(base) * 42, base, 78, 6);
  }
  const random = rng(87),
    stars = Array.from({ length: 380 }, () => ({
      x: (random() - 0.5) * 850,
      y: (random() - 0.5) * 550,
      phase: random() * 6.28,
      r: random() * 1.3 + 0.3,
    }));
  return { nodes, edges, branches, stars, preview: nodes.length === 0 };
}
export function projectNode(n, time, width, height, zoom = 1, reduced = false) {
  const t = reduced ? 0 : time,
    scale = Math.min(width / 800, height / 540) * zoom,
    r = Math.hypot(n.x, n.y),
    breath = 1 + 0.022 * Math.sin(t * 0.9);
  return {
    x:
      width / 2 +
      (n.x * breath + Math.sin(t * 0.57 + n.phase) * Math.min(5, r * 0.024)) *
        scale,
    y:
      height / 2 +
      (n.y * breath + Math.cos(t * 0.61 + n.phase) * Math.min(5, r * 0.024)) *
        scale,
  };
}
