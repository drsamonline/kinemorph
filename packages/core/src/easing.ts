import type { EaseId } from './model';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export const EASES: Record<EaseId, (t: number) => number> = {
  linear: (t) => clamp(t, 0, 1),
  out: (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3),
  inOut: (t) => {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  },
  back: (t) => {
    const x = clamp(t, 0, 1);
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  },
  expo: (t) => {
    const x = clamp(t, 0, 1);
    if (x === 0) return 0;
    if (x === 1) return 1;
    return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
  },
  elastic: (t) => {
    const x = clamp(t, 0, 1);
    if (x === 0 || x === 1) return x;
    return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  bounce: (t) => {
    const x = clamp(t, 0, 1);
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) { const y = x - 1.5 / d1; return n1 * y * y + 0.75; }
    if (x < 2.5 / d1) { const y = x - 2.25 / d1; return n1 * y * y + 0.9375; }
    const y = x - 2.625 / d1;
    return n1 * y * y + 0.984375;
  },
  spring: (t) => {
    const x = clamp(t, 0, 1);
    return 1 - Math.cos(x * Math.PI * 1.5) * Math.exp(-x * 5);
  }
};

export const EASE_LIST = Object.keys(EASES) as EaseId[];
