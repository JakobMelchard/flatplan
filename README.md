# flatplan

2D furniture arrangement planner. Vanilla JS (JSDoc types) + Canvas, no runtime deps, no build
step. All lengths cm. Installable as a PWA (iPad: Share → Add to Home Screen) and usable with
touch, Apple Pencil, mouse or keyboard.

```sh
npm ci && npm start               # http://127.0.0.1:5173
BIND=0.0.0.0 npm start            # reachable from the iPad over LAN / tailnet
```

The service worker (offline use, install) only registers on HTTPS or localhost.

## Touch & Pencil

- Tap selects; in a drawing tool a tap places the point. One-finger drag moves the selection,
  else pans. Two fingers pinch-zoom and pan; a second finger mid-drag cancels the drag.
- Once the Pencil has been used, only the Pencil places wall corners / doors / scale points;
  fingers just pan and zoom. Contacts are ignored while the Pencil is down (palm rejection).
- Selected item: drag the dot above it to rotate (15° steps, `Ctrl` free). A bar at the bottom
  shows the actions for the selection (rotate, duplicate, delete, hinge / swing, add door).
- While drawing walls the bar takes an exact length + direction arrow, undo corner, done.
- Side panels are drawers below 1200px width (header buttons at both ends).

## Floor plan

- **Wall (W)**: click points. Type digits + `Enter` → exact segment length along cursor axis. `Shift` ortho, `Ctrl` no grid snap. Tap first point closes; tap last point again / `Esc` / dblclick / Done ends.
- **Upload plan image**: then tap 2 points of known distance, enter cm. Image rescaled around first point. Opacity slider; trace walls over it or just place furniture on the scan.
- Click wall → `Del` (removes its openings too).
- **Doors / windows**: `D` / `N`, click a wall (or select wall → Add door/window). Drag along wall; inspector: width, offset from wall start, hinge side, swing side. Door swing zone (w×w square) blocks furniture like a wall. Stored as `Opening{wall:id, t, w, kind, hinge, swing}` — walls carry stable `id`s.

## Furniture

- Form: name, W×D×H, color, optional top-down PNG/SVG (downscaled to 600px). H stored for future 3D.
- Drag card onto plan, or tap it → view centre.
- Pencil icon on a card → edit / delete asset (removes its instances).

## Items

Walls are solid: drag slides along wall faces (swept test, no tunneling), edges snap to faces, placement/rotation auto-nudges to nearest free spot. Red outline = overlap left (e.g. sidebar typed coords). Wall thickness set in Floor plan.
`R`/`Shift+R` ±90°, `Q`/`E` ±15°, arrows nudge (Shift ×10), `Del`, `Ctrl+D` dup. Drag snaps 1cm (Shift 10, Ctrl 0.1). Sidebar shows x/y/rot inputs.

## View

Wheel / pinch zoom, drag empty space / middle / Alt+drag pan, `F` fit.

## Layouts

Multiple arrangements over same plan + asset library. New / Duplicate / Rename / Delete.

## Persistence

IndexedDB (`flatplan`), debounced, persistent storage requested so Safari keeps it; older
localStorage projects are migrated on first load. Export/Import JSON = full project incl. images as
data URLs; on iPad export opens the share sheet (Save to Files).

## UI

Top bar: tools · layout switcher · zoom/fit · export/import. Left: catalog (form + list). Right: contextual properties, plan settings, shortcuts. Bottom: mode, hint, cursor cm.

## Structure

- `src/model.js` types (JSDoc typedefs), project helpers
- `src/store.js` IndexedDB persistence, export / import, image downscaling
- `src/geom.js` pure geometry: collision, door zones (tested in `test/`)
- `src/editor.js` canvas view, pointer / pinch / pen input, tools, render
- `src/ui.js` header, panels, action bar, dialogs
- `src/main.js` wiring, service worker registration
- `sw.js`, `manifest.webmanifest`, `icons/` PWA shell

## 3D extension (planned)

Model already 3D-ready: `Asset.h`, `Item.{x,y,rot}`, walls as segments. Add `src/view3d.js`: three.js scene, walls → `ExtrudeGeometry` (height 250, thickness 10), items → `BoxGeometry(w,h,d)` at `(x, h/2, y)` rotated `-rot`, or `GLTFLoader` when `Asset.model` (glb data URL) present. Toggle button in `#tools`; re-sync on `Editor.onChange`.
