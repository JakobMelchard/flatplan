# Furniture

The left panel is the catalog: a form to add pieces and the list of what you have.

## Catalog

A piece has a name, width × depth × height, a colour and optionally a top-down PNG or SVG image
(downscaled to 600 px). Height is stored for a future 3D view. The pencil icon on a card edits or
deletes the piece; deleting removes all of its placed instances.

## Placing

Drag a card onto the plan to place it where you drop it, or tap the card to put it in the middle
of the view. Placement and rotation auto-nudge to the nearest free spot; a red outline means an
overlap is left, for instance after typing coordinates in the sidebar.

## Moving

Dragging slides along wall faces (a swept test, so nothing tunnels through a wall), edges snap to
faces, and door swing zones count as solid. Drag snaps to 1 cm, `Shift` to 10 cm, `Ctrl` to
0.1 cm. The properties panel shows x, y and rotation as editable inputs.

| Key             | Effect                        |
| --------------- | ----------------------------- |
| `R` / `Shift+R` | Rotate ±90°                   |
| `Q` / `E`       | Rotate ±15°                   |
| arrows          | Nudge 1 cm, `Shift` for 10 cm |
| `Ctrl+D`        | Duplicate                     |
| `Del`           | Remove                        |

On touch, the same actions are in the bar below the selection and the rotate handle above the
item (see [Touch & Pencil](touch.md)).
