import { normalizeRect } from './geometry.ts';
import { SnapEngine } from './SnapEngine.ts';
import type { GridSize, LayoutRect, LayoutTile, SnapState } from './types.ts';

export interface DragSession {
  tileIds: string[];
  startTiles: LayoutTile[];
  startClientX: number;
  startClientY: number;
}

export class DragController {
  private readonly gridSize: GridSize;
  private readonly snapEngine: SnapEngine;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
    this.snapEngine = new SnapEngine(gridSize);
  }

  getPreview(session: DragSession, clientX: number, clientY: number, cellWidth: number, cellHeight: number): LayoutRect[] {
    return this.getMagneticPreview(session, clientX, clientY, cellWidth, cellHeight);
  }

  getMagneticPreview(
    session: DragSession,
    clientX: number,
    clientY: number,
    cellWidth: number,
    cellHeight: number,
    previous?: SnapState | null
  ): LayoutRect[] {
    const requestedDx = (clientX - session.startClientX) / Math.max(1, cellWidth);
    const requestedDy = (clientY - session.startClientY) / Math.max(1, cellHeight);
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
    const snappedAnchor = this.snapEngine.snapRect({
      x: bounds.minX + dx,
      y: bounds.minY + dy,
      w: Math.max(1, bounds.maxX - bounds.minX),
      h: Math.max(1, bounds.maxY - bounds.minY),
    }, { previous });
    const snappedDx = snappedAnchor.x - bounds.minX;
    const snappedDy = snappedAnchor.y - bounds.minY;

    return session.startTiles.map((tile) => normalizeRect({ ...tile, x: tile.x + snappedDx, y: tile.y + snappedDy }, this.gridSize));
  }

  getCursorOffset(session: DragSession, clientX: number, clientY: number): { dx: number; dy: number } {
    return {
      dx: clientX - session.startClientX,
      dy: clientY - session.startClientY,
    };
  }
}
