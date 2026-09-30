# Floor plan

Walls are solid: furniture slides along their faces and cannot pass through them. Draw them by
hand or trace a scanned plan.

## Walls

Pick the Wall tool (`W`) and tap corner after corner.

- Tap the first corner again to close the outline. Tap the last corner again, press `Esc`,
  double-click or use **Done** to finish an open run.
- The bottom bar takes an exact segment length in cm plus a direction arrow. With a keyboard,
  type the digits and `Enter` to draw that length along the cursor axis.
- `Shift` locks the segment to 90°, `Ctrl` disables grid snapping.
- Select a wall and press `Del` (or the bar's delete) to remove it, including its openings.

Wall thickness is set under Floor plan in the properties panel and applies to all walls. Walls
carry stable ids so doors and windows keep their place when you edit.

## Plan image

**Upload plan image** puts a photo or scan under the canvas. Then tap two points with a known
distance and enter it in cm; the image is rescaled around the first point. An opacity slider
fades it under your walls. You can trace walls over it or just place furniture on the scan.

## Doors and windows

Press `D` for a door or `N` for a window and tap a wall, or select the wall and choose **Add door**
or **Add window** in the action bar. Drag the opening along its wall. The inspector sets width,
offset from the wall's start, and for doors the hinge side and swing side.

A door's swing zone (a square of the door's width) is solid for furniture like the wall itself,
so nothing gets placed where the door needs to open.
