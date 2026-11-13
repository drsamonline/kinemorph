# Testing

```bash
npm test                 # Playwright against the built studio
npm run test:update      # regenerate the golden signatures after a visual change
npm run verify:export    # export a real MP4 + WAV and check the bytes
```

| Suite | What it proves |
|---|---|
| `tests/selftest.spec.ts` | The 19 pure-engine assertions in `studio/selftest.html` pass in the built bundle, with no page errors. |
| `tests/signatures.spec.ts` | All **140** style × motif combinations render (10 styles × 14 motifs). Each frame is reduced to an 8×5 colour signature (mean RGB + non-blank ratio) and compared against `tests/signatures.json`. Tolerance is 16 per channel, so anti-aliasing and driver differences pass while a blank frame, a thrown exception or a palette drift fails. |
| `tests/studio.spec.ts` | The editor boots, the wizard generates a show, styles resize the canvas, editing renames a scene and `Ctrl+Z` undoes it. |
| `tools/verify-export.mjs` | Drives the real export dialog in a headless browser, then checks each file's magic bytes and decodes the video back to report its true dimensions. Deliberately **not** in CI: a two-second show takes about a minute on a software renderer. |

`studio/harness.html` is the render harness the golden test drives. It renders with
`preserveDrawingBuffer` so the frame can be read back — a harness-only cost, not a production one.

Playwright runs the *built* site through `vite preview`, so the tests exercise exactly what ships.
Locally, `CHROME_PATH=/usr/bin/chromium npm test` skips the browser download.

The golden frames render **without text**, so installed fonts cannot move them — the suite covers
artwork, and typography is covered by the editor smoke test.

## Regenerating the golden frames

Baselines must come from the same Chromium that verifies them. Regenerate on the runner, not on
your laptop:

```bash
gh workflow run ci.yml -f update_signatures=true   # uploads tests/signatures.json
gh run download <run-id> -n signatures -D /tmp/sig
cp /tmp/sig/signatures.json tests/signatures.json
```

This is not ceremony. The first baseline was generated on a different Chromium build and the neon
style drifted by 200 on one cell — the text block, because the two machines had different fonts.
Generating baselines where they are checked removes that whole class of false failure.

Adding a style means adding 14 frames to the baseline. The suite asserts the style count, so it
fails loudly rather than silently covering less.
