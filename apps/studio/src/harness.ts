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
    transition: 'none',
    scenes: [
      {
        id: 's1',
        /* no text: the signature covers artwork, and text metrics depend on
           whatever fonts the machine has installed */
        title: '',
        body: '',
        motif,
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
