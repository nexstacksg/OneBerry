import { normalizeRect } from './geometry.ts';
import type { GridSize, LayoutRect, LayoutTile } from './types.ts';

export interface DragSession {
  tileIds: string[];
  startTiles: LayoutTile[];
  startClientX: number;
  startClientY: number;
}

export class DragController {
  private readonly gridSize: GridSize;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  getPreview(session: DragSession, clientX: number, clientY: number, cellWidth: number, cellHeight: number): LayoutRect[] {
    const requestedDx = Math.round((clientX - session.startClientX) / Math.max(1, cellWidth));
    const requestedDy = Math.round((clientY - session.startClientY) / Math.max(1, cellHeight));
    const bounds = session.startTiles.reduce((acc, tile) => ({
      minX: Math.min(acc.minX, tile.x),
      minY: Math.min(acc.minY, tile.y),
      maxX: Math.max(acc.maxX, tile.x + tile.w),
      maxY: Math.max(acc.maxY, tile.y + tile.h),
    }), {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    });
    const dx = Math.max(-bounds.minX, Math.min(this.gridSize.columns - bounds.maxX, requestedDx));
    const dy = Math.max(-bounds.minY, Math.min(this.gridSize.rows - bounds.maxY, requestedDy));

    return session.startTiles.map((tile) => normalizeRect({ ...tile, x: tile.x + dx, y: tile.y + dy }, this.gridSize));
  }
}
