import { MOTIF_IDS, STYLE_LIST, type Project } from '@kinemorph/core';
import { SceneRenderer } from '@kinemorph/renderer';

/**
 * Golden-frame harness.
 *
 * Renders each style × motif at a fixed time and reduces the frame to a coarse
 * colour signature: an 8×5 grid of mean RGB plus the fraction of cells that are
 * not the background. A signature survives anti-aliasing and driver differences
 * while still catching a style that renders blank, a motif that throws, or a
 * palette that silently changes.
 */

const GRID_W = 8;
const GRID_H = 5;

function signature(renderer: SceneRenderer): number[] {
  /* the harness renders with preserveDrawingBuffer so the canvas is readable */
  const source = renderer.canvas;
  const small = document.createElement('canvas');
  small.width = GRID_W;
  small.height = GRID_H;
  const ctx = small.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, GRID_W, GRID_H);
  const data = ctx.getImageData(0, 0, GRID_W, GRID_H).data;

  const out: number[] = [];
  let nonBlank = 0;
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    out.push(r, g, b);
    if (r + g + b > 36) nonBlank++;
  }
  out.push(Math.round((nonBlank / (GRID_W * GRID_H)) * 100) / 100);
  return out;
}

function sceneFor(styleId: (typeof STYLE_LIST)[number]['id'], motif: (typeof MOTIF_IDS)[number], accent: string): Project {
  return {
    schema: 1,
    id: 'harness',
    title: 'Harness frame',
    style: styleId,
    mood: 'none',
    pace: 1,
    aspect: '16:9',
    musicSeed: 1,
    transition: 'none',
    scenes: [
      {
        id: 's1',
        /* no text: the signature covers artwork, and text metrics depend on
           whatever fonts the machine has installed */
        title: '',
        body: '',
        motif,
        visual: 'motif',
        textFx: 'reveal',
        dur: 6,
        layout: 'split',
        transition: 'none',
        enter: 'none',
        ease: 'linear',
        cam: 'none',
        accent
      }
    ]
  };
}

async function run(): Promise<void> {
  const status = document.getElementById('status');
  const host = document.getElementById('host');
  if (!host) throw new Error('no host');

  const renderer = new SceneRenderer();
  await renderer.init({ preserveDrawingBuffer: true });
  renderer.mount(host);

  const out: Record<string, Record<string, number[]>> = {};
  let count = 0;

  for (const style of STYLE_LIST) {
    out[style.id] = {};
    for (const motif of MOTIF_IDS) {
      const project = sceneFor(style.id, motif, style.palette.accents[0]);
      renderer.render(project, 3);
      out[style.id][motif] = signature(renderer);
      count++;
      if (status) status.textContent = `${count} / ${STYLE_LIST.length * MOTIF_IDS.length} frames`;
    }
  }

  /* A wipe between two differently styled scenes must draw each side in its own
     palette. Read back the two halves of the frame and expose the gap, so the
     test can assert it rather than trusting the code. */
  const crossStyle = (() => {
    const scene = (id: string, style: string, title: string) => ({
      id, title, body: '', motif: 'sun' as const, visual: 'motif' as const, textFx: 'reveal' as const,
      dur: 5, layout: 'center' as const, transition: 'wipe' as const, enter: 'fade' as const,
      ease: 'linear' as const, cam: 'none' as const, accent: '#ff2d95', style
    });
    const project = {
      schema: 1 as const, id: 'p_cross', title: 'cross', style: 'neon' as const, mood: 'none' as const,
      pace: 1, aspect: '16:9' as const, musicSeed: 1, transition: 'wipe' as const,
      scenes: [scene('c1', 'paper', 'Paper'), scene('c2', 'neon', 'Neon')]
    };
    renderer.render(project as never, 4.55);
    const source = renderer.canvas;
    const ctx2 = document.createElement('canvas');
    ctx2.width = source.width;
    ctx2.height = source.height;
    const c2 = ctx2.getContext('2d');
    if (!c2) return null;
    c2.drawImage(source, 0, 0);
    const band = (x0: number, w: number) => {
      const d = c2.getImageData(x0, Math.round(source.height * 0.3), w, Math.round(source.height * 0.4)).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 37) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
      return sum / n;
    };
    const third = Math.round(source.width / 3);
    const left = band(4, third - 8);
    const right = band(source.width - third - 4, third - 8);
    return { left, right, gap: Math.abs(left - right) };
  })();

  (window as unknown as { __CROSSSTYLE__: unknown }).__CROSSSTYLE__ = crossStyle;
  (window as unknown as { __HARNESS__: unknown }).__HARNESS__ = out;
  if (status) status.textContent = `done — ${count} frames`;
  document.title = 'HARNESS READY';
}

run().catch((err: unknown) => {
  const status = document.getElementById('status');
  if (status) status.textContent = 'failed: ' + (err instanceof Error ? err.message : String(err));
  (window as unknown as { __HARNESS_ERROR__: string }).__HARNESS_ERROR__ =
    err instanceof Error ? err.message : String(err);
});
