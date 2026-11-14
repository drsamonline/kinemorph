import type { MoodId } from './model';
import { MOODS } from './moods';

/**
 * A score plan derived from a seed.
 *
 * Two shows made with the same mood should not sound identical, so the seed
 * decides more than the note order: it picks the timbre band, which sets the
 * oscillator shapes, filter cutoff, reverb size and how busy the drums are.
 * Same idea as Kinemotif's bands, ported so both products share the vocabulary.
 */
export const TIMBRE_BANDS = ['glass', 'warm', 'grit', 'chip', 'deep', 'bright'] as const;
export type TimbreBand = (typeof TIMBRE_BANDS)[number];

export interface ScorePlan {
  seed: number;
  band: TimbreBand;
  bpm: number;
  rootShift: number;
  density: number;
  padWave: 'triangle' | 'sine' | 'sawtooth' | 'square';
  pluckWave: 'triangle' | 'sine' | 'sawtooth' | 'square';
  bassWave: 'sine' | 'sawtooth' | 'square' | 'triangle';
  cutoff: number;
  reverbWet: number;
  drumGain: number;
}

/** mulberry32 — the same generator the rest of the fleet uses. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WAVES = {
  glass: { pad: 'sine', pluck: 'triangle', bass: 'sine', cutoff: 7200, wet: 0.42, drums: 0.6 },
  warm: { pad: 'triangle', pluck: 'triangle', bass: 'sine', cutoff: 2600, wet: 0.3, drums: 0.85 },
  grit: { pad: 'sawtooth', pluck: 'square', bass: 'sawtooth', cutoff: 1800, wet: 0.22, drums: 1 },
  chip: { pad: 'square', pluck: 'square', bass: 'square', cutoff: 5200, wet: 0.12, drums: 0.9 },
  deep: { pad: 'sine', pluck: 'sine', bass: 'triangle', cutoff: 1200, wet: 0.5, drums: 0.55 },
  bright: { pad: 'triangle', pluck: 'sawtooth', bass: 'square', cutoff: 4200, wet: 0.26, drums: 0.8 }
} as const;

export function planScore(moodId: MoodId, seed: number): ScorePlan {
  const mood = MOODS[moodId];
  const rand = seededRandom(seed || 1);
  const band = TIMBRE_BANDS[Math.floor(rand() * TIMBRE_BANDS.length)];
  const w = WAVES[band];

  return {
    seed,
    band,
    bpm: Math.max(40, Math.round((mood?.bpm ?? 100) * (0.94 + rand() * 0.12))),
    rootShift: Math.floor(rand() * 7) - 3,
    density: 0.72 + rand() * 0.42,
    padWave: w.pad as ScorePlan['padWave'],
    pluckWave: w.pluck as ScorePlan['pluckWave'],
    bassWave: w.bass as ScorePlan['bassWave'],
    cutoff: w.cutoff,
    reverbWet: w.wet,
    drumGain: w.drums
  };
}

export function describePlan(plan: ScorePlan): string {
  return `${plan.band} · ${plan.bpm} BPM · seed ${plan.seed}`;
}
