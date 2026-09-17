# flatplan

2D furniture arrangement planner. Vanilla TS + Canvas, no runtime deps. All lengths cm.

```sh
npm i && npm run dev
```

## Floor plan
- **Wall (W)**: click points. Type digits + `Enter` → exact segment length along cursor axis. `Shift` ortho, `Ctrl` no grid snap. Click first point / `Esc` / dblclick ends.
- **Upload plan image**: then click 2 points of known distance, enter cm. Image rescaled around first point. Opacity slider; trace walls over it or just place furniture on the scan.
- Click wall → `Del`.

## Furniture
- Form: name, W×D×H, color, optional top-down PNG/SVG (downscaled to 600px). H stored for future 3D.
- Drag list entry onto plan, or `+` / dblclick → center.
- Click entry → edit / delete asset (removes its instances).

## Items
Walls are solid: drag slides along wall faces (swept test, no tunneling), edges snap to faces, placement/rotation auto-nudges to nearest free spot. Red outline = overlap left (e.g. sidebar typed coords). Wall thickness set in Floor plan.
`R`/`Shift+R` ±90°, `Q`/`E` ±15°, arrows nudge (Shift ×10), `Del`, `Ctrl+D` dup. Drag snaps 1cm (Shift 10, Ctrl 0.1). Sidebar shows x/y/rot inputs.

## View
Wheel zoom, drag empty space / middle / Alt+drag pan, `F` fit.

## Layouts
Multiple arrangements over same plan + asset library. New / Duplicate / Rename / Delete.

## Persistence
localStorage (`flatplan`), debounced. Export/Import JSON = full project incl. images as data URLs. Quota error surfaces in status bar → export.

## UI
Top bar: tools · layout switcher · zoom/fit · export/import. Left: catalog (form + list). Right: contextual properties, plan settings, shortcuts. Bottom: mode, hint, cursor cm.

## Structure
- `src/model.ts` types, storage, file helpers
- `src/editor.ts` canvas view, tools, hit-testing, render
- `src/ui.ts` sidebar DOM
- `src/main.ts` wiring

## 3D extension (planned)
Model already 3D-ready: `Asset.h`, `Item.{x,y,rot}`, walls as segments. Add `src/view3d.ts`: three.js scene, walls → `ExtrudeGeometry` (height 250, thickness 10), items → `BoxGeometry(w,h,d)` at `(x, h/2, y)` rotated `-rot`, or `GLTFLoader` when `Asset.model` (glb data URL) present. Toggle button in `#tools`; re-sync on `Editor.onChange`.
