# Changelog

All notable changes to Kinemorph. Format follows [Keep a Changelog](https://keepachangelog.com/),
versioning follows [Semantic Versioning](https://semver.org/).

## [0.12.0] — 2026-11-14

### Added
- **Five text effects** — `reveal`, `typewriter`, `shutter`, `glitch` and `highlight` — chosen per
  scene in the inspector. Until now every scene used the same word-by-word reveal.
  - `typewriter` types the body character by character.
  - `shutter` wipes the body in behind a hard mask.
  - `glitch` cuts horizontal slices through the text block, tinted and offset per frame.
  - `highlight` sweeps a marker bar behind each line.
- The story engine cycles effects across scenes, so a generated show is no longer uniform.

### Note
- `pop`, `wave` and `kinetic` are not here: they animate individual words, which needs a per-word
  layout pass. Kinemotif has them because it draws text on a canvas rather than through Pixi
  `Text` objects.

## [0.11.0] — 2026-11-14

### Added
- **`springSoft`** easing, and a real **`spring`**.

### Fixed
- `spring` was `1 - cos(x * 1.5π) * exp(-5x)` — it looked bouncy but had no damping ratio, no
  settle time, and did not end where it claimed. It is now a damped harmonic oscillator with
  omega derived the way motion-kit derives it, so "settles in 900 ms" is true.

### Credit
- The spring method is adapted from [motion-kit](https://github.com/drsamonline/motion-kit) (MIT),
  noted in `NOTICE.md`.

## [0.10.0] — 2026-11-14

### Changed
- **Tone.js and Mediabunny no longer load at boot.** Mood data moved to `@kinemorph/core` (it is
  pure data), so the mood picker renders without the audio engine; `LiveScore` is imported on the
  first press of play and `ExportPanel` on the first press of Export.
- Entry chunk **424 KB → 146 KB**; initial JavaScript **~730 KB → ~455 KB** raw.

### Verified
- Boot requests only `main` and `index` (Pixi); no Tone, no Mediabunny.
- Pressing play loads the audio chunk; pressing Export loads the panel chunk and the dialog opens.

## [0.9.0] — 2026-11-13

### Added
- **Blueprint, Riso Print, Chalkboard and Swiss Grid** — ten styles, matching Kinemotif. Each has
  its own background treatment (grid and frame, overprint circles, board edge, hard rules) and its
  own motif painting (dashed outline, ghost offset, chalk stroke, solid with a white inlay).

### Fixed
- Body copy colour was chosen from a list of style names, so the new dark styles got dark text on
  a dark background. It follows the background's luminance now.

### Changed
- Golden signatures regenerated on the runner: 10 styles × 14 motifs = 140 frames.

## [0.8.0] — 2026-11-13

### Added
- **The seven diagrams** from Kinemotif are now in Kinemorph: bars, flow, rings, orbit, steps, grid
  and timeline, drawn with PixiJS Graphics from the style's own palette. `Scene.visual` selects
  one; the story engine cycles them in automatically.
- Diagrams get their own Graphics object so a scene can switch between motif and diagram without
  one clearing the other.

### Note
- Two rounds of this were spent chasing a bug that did not exist: the verification script clicked a
  button matching /play/i, which the transport does not have, so every screenshot was taken at
  t=0 where the entrance animation has not started. The diagrams were correct all along.

## [0.7.0] — 2026-11-13

### Added
- **The format belongs to the project.** `Project.aspect` (16:9, 9:16, 1:1, 4:5) now drives the
  editor stage and the export, instead of the export dialog holding a temporary setting. A format
  selector sits in the top bar; changing it reflows the stage immediately.
- `ASPECTS` moved into `@kinemorph/core` so the model, the renderer and the export package share one
  table.

### Changed
- `exportMP4()` defaults to `project.aspect` when no explicit aspect is passed.

## [0.6.0] — 2026-11-13

### Added
- **Output formats for video export** — landscape 16:9, portrait 9:16, square 1:1 and tall 4:5.
  The renderer's design space follows the format and the layout reflows: portrait puts the title
  in the upper third and the artwork below, and split layouts become centred.
- `sizeForAspect(aspect, longEdge)` in `@kinemorph/export` so callers do not hard-code sizes.
- `tools/verify-export.mjs --aspect=…` now decodes the finished file in a video element and
  reports its real dimensions, instead of trusting the container header.

### Verified
- 9:16 → 720×1280, 1:1 → 1280×1280, 16:9 → 1280×720, each read back from the encoded file.
- Landscape geometry is byte-identical to before, so the 84 golden frames still match.

## [0.5.0] — 2026-11-13

### Added
- **WebM export.** Deterministic VP9 + Opus through Mediabunny's `WebMOutputFormat`, rendered
  frame by frame like the MP4 path — not the real-time `MediaRecorder` capture, which is still
  available as a last resort for browsers without WebCodecs.
- **WAV audio stems.** `encodeWav()` writes 16-bit PCM straight from the offline mixdown, and the
  export dialog has a **Download WAV** button. This is the answer to desktop editors that ignore
  Opus inside MP4: the score arrives in a format nothing refuses.
- **Format selector** in the export dialog (MP4 / WebM).
- **`tools/verify-export.mjs`** — an end-to-end export check committed to the repo. It drives the
  real dialog in a headless browser and validates each output's magic bytes.

### Verified
- MP4: 974 KB, `avc` + `opus`. WebM: 855 KB, `vp9` + `opus`. WAV: 384,044 bytes for 2s at 48 kHz
  stereo — byte-exact for 16-bit PCM.

## [0.4.0] — 2026-11-13

### Changed
- **Muxing migrated from `mp4-muxer` to Mediabunny.** The old library is deprecated upstream by
  its own author. Mediabunny owns the encoder configuration and the container, which removed the
  manual `VideoEncoder`/`AudioEncoder` wiring, the chunk plumbing and the hand-rolled muxer
  setup — roughly 150 lines — from both the main-thread and worker paths.
- **Audio codec is reported.** `ExportResult.audioCodec` says whether the track is AAC or Opus,
  and the export dialog shows it: "with aac audio" / "with opus audio".
- Audio samples are closed after encoding (Mediabunny warns on leaked `AudioSample`s).

### Verified
- 4-second show → 2.2 MB MP4, `vide` + `soun` tracks, Opus audio in headless Chrome (which has no
  AAC encoder). AAC is tried first and used wherever the browser offers it.

## [0.3.0] — 2026-11-13

### Added
- **Playwright suite** — three specs run against the built site through `vite preview`:
  the engine self-test, 84 golden style × motif frames, and an editor smoke test.
- **`studio/harness.html`** — render harness that draws every style × motif and publishes a
  coarse colour signature on `window.__HARNESS__`.
- **`tests/signatures.json`** — committed reference signatures, with `npm run test:update`.
- **Worker-based export** — encoding and muxing now run in a dedicated worker; frames cross the
  boundary as transferable `ImageBitmap`s, so the editor keeps painting during a long export.
  Falls back to the main thread when a worker cannot start.
- **CI** — installs Chromium, runs the suite, uploads the Playwright report as an artefact.

### Changed
- `SceneRenderer.init()` takes `preserveDrawingBuffer`, used only by the harness.
- The golden harness renders without text so the baseline is font-independent.
- Golden baselines are generated on the CI runner via `workflow_dispatch`, because a different
  Chromium build shifted one cell by 200.
- `exportMP4()` picks the worker path automatically and keeps the main-thread implementation as
  a fallback.

## [0.2.0] — 2026-11-13

### Added
- **Offline self-test** (`studio/selftest.html`) — 19 assertions across geometry, timeline,
  story, colour, score and the offline mixdown. Publishes results on `window.__SELFTEST__`.
- **`MANIFEST.json` + `tools/manifest.mjs`** — file inventory with SHA-256 and class, checked in CI.
- **Dependabot** — weekly, grouped, one PR per ecosystem, majors ignored.
- **Issue and PR templates**, `SECURITY.md`, `PRIVACY.md`, `CODE_OF_CONDUCT.md`, `CITATION.cff`.

### Changed
- CI now also verifies the manifest covers every tracked file.
- The Vite build emits two entries (studio and self-test) and splits PixiJS out of the main chunk.

## [0.1.0] — 2026-11-13

First release. The heavy sibling of Kinemotif: same idea, none of the single-file constraints.

### Added
- **Monorepo** — `@kinemorph/core`, `renderer`, `audio`, `export` and the `studio` app, with
  TypeScript project references, Vite and npm workspaces.
- **Project model** — Zod schemas as the single source of truth for the project, scenes and
  every enum; `parseProject` / `safeParseProject` for untrusted input.
- **Command layer** — serialisable, schema-validated commands applied to an immutable project,
  giving undo/redo with an 80-step history.
- **Story engine** — sentence splitting, clause-based titles, keyword-to-motif matching and a
  five-beat expansion for short input.
- **PixiJS renderer** — six styles rendered at their native resolution, fourteen morphable
  motifs, seven transitions, ten entrances, eight easings, three camera moves.
- **Contrast-safe accents** — WCAG relative luminance plus an HSL nudge loop, so a generated
  accent always clears 3:1 against its own background.
- **Generative score** — seven moods; note events built as pure data, played through Tone.js
  and rendered for export through an `OfflineAudioContext`.
- **WebCodecs MP4 export** — deterministic frame-by-frame encoding through `mp4-muxer`, with
  AAC where available and Opus otherwise, plus a real-time `MediaRecorder` WebM fallback.
- **Editor** — scene list, inspector with a live contrast readout, zoomable timeline with
  drag-trim, transport, wizard and export dialog.
- **CI** — install, typecheck, build, link check, and a check that the committed build matches
  the sources.

### Known limitations
- Export runs on the main thread; long shows are slow.
- Opus-in-MP4 is ignored by some desktop editors.
- Collaboration is designed for but not implemented.
- `mp4-muxer` is deprecated upstream in favour of Mediabunny.
