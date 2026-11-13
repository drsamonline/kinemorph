import type { MotifId } from './model';

/**
 * Motifs are closed polygons in unit space (-1..1). Every motif is resampled to
 * the same point count so any motif can morph into any other: morphing is then
 * a straight lerp between two point arrays, which is what makes the transition
 * look like geometry rather than a crossfade.
 */

export interface Pt { x: number; y: number }

const TAU = Math.PI * 2;
export const MORPH_POINTS = 96;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function circlePts(n = 72, r = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return out;
}

function starPts(points: number, r1: number, r2: number, n = 72): Pt[] {
  const out: Pt[] = [];
  const segs = points * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const k = (i / n) * segs;
    const f = Math.abs(((k % 2) + 1) % 2);
    const rad = lerp(r2, r1, f);
    out.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  return out;
}

const polyPts = (arr: [number, number][]): Pt[] => arr.map(([x, y]) => ({ x, y }));

function blobPts(n: number, bumps: number, amp: number, base: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const r = base + amp * Math.cos(bumps * a);
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return out;
}

function heartPts(n = 72): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out.push({ x: x / 17, y: y / 17 });
  }
  return out;
}

function moonPts(n = 72): Pt[] {
  const out = circlePts(n);
  return out.map((p) => {
    const dx = p.x - 0.62;
    const dy = p.y + 0.18;
    const d = Math.hypot(dx, dy);
    if (d >= 0.92) return p;
    const s = 0.92 / (d || 1e-6);
    return { x: 0.62 + dx * s, y: -0.18 + dy * s };
  });
}

function treePts(n = 72): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const r = 0.92 + 0.1 * Math.cos(5 * a);
    const y = Math.sin(a) * r;
    let x = Math.cos(a) * r;
    if (y > 0.45) x *= clamp(1 - (y - 0.45) * 2.6, 0.18, 1);
    out.push({ x, y: y * 0.92 - 0.05 });
  }
  return out;
}

function bulbPts(n = 72): Pt[] {
  return circlePts(n).map((p) => {
    if (p.y <= 0.35) return p;
    const f = clamp(1 - (p.y - 0.35) * 1.9, 0.34, 1);
    return { x: p.x * f, y: p.y };
  });
}

const GENERATORS: Record<MotifId, () => Pt[]> = {
  sun: () => starPts(12, 1, 0.74),
  moon: moonPts,
  mountain: () => polyPts([[-1, 1], [-0.62, 0.05], [-0.3, 0.42], [0.05, -0.78], [0.42, 0.1], [0.66, -0.24], [1, 1]]),
  tree: treePts,
  city: () => polyPts([[-1, 1], [-1, -0.12], [-0.7, -0.12], [-0.7, -0.62], [-0.38, -0.62], [-0.38, 0.12], [-0.08, 0.12], [-0.08, -0.88], [0.22, -0.88], [0.22, -0.28], [0.54, -0.28], [0.54, -0.56], [0.84, -0.56], [0.84, 0.3], [1, 0.3], [1, 1]]),
  wave: () => {
    const out: Pt[] = [];
    const n = 30;
    for (let i = 0; i <= n; i++) {
      const x = -1 + (i / n) * 2;
      out.push({ x, y: -0.34 + 0.3 * Math.sin((x + 1) * Math.PI * 1.6) });
    }
    for (let i = n; i >= 0; i--) {
      const x = -1 + (i / n) * 2;
      out.push({ x, y: 0.42 + 0.3 * Math.sin((x + 1) * Math.PI * 1.6) });
    }
    return out;
  },
  cloud: () => blobPts(64, 5, 0.16, 0.72).map((p) => ({ x: p.x, y: p.y * 0.78 })),
  star: () => starPts(5, 1, 0.42),
  rocket: () => polyPts([[0, -1], [0.27, -0.34], [0.29, 0.36], [0.62, 0.62], [0.58, 0.96], [0.18, 0.72], [-0.18, 0.72], [-0.58, 0.96], [-0.62, 0.62], [-0.29, 0.36], [-0.27, -0.34]]),
  bulb: bulbPts,
  heart: heartPts,
  book: () => polyPts([[-1, 0.62], [-1, -0.5], [-0.12, -0.3], [0, -0.26], [0.12, -0.3], [1, -0.5], [1, 0.62], [0.12, 0.4], [0, 0.44], [-0.12, 0.4]]),
  planet: () => circlePts(64, 0.86),
  spiral: () => {
    const out: Pt[] = [];
    const n = 80;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU * 2.4;
      const r = 0.12 + (i / n) * 0.9;
      out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    for (let i = n - 1; i >= 0; i--) {
      const a = (i / n) * TAU * 2.4;
      const r = 0.12 + (i / n) * 0.9;
      out.push({ x: Math.cos(a) * (r - 0.11), y: Math.sin(a) * (r - 0.11) });
    }
    return out;
  }
};

export const MOTIF_LABELS: Record<MotifId, string> = {
  sun: 'Sun', moon: 'Moon', mountain: 'Mountain', tree: 'Tree', city: 'City',
  wave: 'Waves', cloud: 'Cloud', star: 'Star', rocket: 'Rocket', bulb: 'Idea',
  heart: 'Heart', book: 'Book', planet: 'Planet', spiral: 'Spiral'
};

function signedArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Resample a closed polygon to exactly n points, evenly spaced by arc length. */
export function resample(pts: Pt[], n: number): Pt[] {
  const N = pts.length;
  const cum: number[] = [0];
  let total = 0;
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % N];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cum.push(total);
  }
  if (total < 1e-6) total = 1;
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (j < N - 1 && cum[j + 1] < target) j++;
    const segLen = cum[j + 1] - cum[j] || 1e-6;
    const t = (target - cum[j]) / segLen;
    const p0 = pts[j];
    const p1 = pts[(j + 1) % N];
    out.push({ x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) });
  }
  return out;
}

function normalize(pts: Pt[], n: number): Pt[] {
  const p = pts.slice();
  if (signedArea(p) < 0) p.reverse();
  const r = resample(p, n);
  let best = 0;
  let bestY = Infinity;
  for (let i = 0; i < r.length; i++) {
    if (r[i].y < bestY - 1e-9) { bestY = r[i].y; best = i; }
  }
  return r.slice(best).concat(r.slice(0, best));
}

const cache = new Map<string, Pt[]>();

/** Normalised, morph-ready points for a motif. Cached — call freely per frame. */
export function motifPoints(id: MotifId, n = MORPH_POINTS): Pt[] {
  const key = `${id}:${n}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = normalize(GENERATORS[id](), n);
    cache.set(key, hit);
  }
  return hit;
}

export function morphPoints(a: MotifId, b: MotifId, t: number): Pt[] {
  const A = motifPoints(a);
  const B = motifPoints(b);
  const out: Pt[] = new Array(A.length);
  for (let i = 0; i < A.length; i++) {
    out[i] = { x: lerp(A[i].x, B[i].x, t), y: lerp(A[i].y, B[i].y, t) };
  }
  return out;
}
