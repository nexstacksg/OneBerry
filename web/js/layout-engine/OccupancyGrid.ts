import { normalizeRect, rectWithinGrid, rectsOverlap } from './geometry.ts';
import type { CollisionResult, GridSize, LayoutRect, LayoutTile } from './types.ts';

export class OccupancyGrid {
  readonly columns: number;
  readonly rows: number;
  private readonly tiles = new Map<string, LayoutTile>();

  constructor(columns: number, rows: number, tiles: LayoutTile[] = []) {
    this.columns = Math.max(1, Math.floor(columns));
    this.rows = Math.max(1, Math.floor(rows));
    tiles.forEach((tile) => this.occupy(tile));
  }

  get size(): GridSize {
    return { columns: this.columns, rows: this.rows };
  }

  getTiles(): LayoutTile[] {
    return Array.from(this.tiles.values()).map((tile) => ({ ...tile }));
  }

  isAreaFree(x: number, y: number, w: number, h: number, ignoredIds: string[] = []): boolean {
    const rect = { x, y, w, h };
    if (!rectWithinGrid(rect, this.size)) return false;
    const ignored = new Set(ignoredIds);
    return !this.getTiles().some((tile) => !ignored.has(tile.instanceId) && rectsOverlap(rect, tile));
  }

  occupy(tile: LayoutTile): boolean {
    const normalized = { ...tile, ...normalizeRect(tile, this.size) } as LayoutTile;
    if (!this.isAreaFree(normalized.x, normalized.y, normalized.w, normalized.h, [normalized.instanceId])) {
      return false;
    }
    this.tiles.set(normalized.instanceId, normalized);
    return true;
  }

  release(tile: LayoutTile | string): void {
    this.tiles.delete(typeof tile === 'string' ? tile : tile.instanceId);
  }

  move(tile: LayoutTile, newX: number, newY: number): boolean {
    const next = { ...tile, x: newX, y: newY };
    return this.replace(tile.instanceId, next);
  }

  resize(tile: LayoutTile, newW: number, newH: number): boolean {
    const next = { ...tile, w: newW, h: newH };
    return this.replace(tile.instanceId, next);
  }

  findCollision(rect?: LayoutRect, ignoredIds: string[] = []): CollisionResult {
    const ignored = new Set(ignoredIds);
    const target = rect ? normalizeRect(rect, this.size) : null;
    const collidingTiles = this.getTiles().filter((tile, index, tiles) => {
      if (ignored.has(tile.instanceId)) return false;
      if (target) return rectsOverlap(target, tile);
      return tiles.slice(index + 1).some((other) => rectsOverlap(tile, other));
    });
    return { collidingTiles };
  }

  findNearestValidPlacement(rect: LayoutRect, ignoredIds: string[] = []): LayoutRect | null {
    const target = normalizeRect(rect, this.size);
    let best: LayoutRect | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let y = 0; y <= this.rows - target.h; y += 1) {
      for (let x = 0; x <= this.columns - target.w; x += 1) {
        if (!this.isAreaFree(x, y, target.w, target.h, ignoredIds)) continue;
        const distance = Math.abs(target.x - x) + Math.abs(target.y - y);
        if (distance < bestDistance) {
          best = { x, y, w: target.w, h: target.h };
          bestDistance = distance;
        }
      }
    }

    return best;
  }

  swap(cameraA: LayoutTile, cameraB: LayoutTile): boolean {
    const nextA = { ...cameraA, x: cameraB.x, y: cameraB.y };
    const nextB = { ...cameraB, x: cameraA.x, y: cameraA.y };
    if (!this.isAreaFree(nextA.x, nextA.y, nextA.w, nextA.h, [cameraA.instanceId, cameraB.instanceId])) return false;
    if (!this.isAreaFree(nextB.x, nextB.y, nextB.w, nextB.h, [cameraA.instanceId, cameraB.instanceId])) return false;
    this.tiles.set(cameraA.instanceId, nextA);
    this.tiles.set(cameraB.instanceId, nextB);
    return true;
  }

  private replace(instanceId: string, tile: LayoutTile): boolean {
    const previous = this.tiles.get(instanceId);
    if (!previous) return false;
    const next = { ...tile, ...normalizeRect(tile, this.size), instanceId } as LayoutTile;
    if (!this.isAreaFree(next.x, next.y, next.w, next.h, [instanceId])) return false;
    this.tiles.set(instanceId, next);
    return true;
  }
}
