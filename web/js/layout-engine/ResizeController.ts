import { normalizeRect } from './geometry.ts';
import type { GridSize, LayoutRect, ResizeEdge } from './types.ts';

export class ResizeController {
  private readonly gridSize: GridSize;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  getPreview(start: LayoutRect, edge: ResizeEdge, dx: number, dy: number): LayoutRect {
    const next = { ...start };
    if (edge.includes('e')) next.w = start.w + dx;
    if (edge.includes('s')) next.h = start.h + dy;
    if (edge.includes('w')) {
      next.x = start.x + dx;
      next.w = start.w - dx;
    }
    if (edge.includes('n')) {
      next.y = start.y + dy;
      next.h = start.h - dy;
    }
    return normalizeRect(next, this.gridSize);
  }
}
