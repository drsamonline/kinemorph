# Security

## Scope

Kinemorph is a static site plus a client-side application. There is no server, no database and
no account. The studio loads once and then runs entirely in the browser.

## Reporting

Open a private security advisory on this repository rather than a public issue. Include the
browser and version, the steps to reproduce, and what you expected instead.

## In scope

- Cross-site scripting through an imported project file
- Any code path that sends project content to a remote host
- Denial of service through a malformed project (a scene count or duration that hangs the
  renderer or the exporter)

## Out of scope

- The absence of security headers on GitHub Pages (a hosting property)
- Anything that requires running untrusted code outside the browser

## Design notes

Project data is parsed with Zod schemas (`parseProject`) before it reaches the store, so a
malformed file fails closed. Text is drawn with PixiJS `Text` objects, not injected into the
DOM, so project content is never interpreted as markup.

Dependencies are pinned by `package-lock.json` and updated weekly by Dependabot in a single
grouped pull request per ecosystem.
