# flatplan

2D furniture arrangement planner. Canvas editor for walls, doors, windows and
furniture, all lengths in cm. Static site, no runtime deps, state in
localStorage plus JSON export/import. Org rules: `.agents/AGENTS.org.md`.

## Commands

```sh
npm ci
npm run dev        # vite dev server
npm run build      # tsc --noEmit && vite build -> dist/
npm run preview    # serve dist/
```

There are no tests. `npm run build` is the check; CI runs the same.

## Layout

- `index.html` markup and CSS
- `src/model.ts` types, storage, file helpers
- `src/editor.ts` canvas view, tools, hit-testing, render
- `src/ui.ts` sidebar DOM
- `src/main.ts` wiring

User-facing behaviour and shortcuts are documented in `README.md`.

## Stack exception

TypeScript + Vite by exception to the org toolset (vanilla JS + JSDoc, no
bundler). Migration to JSDoc is pending an owner decision; do not start it
unasked.
