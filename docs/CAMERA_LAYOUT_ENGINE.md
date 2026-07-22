# Camera Layout Engine

The live workspace uses a logical occupancy grid rather than CSS Grid. The default grid is 24 columns by 24 rows. Tiles store only cell coordinates:

```ts
{ id, cameraId, x, y, w, h }
```

Pixel positions are derived at render time from the current container size. Window resizing does not mutate `x`, `y`, `w`, or `h`, so a saved layout recreates the same relative arrangement on any monitor.

## Major Algorithms

`OccupancyGrid` owns collision truth. It normalizes rectangles to grid bounds, marks occupied cells by tile ID, answers `isAreaFree`, and returns collisions for proposed rectangles. It never accepts overlapping occupied rectangles.

`AutoPlacement` scans top to bottom, then left to right, and returns the first rectangle that fits. If no rectangle fits, callers surface `Layout Full`.

`LayoutEngine` coordinates move, resize, add, remove, and swap. Move commits use these collision rules:

- Empty destination: move.
- One collision with identical size: swap positions.
- One collision with different size: reject.
- Multiple collisions: reject.

`DragController` and `ResizeController` calculate snapped cell previews from pointer deltas. They do not mutate layout state. The Preact renderer shows a green or red preview during the gesture and commits through `LayoutEngine` on pointer release.

`LayoutSerializer` persists only `layoutId`, camera ID, and logical cell coordinates. It never writes pixel values.

`Renderer` is the only layout module that knows about DOM geometry. It converts cells to absolute-position percentage styles and pointer coordinates to logical cells.

`HistoryManager` stores command objects for undo and redo. Move, resize, swap, add, and remove commands hold the previous and next tile arrays. `Ctrl+Z` undoes, and `Ctrl+Shift+Z` redoes.
