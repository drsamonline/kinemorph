import type { MoodId } from './model';

/**
 * Mood data is pure: tempo, scale, chord pool, drum palette. It lives in core so
 * the editor can render the mood picker without pulling the audio engine into
 * the initial bundle.
 */
export interface MoodDef {
  label: string;
  bpm: number;
  root: number;
  scale: number[];
  progression: number[][];
  drums: 'four' | 'big' | 'soft' | 'sparse' | 'none';
  arp: number;
  pad: number;
  swing: number;
}

export const MOODS: Record<MoodId, MoodDef> = {
  uplifting: { label: 'Uplifting', bpm: 116, root: 57, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4], [3, 5, 7], [4, 6, 1], [3, 5, 0]], drums: 'four', arp: 1, pad: 0.55, swing: 0 },
  calm: { label: 'Calm', bpm: 74, root: 53, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4], [3, 5, 0], [1, 3, 5], [3, 5, 0]], drums: 'none', arp: 0.7, pad: 0.75, swing: 0 },
  epic: { label: 'Epic', bpm: 96, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], progression: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], drums: 'big', arp: 1, pad: 0.6, swing: 0 },
  playful: { label: 'Playful', bpm: 132, root: 60, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4], [4, 6, 1], [3, 5, 0], [4, 6, 3]], drums: 'four', arp: 1.2, pad: 0.4, swing: 0.1 },
  tense: { label: 'Tense', bpm: 104, root: 45, scale: [0, 1, 4, 5, 7, 8], progression: [[0, 2, 4], [0, 3, 5], [1, 3, 5], [0, 2, 4]], drums: 'sparse', arp: 0.6, pad: 0.7, swing: 0 },
  lofi: { label: 'Lo-fi', bpm: 84, root: 55, scale: [0, 2, 3, 5, 7, 9, 10], progression: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [3, 5, 0]], drums: 'soft', arp: 0.9, pad: 0.6, swing: 0.16 },
  none: { label: 'Silent', bpm: 0, root: 57, scale: [0, 2, 4, 7, 9], progression: [[0, 2, 4]], drums: 'none', arp: 0, pad: 0, swing: 0 }
};

export const MOOD_LIST = Object.keys(MOODS) as MoodId[];
