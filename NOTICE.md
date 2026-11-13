# Third-party notices

Kinemorph is MIT-licensed (see `LICENSE`). It bundles the following work, which stays under its
own terms. Everything below is listed with the licence declared by the package itself.

## Runtime dependencies

| Package | Licence | Used for | Source |
|---|---|---|---|
| [pixi.js](https://github.com/pixijs/pixijs) | MIT | WebGL renderer and text | https://github.com/pixijs/pixijs |
| [react](https://github.com/facebook/react) / react-dom | MIT | Editor UI | https://github.com/facebook/react |
| [tone](https://github.com/Tonejs/Tone.js) | MIT | Live soundtrack synthesis | https://github.com/Tonejs/Tone.js |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | **MPL-2.0** | MP4/WebM muxing and encoding | https://github.com/Vanilagy/mediabunny |
| [zod](https://github.com/colinhacks/zod) | MIT | Project schema and command validation | https://github.com/colinhacks/zod |
| [zustand](https://github.com/pmndrs/zustand) | MIT | Editor state | https://github.com/pmndrs/zustand |

## Development dependencies

| Package | Licence |
|---|---|
| vite, @vitejs/plugin-react | MIT |
| typescript | Apache-2.0 |
| @playwright/test | Apache-2.0 |
| puppeteer-core | Apache-2.0 |

## Mozilla Public License 2.0 — mediabunny

`mediabunny` is the one dependency that is not permissively licensed. MPL-2.0 is file-level
copyleft: it permits combining it with MIT code and distributing the result, provided that

1. the MPL-covered source remains available under MPL-2.0, and
2. recipients are told where to get it.

The unmodified package is fetched from npm and its source is published at
https://github.com/Vanilagy/mediabunny. This repository does not modify it. If you fork Kinemorph
and patch `mediabunny` itself, you must publish that patched file under MPL-2.0.

## Fonts and assets

No fonts, images or audio files are bundled. Every visual is drawn at runtime by code in
`packages/renderer`; every sound is synthesised by code in `packages/audio`. The type is whatever
the operating system supplies.

## Example content

`examples/` and the landing page contain no third-party media. The quotations in the Kinemotif
sibling project are documented separately — see that repository's `docs/quotations.md`.

## Reporting an omission

If something here is wrong or missing, open an issue or email the address in `SECURITY.md`.
