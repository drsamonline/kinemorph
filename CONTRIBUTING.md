# Contributing

Kinemorph is a five-package workspace: a headless engine (`core`), a PixiJS renderer, a Tone.js
score, a Mediabunny exporter, and a React editor. The rule that keeps it coherent is that the
renderer is a pure function of `(project, time)` — nothing in it may hold state that the model
does not describe.

## Getting set up

```bash
git clone https://github.com/drsamonline/kinemorph.git
cd kinemorph
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | builds `studio/` |
| `npm run typecheck` | `tsc --noEmit` across every package and the app |
| `npm test` | Playwright against the built studio |
| `npm run verify:export` | exports a real MP4 and checks the bytes |
| `node tools/manifest.mjs` | refreshes `MANIFEST.json` after a build |

## What a change has to hold

1. **Types.** `npm run typecheck` must pass; the build does not typecheck.
2. **Tests.** `npm test` must pass. The golden-frame suite compares 140 frames (10 styles × 14
   motifs); if you change how a style paints, regenerate the signatures on the runner — see the
   README.
3. **The build is committed.** `studio/` is served by GitHub Pages from `main`, so `npm run build`
   and `node tools/manifest.mjs` are part of the change, not a follow-up.
4. **Dependencies are declared where they are used.** Each package lists what it imports; do not
   rely on hoisting.
5. **Nothing in the boot path that only play or export needs.** That budget is in the README.

## Repository conventions

Same house rules as the rest of the fleet:

| File | Purpose |
|---|---|
| `PAGES.json` | Declares every published page and its source file. |
| `tools/check-links.mjs` | Fails if a local reference is broken or the build is missing. |
| `.github/workflows/ci.yml` | `npm ci` → typecheck → build → link check → verifies the committed build matches the sources. |
| `studio/` | Build output, committed on purpose so Pages can serve it from the branch. |
| `MANIFEST.json` | Inventory of every tracked file with a SHA-256 and a class. `tools/manifest.mjs --check` fails on unlisted or missing files. |
| `.github/dependabot.yml` | Weekly, one grouped PR per ecosystem; majors are ignored on purpose. |
| `SECURITY.md` · `PRIVACY.md` · `CODE_OF_CONDUCT.md` · `CITATION.cff` | The same set every repo in the fleet carries. |

## Guards against the bugs we actually had

Two checks exist because the project shipped these mistakes once.

| Check | Catches |
|---|---|
| `node tools/check-version.mjs` (in CI) | A version shipping while the changelog still stops at the previous one — which happened twice |
| `node tools/release-notes.mjs <v>` | Tagging a release the changelog never recorded; it exits non-zero |

Kinemotif also carries `tools/render-check.mjs`, which renders every text effect and asserts the
frame is not blank — the guard for an exception inside the draw loop, which otherwise produces a
silent empty canvas. Kinemorph's equivalent is the 140-frame signature suite.

## Commits

Conventional Commits: `type(scope): imperative subject` under 72 characters, body explaining why.

```
perf(studio): stop shipping Tone to people who never press play

The engine was in the entry chunk; it is now imported on the first play.
Entry 424 KB -> 146 KB.
```

## Releasing

A release is a changelog entry, a tag, and nothing else.

1. Add the version's section to `CHANGELOG.md` — user-facing, past tense, no invented entries. If
   it is not in the changelog, it did not ship.
2. `node tools/release-notes.mjs 0.10.0` prints that section. It exits non-zero when the section is
   missing, which is the point: you cannot tag a version the changelog never recorded.
3. Tag and push:

   ```bash
   git tag -a v0.10.0 -m "v0.10.0"
   git push origin v0.10.0
   ```

4. The `Release` workflow publishes a GitHub release whose body is that changelog section. Nothing
   is written by hand at publish time.

Current version: **0.10.0**.

## Licence

MIT. By contributing you agree your work is licensed under the same terms. Third-party components
keep their own terms — see `NOTICE.md`.
