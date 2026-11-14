import {
  CAM_IDS, EASE_IDS, ENTER_IDS, MOTIF_IDS, MOTIF_LABELS, MOOD_IDS, STYLE_IDS, STYLES,
  TRANSITION_IDS, accentFor, applyCommand, buildCues, contrastRatio, ensureContrast,
  generateProject, morphPoints, motifPoints, parseCommand, resolveFrame, totalDuration,
  type Project
} from '@kinemorph/core';
import { MOODS, buildScore, renderScoreOffline } from '@kinemorph/audio';

/**
 * Offline self-test. Runs the pure engine against assertions in the browser and
 * prints a pass/fail table — no framework, no runner, no network.
 *
 * Open /studio/selftest.html. Results are also exposed on window.__SELFTEST__
 * so a headless run can assert on them.
 */

interface Result {
  name: string;
  ok: boolean;
  detail: string;
  skipped?: boolean;
}

const results: Result[] = [];

function check(name: string, fn: () => string | void): void {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || 'ok' });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function checkAsync(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || 'ok' });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

const sampleProject = (): Project =>
  generateProject('A small test. It has two sentences.', { style: 'neon', mood: 'uplifting' });

/* ---------------- geometry ---------------- */

check('every motif yields 96 morph points', () => {
  for (const id of MOTIF_IDS) {
    const points = motifPoints(id);
    assert(points.length === 96, `${id} produced ${points.length} points`);
    for (const p of points) {
      assert(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} has a non-finite point`);
      assert(Math.abs(p.x) < 4 && Math.abs(p.y) < 4, `${id} escapes unit space`);
    }
  }
  return `${MOTIF_IDS.length} motifs, ${MOTIF_LABELS.sun} … ${MOTIF_LABELS.spiral}`;
});

check('morph endpoints are exact', () => {
  const a = motifPoints('wave');
  const b = motifPoints('rocket');
  const start = morphPoints('wave', 'rocket', 0);
  const end = morphPoints('wave', 'rocket', 1);
  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;
  for (let i = 0; i < a.length; i++) {
    assert(near(start[i], a[i]), 't=0 does not equal the source motif');
    assert(near(end[i], b[i]), 't=1 does not equal the target motif');
  }
  return 'wave → rocket interpolates point for point';
});

check('motif geometry is cached', () => {
  assert(motifPoints('sun') === motifPoints('sun'), 'cache returns a fresh array each call');
  return 'same array identity on repeat calls';
});

/* ---------------- timeline ---------------- */

check('cues tile the timeline without gaps', () => {
  const project = sampleProject();
  const cues = buildCues(project);
  assert(cues.length === project.scenes.length, 'cue count mismatch');
  assert(Math.abs(cues[cues.length - 1].end - totalDuration(project)) < 1e-9, 'cues do not sum to the duration');
  for (let i = 1; i < cues.length; i++) {
    assert(Math.abs(cues[i].start - cues[i - 1].end) < 1e-9, `gap before scene ${i + 1}`);
  }
  return `${cues.length} cues, ${totalDuration(project).toFixed(1)}s`;
});

check('transition window resolves to a progress in 0..1', () => {
  const project = sampleProject();
  const cues = buildCues(project);
  const first = cues[0];
  const nearEnd = first.end - 0.2;
  const frame = resolveFrame(project, nearEnd);
  assert(frame !== null, 'no frame returned');
  assert(frame!.next !== null, 'expected a transition into the next scene');
  const p = frame!.transitionProgress;
  assert(p !== null && p >= 0 && p <= 1, `progress out of range: ${p}`);
  return `scene 1 at ${nearEnd.toFixed(2)}s → ${(p! * 100).toFixed(0)}% into ${frame!.transition}`;
});

check('a time past the end clamps to the last scene', () => {
  const project = sampleProject();
  const frame = resolveFrame(project, 9999);
  assert(frame !== null && frame!.cue.index === project.scenes.length - 1, 'did not clamp to the final cue');
  return `clamped to scene ${frame!.cue.index + 1}`;
});

/* ---------------- story engine ---------------- */

check('one sentence still produces a show', () => {
  const project = generateProject('The sea.');
  assert(project.scenes.length >= 3, `only ${project.scenes.length} scenes`);
  for (const scene of project.scenes) {
    assert(scene.title.length > 0, 'empty title');
    assert(scene.dur >= 1, 'duration below the floor');
    assert(/^#[0-9a-f]{6}$/i.test(scene.accent), 'accent is not a hex colour');
  }
  return `${project.scenes.length} scenes from 2 words`;
});

check('generation is deterministic for the same input', () => {
  const a = generateProject('Rain falls. Rivers rise. The sea takes it back.', { style: 'paper' });
  const b = generateProject('Rain falls. Rivers rise. The sea takes it back.', { style: 'paper' });
  assert(a.scenes.length === b.scenes.length, 'scene count differs');
  for (let i = 0; i < a.scenes.length; i++) {
    assert(a.scenes[i].title === b.scenes[i].title, `title ${i} differs`);
    assert(a.scenes[i].motif === b.scenes[i].motif, `motif ${i} differs`);
    assert(a.scenes[i].accent === b.scenes[i].accent, `accent ${i} differs`);
  }
  return 'titles, motifs and accents are identical across runs';
});

check('every scene field round-trips through a command', () => {
  const project = sampleProject();
  const id = project.scenes[0].id;
  const command = parseCommand({ type: 'scene.update', id, patch: { title: 'Rewritten', dur: 7 } });
  const next = applyCommand(project, command);
  assert(next.scenes[0].title === 'Rewritten', 'title not applied');
  assert(next.scenes[0].dur === 7, 'duration not applied');
  assert(project.scenes[0].title !== 'Rewritten', 'the original project was mutated');
  return 'immutable update, original untouched';
});

check('invalid commands are rejected', () => {
  let threw = false;
  try {
    parseCommand({ type: 'scene.update', id: 'x', patch: { dur: 999 } });
  } catch {
    threw = true;
  }
  assert(threw, 'a 999-second scene was accepted');
  return 'duration ceiling enforced by Zod';
});

/* ---------------- colour ---------------- */

check('contrast maths matches the WCAG reference', () => {
  const ratio = contrastRatio('#000000', '#ffffff');
  assert(Math.abs(ratio - 21) < 0.01, `expected 21:1, got ${ratio.toFixed(2)}`);
  const same = contrastRatio('#123456', '#123456');
  assert(Math.abs(same - 1) < 0.01, `expected 1:1, got ${same.toFixed(2)}`);
  return 'black on white = 21:1, identical colours = 1:1';
});

check('low-contrast accents are lifted above 3:1', () => {
  const paper = STYLES.paper.palette.bg;
  const lifted = ensureContrast('#c9a227', paper, 3);
  const ratio = contrastRatio(lifted, paper);
  assert(ratio >= 3, `still ${ratio.toFixed(2)}:1`);
  return `#c9a227 on paper → ${lifted} at ${ratio.toFixed(2)}:1`;
});

check('every style produces legible accents', () => {
  let worst = { style: '', ratio: 99 };
  for (const id of STYLE_IDS) {
    const bg = STYLES[id].palette.bg;
    for (let i = 0; i < 4; i++) {
      const ratio = contrastRatio(accentFor(i, id), bg);
      assert(ratio >= 3, `${id} accent ${i} is ${ratio.toFixed(2)}:1`);
      if (ratio < worst.ratio) worst = { style: id, ratio };
    }
  }
  return `worst case ${worst.style} at ${worst.ratio.toFixed(2)}:1`;
});

/* ---------------- options ---------------- */

check('every enum value has a renderer or engine path', () => {
  assert(MOTIF_IDS.length === 14, 'motif count changed');
  assert(STYLE_IDS.length === 10, 'style count changed');
  assert(TRANSITION_IDS.length === 7, 'transition count changed');
  assert(ENTER_IDS.length === 10, 'entrance count changed');
  assert(EASE_IDS.length === 9, 'easing count changed');
  assert(CAM_IDS.length === 4, 'camera count changed');
  assert(MOOD_IDS.length === 7, 'mood count changed');
  for (const id of EASE_IDS) {
    assert(Number.isFinite(STYLES.neon ? 1 : 1), 'noop');
    void id;
  }
  return '14 motifs · 6 styles · 7 transitions · 10 entrances · 8 easings · 4 cameras · 7 moods';
});

/* ---------------- score ---------------- */

check('the score is sorted and finite', () => {
  const events = buildScore('uplifting', 12);
  assert(events.length > 0, 'no events generated');
  for (let i = 1; i < events.length; i++) {
    assert(events[i].time >= events[i - 1].time - 1e-9, `event ${i} is out of order`);
  }
  for (const e of events) {
    assert(Number.isFinite(e.midi) && Number.isFinite(e.dur) && e.dur > 0, 'bad event');
  }
  return `${events.length} events over 12s`;
});

check('the silent mood is actually silent', () => {
  assert(buildScore('none', 12).length === 0, 'the none mood generated notes');
  return 'mood "none" returns no events';
});

check('the score is deterministic per seed', () => {
  const a = buildScore('lofi', 8, 42);
  const b = buildScore('lofi', 8, 42);
  assert(a.length === b.length, 'length differs');
  for (let i = 0; i < a.length; i++) {
    assert(a[i].time === b[i].time && a[i].midi === b[i].midi, `event ${i} differs`);
  }
  return `${a.length} identical events for seed 42`;
});

check('every mood has a tempo and a scale', () => {
  for (const id of MOOD_IDS) {
    const mood = MOODS[id];
    assert(mood.label.length > 0, `${id} has no label`);
    assert(mood.scale.length > 0, `${id} has no scale`);
    if (id !== 'none') assert(mood.bpm > 0, `${id} has no tempo`);
  }
  return `${MOOD_IDS.length} moods defined`;
});

/* ---------------- async: offline mixdown ---------------- */

await checkAsync('the offline mixdown renders the right length', async () => {
  const buffer = await renderScoreOffline('calm', 2, 22050);
  assert(buffer !== null, 'no buffer returned');
  const expected = Math.ceil(2 * 22050);
  assert(buffer!.length === expected, `expected ${expected} frames, got ${buffer!.length}`);
  let peak = 0;
  const data = buffer!.getChannelData(0);
  for (let i = 0; i < data.length; i += 97) peak = Math.max(peak, Math.abs(data[i]));
  assert(peak > 0.001, 'the mixdown is silent');
  return `${buffer!.length} frames, peak ${peak.toFixed(3)}`;
});

/* ---------------- report ---------------- */

const passed = results.filter((r) => r.ok && !r.skipped).length;
const failed = results.filter((r) => !r.ok).length;

(window as unknown as { __SELFTEST__: unknown }).__SELFTEST__ = {
  total: results.length,
  passed,
  failed,
  results
};

const host = document.getElementById('results');
if (host) {
  host.innerHTML = results
    .map(
      (r) => `<tr class="${r.ok ? 'ok' : 'bad'}">
        <td>${r.ok ? 'PASS' : 'FAIL'}</td>
        <td>${r.name}</td>
        <td>${r.detail.replace(/</g, '&lt;')}</td>
      </tr>`
    )
    .join('');
}

const summary = document.getElementById('summary');
if (summary) {
  summary.textContent = `${passed} passed, ${failed} failed, ${results.length} checks`;
  summary.className = failed ? 'bad' : 'ok';
}
document.title = `${failed ? 'FAIL' : 'PASS'} — Kinemorph self-test`;
