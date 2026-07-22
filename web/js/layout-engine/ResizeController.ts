import { SnapEngine } from './SnapEngine.ts';
import type { GridSize, LayoutRect, ResizeEdge, SnapState } from './types.ts';

export class ResizeController {
  private readonly gridSize: GridSize;
  private readonly snapEngine: SnapEngine;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
    this.snapEngine = new SnapEngine(gridSize);
  }

  getPreview(start: LayoutRect, edge: ResizeEdge, dx: number, dy: number, previous?: SnapState | null): LayoutRect {
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
    return this.snapEngine.snapResizeRect(next, { previous });
  }
}
