import type { EaseId } from './model';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Spring easing, adapted from motion-kit (MIT, github.com/drsamonline/motion-kit).
 *
 * A damped harmonic oscillator pulled from 0 to 1. zeta is the damping ratio:
 * 1 is critical (no overshoot), below 1 overshoots and rings. omega is derived
 * the way motion-kit derives it — find when the unit spring comes to rest, then
 * scale so this one settles at `settleMs` — because otherwise the settle time
 * only stretches the curve instead of slowing the motion.
 *
 * This replaced a one-line `1 - cos(x * 1.5π) * exp(-5x)`, which looked like a
 * spring but had no damping ratio and did not settle where it claimed to.
 */
function springEase(zeta: number, settleMs: number): (t: number) => number {
  const wd = zeta < 1 ? Math.sqrt(1 - zeta * zeta) : 0;
  const unit = (t: number) =>
    zeta >= 1
      ? 1 - Math.exp(-t) * (1 + t)
      : 1 - Math.exp(-zeta * t) * (Math.cos(wd * t) + (zeta / wd) * Math.sin(wd * t));

  let last = 0;
  for (let t = 0; t < 40; t += 0.002) if (Math.abs(unit(t) - 1) > 0.001) last = t;
  const omega = last / (settleMs / 1000);

  return (p: number) => {
    const tt = clamp(p, 0, 1) * (settleMs / 1000);
    if (tt === 0) return 0;
    if (zeta >= 1) return 1 - Math.exp(-omega * tt) * (1 + omega * tt);
    const w = omega * wd;
    return 1 - Math.exp(-zeta * omega * tt) * (Math.cos(w * tt) + ((zeta * omega) / w) * Math.sin(w * tt));
  };
}

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
  spring: springEase(0.62, 900),
  springSoft: springEase(0.85, 1100)
};

export const EASE_LIST = Object.keys(EASES) as EaseId[];
