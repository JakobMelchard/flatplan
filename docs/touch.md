# Touch & Pencil

flatplan is built for fingers and the Apple Pencil first. Every action is reachable without a
keyboard through the action bar and the inspector.

## Gestures

| Gesture               | Effect                                                             |
| --------------------- | ------------------------------------------------------------------ |
| tap                   | Select. In a drawing tool, place the point.                        |
| one-finger drag       | Move the selection, otherwise pan.                                 |
| two fingers           | Pinch to zoom, drag to pan. A second finger mid-drag cancels it.   |
| two-finger tap        | Undo.                                                              |
| three-finger tap      | Redo, where iPadOS lets it through (it keeps it for its edit bar). |
| long-press on an item | Add it to or remove it from the selection.                         |
| long-press on empty   | Then drag to draw a selection box.                                 |

Redo is always available from the **Undone · Redo** pill that appears after an undo and from the
toolbar arrow.

## Apple Pencil

Once the Pencil has touched the canvas, only the Pencil places wall corners, doors and scale
points. Fingers just pan and zoom, so you can rest your hand. Finger contacts are ignored while
the Pencil is down (palm rejection). A Pencil drag on empty space draws a selection box.

## Selection

Furniture, walls and doors or windows can be selected together.

- The dashed-box button next to Select turns on **multi-select mode**: a tap adds or removes
  something (tap a selected one to drop it, drag it to move the group), a drag on empty space
  draws a box. Tap the button again or press `Esc` to leave the mode.
- Without the mode: long-press to toggle, long-press empty space and drag for a box, or drag a
  box with the Pencil. With a mouse: `Shift` or `Cmd` + click, `Shift` + drag. `Ctrl+A` selects
  everything.
- The selection moves as one. Furniture alone stops at walls; with walls in the selection the
  plan itself moves, and walls joined at a moved corner stretch along. It rotates around its
  centre, duplicates (walls with their doors) and deletes together.

A selected wall can be dragged: press it once to select, then drag. Doors and windows ride along
with their wall.

## Action bar

A bar at the bottom shows the actions for the current selection: rotate, duplicate, delete,
hinge and swing side, add door or window. While drawing walls it takes an exact length and a
direction arrow, undoes the last corner, or finishes the wall.

For a selected item, drag the dot above it to rotate in 15° steps (`Ctrl` for free rotation).

## Undo history

History covers every project change (not the view), keeps 200 steps, merges changes less than
0.4 s apart and lasts for the session.
