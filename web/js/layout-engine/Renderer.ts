import { normalizeRect } from './geometry.ts';
import type { GridSize, LayoutRect } from './types.ts';

export class Renderer {
  private readonly gridSize: GridSize;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  rectToStyle(rect: LayoutRect): Record<string, string | number> {
    const normalized = normalizeRect(rect, this.gridSize);
    return {
      position: 'absolute',
      left: `${(normalized.x / this.gridSize.columns) * 100}%`,
      top: `${(normalized.y / this.gridSize.rows) * 100}%`,
      width: `${(normalized.w / this.gridSize.columns) * 100}%`,
      height: `${(normalized.h / this.gridSize.rows) * 100}%`,
    };
  }

  pointToCell(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    const cellWidth = rect.width / this.gridSize.columns;
    const cellHeight = rect.height / this.gridSize.rows;
    return {
      x: Math.max(0, Math.min(this.gridSize.columns - 1, Math.floor((clientX - rect.left) / Math.max(1, cellWidth)))),
      y: Math.max(0, Math.min(this.gridSize.rows - 1, Math.floor((clientY - rect.top) / Math.max(1, cellHeight)))),
    };
  }
}
