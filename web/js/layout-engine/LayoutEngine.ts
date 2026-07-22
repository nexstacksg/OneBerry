import { AutoPlacement } from './AutoPlacement.ts';
import { CollisionDetector } from './CollisionDetector.ts';
import { OccupancyGrid } from './OccupancyGrid.ts';
import { SwapEngine } from './SwapEngine.ts';
import { normalizeRect, sameSize } from './geometry.ts';
import type { GridSize, LayoutRect, LayoutTile, ReflowOptions } from './types.ts';

export type CommitResult =
  | { ok: true; tiles: LayoutTile[]; action: 'move' | 'resize' | 'swap' | 'add' | 'remove' }
  | { ok: false; reason: 'Layout Full' | 'Collision' | 'Different Size' | 'Outside Grid' };

export class LayoutEngine {
  readonly gridSize: GridSize;
  private readonly swapEngine = new SwapEngine();

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  normalize(tile: LayoutTile): LayoutTile {
    return { ...tile, ...normalizeRect(tile, this.gridSize) } as LayoutTile;
  }

  createGrid(tiles: LayoutTile[]): OccupancyGrid {
    return new OccupancyGrid(this.gridSize.columns, this.gridSize.rows, tiles.map((tile) => this.normalize(tile)));
  }

  validate(rect: LayoutRect, tiles: LayoutTile[], ignoredIds: string[] = []): boolean {
    return new CollisionDetector(this.createGrid(tiles)).isValid(rect, ignoredIds);
  }

  move(tiles: LayoutTile[], tileIds: string[], rects: LayoutRect[]): CommitResult {
    const ids = new Set(tileIds);
    const sourceTiles = tiles.filter((tile) => ids.has(tile.instanceId));
    if (sourceTiles.length !== rects.length || sourceTiles.length === 0) {
      return { ok: false, reason: 'Collision' };
    }

    const proposed = sourceTiles.map((tile, index) => ({ ...tile, ...normalizeRect(rects[index], this.gridSize) } as LayoutTile));
    const movingGrid = new OccupancyGrid(this.gridSize.columns, this.gridSize.rows);
    if (!proposed.every((tile) => movingGrid.occupy(tile))) {
      return { ok: false, reason: 'Collision' };
    }

    const stationary = tiles.filter((tile) => !ids.has(tile.instanceId));
    const collisions = stationary.filter((tile) => proposed.some((candidate) => this.overlaps(candidate, tile)));
    if (collisions.length === 0) {
      return { ok: true, action: 'move', tiles: this.mergeTiles(tiles, proposed) };
    }

    if (proposed.length === 1 && this.swapEngine.canSwap(proposed[0], collisions)) {
      return { ok: true, action: 'swap', tiles: this.swapEngine.applySwap(tiles, proposed[0].instanceId, collisions[0].instanceId) };
    }

    if (collisions.length === 1 && !sameSize(proposed[0], collisions[0])) {
      return { ok: false, reason: 'Different Size' };
    }
    return { ok: false, reason: 'Collision' };
  }

  resize(tiles: LayoutTile[], tileId: string, rect: LayoutRect): CommitResult {
    const tile = tiles.find((candidate) => candidate.instanceId === tileId);
    if (!tile) return { ok: false, reason: 'Collision' };
    const next = { ...tile, ...normalizeRect(rect, this.gridSize) } as LayoutTile;
    const grid = this.createGrid(tiles.filter((candidate) => candidate.instanceId !== tileId));
    if (!grid.isAreaFree(next.x, next.y, next.w, next.h)) {
      return { ok: false, reason: 'Collision' };
    }
    return { ok: true, action: 'resize', tiles: this.mergeTiles(tiles, [next]) };
  }

  add(tiles: LayoutTile[], tile: LayoutTile, preferred?: Pick<LayoutRect, 'x' | 'y'>): CommitResult {
    const normalized = this.normalize(preferred ? { ...tile, x: preferred.x, y: preferred.y } : tile);
    if (preferred && this.validate(normalized, tiles)) {
      return { ok: true, action: 'add', tiles: [...tiles, normalized] };
    }

    const autoPlacement = new AutoPlacement(this.gridSize);
    const placement = autoPlacement.findBestAvailable(tiles, normalized.w, normalized.h, {
      preferred: preferred || { x: normalized.x, y: normalized.y },
      relatedTiles: tiles,
    });
    if (!placement) {
      const reflowedTiles = autoPlacement.createSpaceForTile(tiles, normalized, preferred || { x: normalized.x, y: normalized.y });
      if (!reflowedTiles) return { ok: false, reason: 'Layout Full' };
      return { ok: true, action: 'add', tiles: reflowedTiles };
    }
    return { ok: true, action: 'add', tiles: [...tiles, { ...normalized, ...placement }] };
  }

  remove(tiles: LayoutTile[], tileId: string): CommitResult {
    return { ok: true, action: 'remove', tiles: tiles.filter((tile) => tile.instanceId !== tileId) };
  }

  removeAndReflow(tiles: LayoutTile[], tileId: string, options: ReflowOptions = {}): CommitResult {
    const removedTile = tiles.find((tile) => tile.instanceId === tileId) || null;
    const remainingTiles = tiles.filter((tile) => tile.instanceId !== tileId);
    if (!removedTile) return { ok: true, action: 'remove', tiles: remainingTiles };

    const autoPlacement = new AutoPlacement(this.gridSize);
    return {
      ok: true,
      action: 'remove',
      tiles: autoPlacement.reduceFragmentation(remainingTiles, {
        ...options,
        removedTile,
      }),
    };
  }

  private mergeTiles(tiles: LayoutTile[], replacements: LayoutTile[]): LayoutTile[] {
    const replacementById = new Map(replacements.map((tile) => [tile.instanceId, tile]));
    return tiles.map((tile) => replacementById.get(tile.instanceId) || tile);
  }

  private overlaps(a: LayoutRect, b: LayoutRect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
}
