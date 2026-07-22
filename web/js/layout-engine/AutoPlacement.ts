import { OccupancyGrid } from './OccupancyGrid.ts';
import type { GridSize, LayoutRect, LayoutTile } from './types.ts';

export class AutoPlacement {
  private readonly gridSize: GridSize;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  findFirstAvailable(tiles: LayoutTile[], width: number, height: number): LayoutRect | null {
    const grid = new OccupancyGrid(this.gridSize.columns, this.gridSize.rows, tiles);
    const w = Math.max(1, Math.min(this.gridSize.columns, Math.floor(width)));
    const h = Math.max(1, Math.min(this.gridSize.rows, Math.floor(height)));

    for (let y = 0; y <= this.gridSize.rows - h; y += 1) {
      for (let x = 0; x <= this.gridSize.columns - w; x += 1) {
        if (grid.isAreaFree(x, y, w, h)) return { x, y, w, h };
      }
    }

    return null;
  }
}
