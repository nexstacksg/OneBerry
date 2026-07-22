import { normalizeRect, rectWithinGrid, rectsOverlap } from './geometry.ts';
import type { CollisionResult, GridSize, LayoutRect, LayoutTile } from './types.ts';

export class OccupancyGrid {
  readonly columns: number;
  readonly rows: number;
  private readonly tiles = new Map<string, LayoutTile>();
  private readonly cells = new Map<number, Set<string>>();

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
    return this.collectIdsInArea(rect).every((id) => ignored.has(id));
  }

  occupy(tile: LayoutTile): boolean {
    const normalized = { ...tile, ...normalizeRect(tile, this.size) } as LayoutTile;
    if (!this.isAreaFree(normalized.x, normalized.y, normalized.w, normalized.h, [normalized.instanceId])) {
      return false;
    }
    this.release(normalized.instanceId);
    this.tiles.set(normalized.instanceId, normalized);
    this.markCells(normalized);
    return true;
  }

  release(tile: LayoutTile | string): void {
    const instanceId = typeof tile === 'string' ? tile : tile.instanceId;
    const existing = this.tiles.get(instanceId);
    if (existing) this.unmarkCells(existing);
    this.tiles.delete(instanceId);
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
    const collidingTiles = target
      ? Array.from(new Set(this.collectIdsInArea(target)))
        .filter((id) => !ignored.has(id))
        .map((id) => this.tiles.get(id))
        .filter((tile): tile is LayoutTile => Boolean(tile))
      : this.getTiles().filter((tile, index, tiles) => {
        if (ignored.has(tile.instanceId)) return false;
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
    this.release(cameraA.instanceId);
    this.release(cameraB.instanceId);
    this.tiles.set(cameraA.instanceId, nextA);
    this.tiles.set(cameraB.instanceId, nextB);
    this.markCells(nextA);
    this.markCells(nextB);
    return true;
  }

  private replace(instanceId: string, tile: LayoutTile): boolean {
    const previous = this.tiles.get(instanceId);
    if (!previous) return false;
    const next = { ...tile, ...normalizeRect(tile, this.size), instanceId } as LayoutTile;
    if (!this.isAreaFree(next.x, next.y, next.w, next.h, [instanceId])) return false;
    this.release(instanceId);
    this.tiles.set(instanceId, next);
    this.markCells(next);
    return true;
  }

  private cellKey(x: number, y: number): number {
    return y * this.columns + x;
  }

  private markCells(tile: LayoutTile): void {
    for (let y = tile.y; y < tile.y + tile.h; y += 1) {
      for (let x = tile.x; x < tile.x + tile.w; x += 1) {
        const key = this.cellKey(x, y);
        const occupied = this.cells.get(key) || new Set<string>();
        occupied.add(tile.instanceId);
        this.cells.set(key, occupied);
      }
    }
  }

  private unmarkCells(tile: LayoutTile): void {
    for (let y = tile.y; y < tile.y + tile.h; y += 1) {
      for (let x = tile.x; x < tile.x + tile.w; x += 1) {
        const key = this.cellKey(x, y);
        const occupied = this.cells.get(key);
        if (!occupied) continue;
        occupied.delete(tile.instanceId);
        if (occupied.size === 0) this.cells.delete(key);
      }
    }
  }

  private collectIdsInArea(rect: LayoutRect): string[] {
    const ids = new Set<string>();
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        const occupied = this.cells.get(this.cellKey(x, y));
        if (!occupied) continue;
        occupied.forEach((id) => ids.add(id));
      }
    }
    return Array.from(ids);
  }
}
