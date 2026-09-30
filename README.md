[![CI](https://github.com/JakobMelchard/flatplan/actions/workflows/ci.yml/badge.svg)](https://github.com/JakobMelchard/flatplan/actions/workflows/ci.yml)
[![Pages](https://github.com/JakobMelchard/flatplan/actions/workflows/pages.yml/badge.svg)](https://docs.melchard.org/flatplan/app/)
[![Docs](https://img.shields.io/badge/docs-docs.melchard.org/flatplan-8be9fd?logo=github&labelColor=0b0d10)](https://docs.melchard.org/flatplan/)

# flatplan

2D furniture arrangement planner. Vanilla JS (JSDoc types) + Canvas, no runtime deps, no build
step. All lengths cm. Installable as a PWA (iPad: Share → Add to Home Screen) and usable with
touch, Apple Pencil, mouse or keyboard.

- App: <https://docs.melchard.org/flatplan/app/>
- Docs: <https://docs.melchard.org/flatplan/> (gestures, floor plan, furniture, layouts,
  shortcuts, development, hosting); `?` in the app shows the shortcuts.

## Quickstart

```sh
npm ci && npm start               # http://127.0.0.1:5173
BIND=0.0.0.0 npm start            # reachable from the iPad over LAN / tailnet
brew install prek && prek install # git hooks (.pre-commit-config.yaml), once per clone
npm run check && npm run lint && npm test
```

The service worker (offline use, install) only registers on HTTPS or localhost.

## Structure

- `index.html` markup and CSS, `tokens.css` vendored org design tokens (never edit)
- `src/` model, store (IndexedDB, export / import), geometry, history, editor (canvas + input), ui,
  main
- `sw.js`, `manifest.webmanifest`, `icons/` PWA shell
- `serve.js` dev server, `test/` geometry tests, `docs/` source of the docs site

## Hosting

GitHub Pages. Push to `main` → `.github/workflows/pages.yml` stages the app shell, writes a
`version` file for the in-app update check, builds `docs/` with HonKit to the site root, stages the app under `app/` and deploys.
Details in [docs/hosting.md](docs/hosting.md).
