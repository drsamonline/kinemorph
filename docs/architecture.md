# Architecture

Five packages, one editor. The dependency arrow only ever points one way.

```
apps/studio ──▶ @kinemorph/renderer ──▶ @kinemorph/core
     │                │
     ├───────────────▶@kinemorph/audio
     └───────────────▶@kinemorph/export
```

| Package | Responsibility |
|---|---|
| **@kinemorph/core** | Zod-validated project model, Zustand store, serialisable commands with undo/redo, story engine, timeline resolver, motif geometry, colour math, mood data. No DOM, no Pixi, no Tone. |
| **@kinemorph/renderer** | PixiJS compositor with motifs and seven diagrams. `render(project, time)` draws one frame. Handles styles, camera, entrances and transitions. |
| **@kinemorph/audio** | Score generator. `buildScore(mood, seconds)` returns note events; Tone.js plays them live, an `OfflineAudioContext` renders them for export. |
| **@kinemorph/export** | Mediabunny for encoding and muxing: MP4/H.264 or WebM/VP9, plus 16-bit WAV audio stems. A real-time `MediaRecorder` path remains for browsers without WebCodecs. |
| **@kinemorph/studio** | The Vite + React editor. |

Each package declares the dependencies it imports. Nothing relies on root hoisting.

## Three decisions that shape the code

### The renderer is a pure function of (project, time)

Nothing advances its own clock. The preview loop, the scrubber and the export all call
`renderer.render(project, t)`. That is why the exported video is exactly what you saw, and why a
dropped frame is impossible: export never records in real time.

### The renderer renders at the style's native resolution

The stage is always 1920×1080 design units, but the backing store is 480×270 for Pixel Arcade and
1920×1080 for the clean styles. Pixel styles are genuinely low-resolution rather than filtered to
look that way, and cheap styles are cheap to draw.

The design space itself follows the output format. Portrait sets a 1080×1920 space and the layout
reflows — title in the upper third, artwork below, split layouts centred. It is not a crop of a
landscape frame.

### Every mutation is a command

`dispatch({ type: 'scene.update', id, patch })` runs through a Zod schema, applies to an immutable
project and pushes the previous one onto a history stack. Undo, redo and — later — collaboration
all fall out of the same structure.

## Determinism notes

- Randomness in the story engine comes from seeded generators, never `Math.random()`.
- The score is generated from `(mood, duration, seed)` into a note list before any audio node
  exists, so live playback and the export mixdown cannot drift apart.
- Export renders each frame with an explicit timestamp; there is no wall clock involved.

## Performance notes

- Motif geometry is cached per `(motif, pointCount)` — the morph path does not rebuild polygons.
- Scene views are cached per scene id and rebuilt only when the style changes (text metrics change
  with the fonts).
- The export loop keeps the encoder queue shallow (`encodeQueueSize > 6` → yield) so memory stays
  flat on long shows.
- The preview loop is driven by `requestAnimationFrame` in `App`, and React is not re-rendered per
  frame: the playhead and time label are updated imperatively through refs.
- Tone.js and Mediabunny are not in the boot path. Mood data lives in `core`, so the mood picker
  renders without the audio engine; `LiveScore` is imported on the first press of play and
  `ExportPanel` on the first press of Export.

## Why the renderer is not in a worker

Encoding and muxing run in a worker (frames cross as transferable `ImageBitmap`s). The WebGL render
for each frame happens on the main thread.

Moving the renderer into a worker is possible — PixiJS ships
`environment-webworker/WebWorkerAdapter` — and it was investigated rather than assumed. Measured on
this project's CI-class machine (ANGLE + **SwiftShader**, i.e. software rendering), a 60-frame 720p
export takes 52.8s, which is ~880ms per frame with a 1034ms worst main-thread gap.

That number is a property of software rendering, not of the architecture: the same frame on a GPU
is single-digit milliseconds, where a 10ms freeze per frame is not worth a second rendering path
that has to stay in sync with 140 golden frames.

A cheaper fix was tried and **reverted on evidence**: yielding to the event loop between frames
made the same export take 60.5s with a 1509ms worst gap, because a software renderer has no spare
CPU to paint with. Re-run the measurement on a GPU machine before deciding.
