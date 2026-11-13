# Privacy

Kinemorph collects nothing.

- **No analytics, no telemetry, no cookies.**
- **No network calls after load.** The studio bundles every asset it needs. The only outbound
  request is the one that fetches the page itself.
- **No accounts.**

## What is stored on your device

One key in `localStorage`, `kinemorph.project.v1`, holding the project you are editing so a
refresh does not lose work. Clearing site data removes it.

Exported video and audio are written to your downloads folder by the browser. They contain only
what you made.

Erasing it: clear site data for the page, or run `localStorage.removeItem('kinemorph.project.v1')`
in the console. Deleting the key loses the project, so export a `.json` first if you want it back.

## How that claim was checked

Not by reading the code alone. A session was run in a headless browser with the network log
recording: loading the studio, pressing play, and opening the export dialog produced **zero**
requests to any origin other than the page itself. The only cross-origin contact in the whole
product is the initial fetch of the page from GitHub Pages.

## Third parties

The live demo is served by GitHub Pages; GitHub's own privacy policy covers the HTTP request
that fetches the page. Nothing else is contacted.
