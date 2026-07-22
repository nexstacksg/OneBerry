import type { GridSize, LayoutRect } from './types.ts';

export function clampInteger(value: number, min: number, max: number): number {
  const integer = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : min;
  return Math.max(min, Math.min(max, integer));
}

export function normalizeGridSize(size: Partial<GridSize>): GridSize {
  return {
    columns: clampInteger(Number(size.columns), 1, 256),
    rows: clampInteger(Number(size.rows), 1, 256),
  };
}

export function normalizeRect(rect: LayoutRect, grid: GridSize): LayoutRect {
  const safeGrid = normalizeGridSize(grid);
  const w = clampInteger(rect.w, 1, safeGrid.columns);
  const h = clampInteger(rect.h, 1, safeGrid.rows);
  return {
    x: clampInteger(rect.x, 0, safeGrid.columns - w),
    y: clampInteger(rect.y, 0, safeGrid.rows - h),
    w,
    h,
  };
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function sameSize(a: LayoutRect, b: LayoutRect): boolean {
  return a.w === b.w && a.h === b.h;
}

export function rectWithinGrid(rect: LayoutRect, grid: GridSize): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.w >= 1 && rect.h >= 1 &&
    rect.x + rect.w <= grid.columns && rect.y + rect.h <= grid.rows;
}
