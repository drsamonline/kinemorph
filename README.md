# Kinemorph

**The animation studio that exports real video.**

Kinemorph is the heavy sibling of [Kinemotif](https://github.com/drsamonline/kinemotif). Where
Kinemotif is one dependency-free HTML file that plays shows offline, Kinemorph is a proper
application: a React + TypeScript editor over a PixiJS WebGL renderer, a generative Tone.js
score, and frame-exact MP4 export through WebCodecs.

**[▶ Open the studio](https://drsamonline.github.io/kinemorph/studio/)** · **[Landing page](https://drsamonline.github.io/kinemorph/)**

![The Kinemorph editor](assets/canvas.png)

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # writes studio/ (committed, served by Pages)
npm run typecheck
```

Node 20+. No other tooling.

## What it does

Write or paste a paragraph; every sentence becomes a scene. The studio draws its own artwork,
scores its own soundtrack, and exports the result as video.

| | |
|---|---|
| **10 art styles** | Pixel Arcade, Stick Figure, Neon Night, Paper Cut, Cosmic Dream, VHS Retro, Blueprint, Riso Print, Chalkboard, Swiss Grid |
| **8 text effects** | reveal, typewriter, shutter, glitch, highlight, pop, wave, kinetic — chosen per scene |
| **7 diagrams** | bars, flow, rings, orbit, steps, grid, timeline — or 14 motifs |
| **4 formats** | 16:9, 9:16 portrait, 1:1 square, 4:5 feed. The layout reflows; portrait is not a crop |
| **Video export** | MP4 (H.264) or WebM (VP9), plus a WAV stem of the score |
| **Seeded score** | Seven moods, six timbre bands. The seed picks the instruments, tempo and key, so two shows in the same mood sound different — and the same show sounds the same every time |

## Output formats

The renderer's design space follows the format, so portrait is a reflow and not a crop: the title
moves to the upper third and the artwork to the lower half, and split layouts become centred.

| Aspect | Output (720p preset) | Use |
|---|---|---|
| `16:9` | 1280 × 720 | Landscape, default |
| `9:16` | 720 × 1280 | Reels, Shorts, Stories, TikTok |
| `1:1` | 1280 × 1280 | Feed square |
| `4:5` | 1080 × 1350 | Instagram portrait |

The format lives on the project and is chosen in the top bar — the stage reflows immediately, and
the export uses it unless you override it in the export dialog.

| Container | Video | Audio | Use it when |
|---|---|---|---|
| **MP4** | H.264 | AAC if the browser has an AAC encoder, otherwise Opus | Sharing, uploading, anything that wants the most compatible file |
| **WebM** | VP9 | Opus | Smaller files, or when H.264 is unavailable |
| **WAV** | — | 16-bit PCM at the score's sample rate | Getting the soundtrack into a desktop editor |

## Performance budget

The editor must open on a laptop without waiting for libraries it may never use.

| Chunk | Size (raw) | When it loads |
|---|---|---|
| `main` | **146 KB** | boot |
| `index` (PixiJS) | 309 KB | boot — the stage needs it |
| `src` (Tone.js) | 255 KB | first press of play |
| `ExportPanel` (Mediabunny) | 278 KB | first press of Export |
| `encode-worker` | 268 KB | first export, in a worker |

Initial JavaScript is **~455 KB raw**, down from ~730 KB. The budget is: nothing that is only
needed on play or export may sit in the boot path. Verified by watching which chunks the browser
requests.

## Known limitations

- **MP4 audio is AAC where available, Opus otherwise.** Chrome has no AAC encoder, so it gets
  Opus; Safari and Edge get AAC. Opus-in-MP4 plays in browsers and VLC, but some desktop editors
  ignore it. The export dialog tells you which one you got.
- **Rendering is still on the main thread.** Encoding and muxing run in a worker; the WebGL render
  for each frame does not. The measurement behind that decision, and the cheaper fix that was
  tried and reverted, are in [docs/architecture.md](docs/architecture.md#why-the-renderer-is-not-in-a-worker).
- **Collaboration is not implemented.** The command layer is designed for it; there is no
  transport.
- **Glitch transition is an approximation**, not a slice-based tear.

## Documentation

| Page | What is in it |
|---|---|
| [docs/guide.md](docs/guide.md) | Using the studio: wizard, timeline, inspector, export |
| [docs/architecture.md](docs/architecture.md) | The five packages, the three decisions that shape the code, and the measurements behind them |
| [docs/testing.md](docs/testing.md) | What each suite proves, and how the golden frames are regenerated |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, the merge gate, commit style, releasing |
| [CHANGELOG.md](CHANGELOG.md) | What shipped, per version |
| [NOTICE.md](NOTICE.md) | Every bundled dependency and its licence |

## Licence

MIT for the code. Third-party components keep their own terms — see [`NOTICE.md`](NOTICE.md),
which also explains the one MPL-2.0 dependency (Mediabunny) and what that requires of a fork.

Built on PixiJS, Tone.js, Mediabunny, React, Zustand and Zod. Prior art that shaped the design,
none of it bundled: GSAP's timeline model, Theatre.js's sequencing ideas, anime.js's SVG morphing,
and the WebCodecs export recipes now common in browser video tooling.
