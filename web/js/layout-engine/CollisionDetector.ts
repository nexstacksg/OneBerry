import { OccupancyGrid } from './OccupancyGrid.ts';
import type { LayoutRect, LayoutTile } from './types.ts';

export class CollisionDetector {
  private readonly grid: OccupancyGrid;

  constructor(grid: OccupancyGrid) {
    this.grid = grid;
  }

  collidingTiles(rect: LayoutRect, ignoredIds: string[] = []): LayoutTile[] {
    return this.grid.findCollision(rect, ignoredIds).collidingTiles;
  }

  isValid(rect: LayoutRect, ignoredIds: string[] = []): boolean {
    return this.grid.isAreaFree(rect.x, rect.y, rect.w, rect.h, ignoredIds);
  }
}
