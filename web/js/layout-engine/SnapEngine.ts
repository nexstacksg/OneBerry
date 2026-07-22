import { clampInteger, normalizeRect } from './geometry.ts';
import type { GridSize, LayoutRect, SnapOptions, SnapState } from './types.ts';

const DEFAULT_SNAP_THRESHOLD = 0.28;
const DEFAULT_RELEASE_THRESHOLD = 0.42;

export class SnapEngine {
  private readonly gridSize: GridSize;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  snapScalar(value: number, min: number, max: number, previous?: number, options: SnapOptions = {}): number {
    const threshold = options.threshold ?? DEFAULT_SNAP_THRESHOLD;
    const releaseThreshold = options.releaseThreshold ?? DEFAULT_RELEASE_THRESHOLD;
    const clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
    const nearest = Math.round(clamped);

    if (previous !== undefined && previous >= min && previous <= max && Math.abs(clamped - previous) <= releaseThreshold) {
      return previous;
    }

    if (Math.abs(clamped - nearest) <= threshold) {
      return clampInteger(nearest, min, max);
    }

    return clampInteger(clamped, min, max);
  }

  snapRect(rect: LayoutRect, options: SnapOptions = {}): LayoutRect {
    const normalized = normalizeRect(rect, this.gridSize);
    const previous: SnapState = options.previous || {};
    const maxX = Math.max(0, this.gridSize.columns - normalized.w);
    const maxY = Math.max(0, this.gridSize.rows - normalized.h);

    return {
      x: this.snapScalar(rect.x, 0, maxX, previous.x, options),
      y: this.snapScalar(rect.y, 0, maxY, previous.y, options),
      w: normalized.w,
      h: normalized.h,
    };
  }

  snapResizeRect(rect: LayoutRect, options: SnapOptions = {}): LayoutRect {
    const previous: SnapState = options.previous || {};
    const safeW = this.snapScalar(rect.w, 1, this.gridSize.columns, previous.w, options);
    const safeH = this.snapScalar(rect.h, 1, this.gridSize.rows, previous.h, options);
    return normalizeRect({
      x: this.snapScalar(rect.x, 0, Math.max(0, this.gridSize.columns - safeW), previous.x, options),
      y: this.snapScalar(rect.y, 0, Math.max(0, this.gridSize.rows - safeH), previous.y, options),
      w: safeW,
      h: safeH,
    }, this.gridSize);
  }
}
