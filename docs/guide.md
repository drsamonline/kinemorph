# Guide

Everything you need to make a show and get a video out of it.

---

## Running it

```bash
git clone https://github.com/drsamonline/kinemorph.git
cd kinemorph
npm install
npm run dev            # http://localhost:5173
```

To produce the deployable build:

```bash
npm run build          # writes studio/
npm run preview        # serves studio/ on http://localhost:4173
```

`npm run typecheck` runs `tsc --noEmit` across every package and the app.

---

## The wizard

On first load the studio opens on the wizard, three steps:

**Pick a look.** Six styles. The swatch shows the palette, not a screenshot.

**Give it a story.** Tap a demo or paste your own text. Each sentence becomes a scene; the
title is cut from the first clause; the picture is matched by keyword. Fewer than three
sentences and the text is expanded into a five-beat arc so you still get a show.

**Set the mood.** Score, pace and the default transition. Then **Generate my show**.

You can return to the wizard at any time with **New show**. Your current project stays in
`localStorage` until you replace it.

---

## The editor

```
┌──────────────────────── top bar ─────────────────────────┐
│ title · undo · redo · sound · new · export               │
├──────────┬──────────────────────────────┬────────────────┤
│ scenes   │            stage             │  inspector     │
│ look     ├──────────────────────────────┤                │
│ score    │  transport · timeline        │                │
└──────────┴──────────────────────────────┴────────────────┘
```

### Scenes

Click a scene to select it and seek to its start. **+** appends a new scene. The inspector
has duplicate, move up/down and delete.

### Stage and transport

The canvas is the real renderer, letterboxed to fit. Transport: previous scene, play/pause,
next scene, and a zoom slider for the timeline. The playhead is the cyan line.

### Timeline

- **Click the track** to seek.
- **Click a segment** to select that scene.
- **Drag the right edge of a segment** to trim its duration, between 1 and 30 seconds.
- **Zoom** with the slider in the transport bar.

### Inspector

| Field | Effect |
|---|---|
| Title | Large type, auto-fitted to two lines |
| Text | Body copy, revealed word by word |
| Visual | One of fourteen motifs |
| Entrance | rise, fade, zoom, slide, slideR, drop, flip, blur, pop, none |
| Easing | linear, out, inOut, back, expo, elastic, bounce, spring |
| Layout | Text + visual, or Centered (title card) |
| Camera | push in, pull out, pan, none |
| Duration | 1–30 seconds |
| Transition | morph, fade, slide, wipe, iris, glitch, none |
| Accent | The colour for the motif and the title glow, with a live contrast ratio |

The contrast badge next to Accent is a real WCAG ratio against the current style's background.
Below 3:1 the shape will disappear into the page — the badge turns amber.

---

## Exporting

**Export video** opens the export dialog.

| Setting | Notes |
|---|---|
| Frame rate | 24, 30 or 60 fps |
| Resolution | 1280×720 or 1920×1080 |
| Audio | Include the score, or export silent |

Two buttons:

**Export MP4** uses WebCodecs. It walks the timeline frame by frame, renders each one,
encodes it, then mixes the score through an `OfflineAudioContext` and muxes everything into
one MP4. Nothing is captured in real time, so a busy tab cannot drop a frame. It is
CPU-heavy: software rendering can take a couple of minutes for a short show.

**Record WebM** captures the canvas in real time. Slower to watch, lower quality, but it works
in browsers without a video encoder, and it still carries the soundtrack.

### About the audio codec

The MP4 audio track is AAC when the browser supports an AAC encoder (Safari does), and Opus
otherwise (Chrome). Opus-in-MP4 is valid and plays in browsers and VLC, but some desktop
editors ignore it. If a track shows up silent in Premiere or Final Cut, export from Safari,
or use the WebM path and convert.

---

## Keyboard

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` `→` | Previous / next scene |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z` | Redo |
| `E` | Open export |

---

## Troubleshooting

**"Renderer unavailable".** PixiJS could not get a WebGL context. Enable hardware
acceleration, or try another browser. Software WebGL (SwiftShader) works but is slow.

**Export says "silent — …".** The message tells you why: no score was rendered, the browser
has no MP4-capable audio encoder, or encoding failed. The video still exports.

**Export never finishes on a long show.** Each frame costs a full render. A three-minute show
at 60 fps is 10,800 frames. Drop to 24 fps and 720p first.

**Edits disappeared.** The project lives in `localStorage` for that origin. Clearing site data,
private windows and a different port each lose it.
