# flatplan

2D furniture arrangement planner. Canvas editor for walls, doors, windows and
furniture, all lengths in cm. Static PWA, vanilla JS + JSDoc, no bundler, no
runtime deps. State in IndexedDB plus JSON export/import. Primary target is an
iPad (touch + Apple Pencil) as an installed web app; mouse and keyboard still
work. Org rules: `JakobMelchard/.agents` (loaded from the checkout, not vendored).

## Commands

```sh
npm ci
npm start          # static dev server, http://127.0.0.1:5173 (BIND=0.0.0.0 for LAN)
npm run check      # tsc over JSDoc types
npm run lint
npm test           # node --test, pure geometry
```

CI runs check, lint and test.

## Layout

- `index.html` markup and CSS
- `tokens.css` org design tokens (custom properties), vendored from
  `JakobMelchard/.config` by `config-sync tokens` (destination in
  `.config/tokens.path`); never edit, the app CSS and canvas read its variables
- `src/model.js` types, project helpers
- `src/store.js` IndexedDB, export / import, image helpers
- `src/geom.js` pure geometry (collision, door zones)
- `src/editor.js` canvas view, pointer input, tools, render
- `src/ui.js` header, panels, action bar, dialogs
- `src/main.js` wiring
- `sw.js`, `manifest.webmanifest`, `icons/` PWA shell; bump `CACHE` in `sw.js`
  and add new files to `SHELL` when the file list changes

User-facing behaviour and shortcuts are documented in `README.md`. Every
action must be reachable without a keyboard (action bar / inspector).
