# Changelog

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
