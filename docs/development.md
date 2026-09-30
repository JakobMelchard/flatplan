# Development

Vanilla JS with JSDoc types checked by `tsc`, Canvas rendering, no bundler and no runtime
dependencies. Source: [JakobMelchard/flatplan](https://github.com/JakobMelchard/flatplan).

```sh
npm ci
npm start              # static dev server, http://127.0.0.1:5173
BIND=0.0.0.0 npm start # reachable from the iPad over LAN or tailnet
npm run check          # tsc over the JSDoc types
npm run lint
npm test               # node --test, pure geometry
```

The dev server reads `BIND`, not `HOST`. The service worker only registers on HTTPS or
localhost, so test install and offline behaviour against the deployed site or a tunnel.

## Structure

| Path                                      | Role                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `index.html`                              | Markup and CSS                                                       |
| `tokens.css`                              | Org design tokens, vendored from `JakobMelchard/.config`; never edit |
| `src/model.js`                            | Types (JSDoc typedefs), project helpers                              |
| `src/store.js`                            | IndexedDB persistence, export / import, image downscaling            |
| `src/geom.js`                             | Pure geometry: collision, door zones (tested in `test/`)             |
| `src/history.js`                          | Undo / redo snapshots                                                |
| `src/editor.js`                           | Canvas view, pointer / pinch / pen input, tools, render              |
| `src/ui.js`                               | Header, panels, action bar, dialogs                                  |
| `src/debug.js`                            | Optional remote event log for real-device gesture debugging          |
| `src/main.js`                             | Wiring, service worker registration                                  |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA shell                                                            |
| `serve.js`                                | Dev server; also `/version` and the `/log` sink                      |
| `docs/`                                   | This site (markdown, org docs action)                                |

When the file list changes, bump `CACHE` in `sw.js` and add new files to `SHELL`.

## Model

Walls are segments with stable ids. Openings reference their wall:
`Opening{wall, t, w, kind, hinge, swing}`. Items are `{x, y, rot}` over an asset with `w, d, h`
and an optional image. A project holds one plan, one catalog and several layouts.

## Debug log

`serve.js` with `CLIENT_LOG=<file>` makes `/version` report debug, and the app then batches
pointer events to `POST /log`. That is how iPad gestures were diagnosed from a headless machine;
the static host has no equivalent.

## 3D (planned)

The model is 3D-ready: assets have a height, items a rotation, walls are segments. A `view3d.js`
with three.js would extrude walls (height 250, thickness 10) and place items as boxes at
`(x, h/2, y)` rotated by `-rot`, or load a glb when an asset has a model.

## Docs

This site is `docs/*.md` rendered by the org's `actions/docs` (JakobMelchard/.github) into the
docs.melchard.org shell, nav from `docs/SUMMARY.md`, published at `/flatplan/` with the app under
`app/` by the Pages workflow. To preview locally, run that action's `build.mjs` against `docs/`.
