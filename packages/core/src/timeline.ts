import type { Project, Scene, TransitionId } from './model';

/**
 * Time is the only clock in the system. The renderer never advances itself —
 * it is handed a project and a time and asked for a frame. That is what makes
 * the editor scrub, the preview loop and the frame-by-frame export share one
 * code path.
 */

export interface Cue {
  index: number;
  scene: Scene;
  start: number;
  end: number;
}

export interface Frame {
  cue: Cue;
  local: number;
  /** Scene being transitioned into, if we are inside a transition window. */
  next: Cue | null;
  /** 0..1 through the transition, or null when not transitioning. */
  transitionProgress: number | null;
  transition: TransitionId;
  /** Seconds the transition occupies at the end of the current scene. */
  transitionDuration: number;
}

const MIN_DUR = 1;

export function sceneDuration(scene: Scene): number {
  return Math.max(MIN_DUR, scene.dur);
}

export function buildCues(project: Project): Cue[] {
  let cursor = 0;
  return project.scenes.map((scene, index) => {
    const start = cursor;
    const end = start + sceneDuration(scene);
    cursor = end;
    return { index, scene, start, end };
  });
}

export function totalDuration(project: Project): number {
  return project.scenes.reduce((sum, s) => sum + sceneDuration(s), 0);
}

export function transitionLength(scene: Scene): number {
  return Math.min(0.9, sceneDuration(scene) * 0.45);
}

/** Which scene (and how far through a transition) a global time lands on. */
export function resolveFrame(project: Project, time: number): Frame | null {
  const cues = buildCues(project);
  if (!cues.length) return null;
  const t = Math.max(0, Math.min(time, totalDuration(project) - 1e-4));

  let cue = cues[cues.length - 1];
  for (const c of cues) {
    if (t < c.end) { cue = c; break; }
  }

  const local = t - cue.start;
  const next = cues[cue.index + 1] ?? null;
  const transition = cue.scene.transition;
  const duration = transitionLength(cue.scene);
  const inTransition = next !== null && transition !== 'none' && local > sceneDuration(cue.scene) - duration;

  return {
    cue,
    local,
    next: inTransition ? next : null,
    transitionProgress: inTransition
      ? Math.max(0, Math.min(1, (local - (sceneDuration(cue.scene) - duration)) / duration))
      : null,
    transition,
    transitionDuration: duration
  };
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return `${m}:${rest < 10 ? '0' : ''}${rest}`;
}
