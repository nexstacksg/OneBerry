import { OccupancyGrid } from './OccupancyGrid.ts';
import type { GridSize, LayoutRect, LayoutTile, PlacementOptions, ReflowOptions } from './types.ts';

export class AutoPlacement {
  private readonly gridSize: GridSize;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  findFirstAvailable(tiles: LayoutTile[], width: number, height: number): LayoutRect | null {
    return this.findBestAvailable(tiles, width, height);
  }

  findBestAvailable(tiles: LayoutTile[], width: number, height: number, options: PlacementOptions = {}): LayoutRect | null {
    const grid = new OccupancyGrid(this.gridSize.columns, this.gridSize.rows, tiles);
    const w = Math.max(1, Math.min(this.gridSize.columns, Math.floor(width)));
    const h = Math.max(1, Math.min(this.gridSize.rows, Math.floor(height)));
    const candidates: LayoutRect[] = [];

    for (let y = 0; y <= this.gridSize.rows - h; y += 1) {
      for (let x = 0; x <= this.gridSize.columns - w; x += 1) {
        if (grid.isAreaFree(x, y, w, h)) candidates.push({ x, y, w, h });
      }
    }

    if (candidates.length === 0) return null;
    if (!options.preferred && (!options.relatedTiles || options.relatedTiles.length === 0)) {
      return candidates[0];
    }

    return candidates.reduce((best, candidate) => (
      this.scorePlacement(candidate, tiles, options) < this.scorePlacement(best, tiles, options)
        ? candidate
        : best
    ), candidates[0]);
  }

  createSpaceForTile(tiles: LayoutTile[], tile: LayoutTile, preferred?: Pick<LayoutRect, 'x' | 'y'> | null): LayoutTile[] | null {
    const allTiles = [...tiles.map((item) => ({ ...item })), { ...tile }];
    if (allTiles.length === 0) return [];

    const layout = this.pickBalancedLayout(allTiles.length);
    const orderedTiles = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x).map((item) => ({ ...item }));
    const insertionIndex = preferred
      ? this.preferredInsertionIndex(preferred, layout.columns, layout.rows, allTiles.length)
      : orderedTiles.length;
    orderedTiles.splice(insertionIndex, 0, { ...tile });

    const nextTiles = orderedTiles.map((item, index) => {
      const col = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      const x = Math.floor((col * this.gridSize.columns) / layout.columns);
      const y = Math.floor((row * this.gridSize.rows) / layout.rows);
      const nextX = Math.floor(((col + 1) * this.gridSize.columns) / layout.columns);
      const nextY = Math.floor(((row + 1) * this.gridSize.rows) / layout.rows);
      return {
        ...item,
        x,
        y,
        w: Math.max(1, nextX - x),
        h: Math.max(1, nextY - y),
      };
    });

    const grid = new OccupancyGrid(this.gridSize.columns, this.gridSize.rows);
    return nextTiles.every((item) => grid.occupy(item)) ? nextTiles : null;
  }

  reduceFragmentation(tiles: LayoutTile[], options: ReflowOptions = {}): LayoutTile[] {
    const pinned = new Set(options.pinnedIds || []);
    const removedTile = options.removedTile || null;
    let next = tiles.map((tile) => ({ ...tile }));
    if (!removedTile) return next;

    const ordered = [...next].sort((a, b) => this.rectDistance(a, removedTile) - this.rectDistance(b, removedTile));
    ordered.forEach((tile) => {
      if (pinned.has(tile.instanceId)) {
        return;
      }
      const currentIndex = next.findIndex((candidate) => candidate.instanceId === tile.instanceId);
      if (currentIndex === -1) return;

      const grid = new OccupancyGrid(this.gridSize.columns, this.gridSize.rows, next.filter((candidate) => candidate.instanceId !== tile.instanceId));
      const preferredRect = {
        ...tile,
        x: Math.max(0, Math.min(tile.x, removedTile.x)),
        y: Math.max(0, Math.min(tile.y, removedTile.y)),
      };
      const placement = grid.findNearestValidPlacement(preferredRect, []);
      if (!placement) return;

      const currentDistance = this.rectDistance(tile, removedTile);
      const nextDistance = this.rectDistance(placement, removedTile);
      const movement = Math.abs(placement.x - tile.x) + Math.abs(placement.y - tile.y);
      if (nextDistance <= currentDistance && movement <= Math.max(tile.w, tile.h)) {
        next[currentIndex] = { ...tile, ...placement };
      }
    });

    next = this.expandIntoAdjacentSpace(next, pinned, removedTile);
    return next;
  }

  private scorePlacement(candidate: LayoutRect, tiles: LayoutTile[], options: PlacementOptions): number {
    const preferred = options.preferred;
    const relatedTiles = options.relatedTiles || tiles;
    const preferredDistance = preferred
      ? Math.abs(candidate.x - preferred.x) + Math.abs(candidate.y - preferred.y)
      : candidate.y * this.gridSize.columns + candidate.x;
    const groupingDistance = relatedTiles.length > 0
      ? Math.min(...relatedTiles.map((tile) => this.rectDistance(candidate, tile)))
      : 0;
    const edgePenalty = this.edgeTouchCount(candidate, tiles) === 0 ? 6 : 0;
    const rowFragmentPenalty = this.countRowFragments([...tiles, { ...candidate, type: 'slot', instanceId: '__candidate__', cameraId: '' }]) * 0.8;
    const rectanglePenalty = Math.abs(candidate.w - candidate.h) * 0.05;

    return preferredDistance * 3 + groupingDistance * 2 + edgePenalty + rowFragmentPenalty + rectanglePenalty;
  }

  private expandIntoAdjacentSpace(tiles: LayoutTile[], pinned: Set<string>, removedTile: LayoutTile | null): LayoutTile[] {
    if (!removedTile) return tiles;
    const next = tiles.map((tile) => ({ ...tile }));
    let changed = true;

    while (changed) {
      changed = false;
      for (let index = 0; index < next.length; index += 1) {
        const tile = next[index];
        if (pinned.has(tile.instanceId)) continue;
        const others = next.filter((_, otherIndex) => otherIndex !== index);
        const grid = new OccupancyGrid(this.gridSize.columns, this.gridSize.rows, others);
        const expandedRight = { ...tile, w: tile.w + 1 };
        const expandedDown = { ...tile, h: tile.h + 1 };

        if (
          tile.x + expandedRight.w <= this.gridSize.columns &&
          this.touchesRemovedSpace(expandedRight, removedTile) &&
          grid.isAreaFree(expandedRight.x, expandedRight.y, expandedRight.w, expandedRight.h)
        ) {
          next[index] = expandedRight;
          changed = true;
          continue;
        }
        if (
          tile.y + expandedDown.h <= this.gridSize.rows &&
          this.touchesRemovedSpace(expandedDown, removedTile) &&
          grid.isAreaFree(expandedDown.x, expandedDown.y, expandedDown.w, expandedDown.h)
        ) {
          next[index] = expandedDown;
          changed = true;
        }
      }
    }

    return next;
  }

  private rectDistance(a: LayoutRect, b: LayoutRect): number {
    const dx = Math.max(0, Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)));
    const dy = Math.max(0, Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h)));
    return dx + dy;
  }

  private touchesRemovedSpace(candidate: LayoutRect, removedTile: LayoutTile): boolean {
    return !(
      candidate.x + candidate.w < removedTile.x ||
      candidate.x > removedTile.x + removedTile.w ||
      candidate.y + candidate.h < removedTile.y ||
      candidate.y > removedTile.y + removedTile.h
    );
  }

  private edgeTouchCount(candidate: LayoutRect, tiles: LayoutTile[]): number {
    return tiles.filter((tile) => (
      candidate.x === tile.x + tile.w ||
      candidate.x + candidate.w === tile.x ||
      candidate.y === tile.y + tile.h ||
      candidate.y + candidate.h === tile.y
    )).length;
  }

  private countRowFragments(tiles: LayoutTile[]): number {
    let fragments = 0;
    for (let y = 0; y < this.gridSize.rows; y += 1) {
      let inFragment = false;
      for (let x = 0; x < this.gridSize.columns; x += 1) {
        const occupied = tiles.some((tile) => x >= tile.x && x < tile.x + tile.w && y >= tile.y && y < tile.y + tile.h);
        if (occupied && !inFragment) fragments += 1;
        inFragment = occupied;
      }
    }
    return fragments;
  }

  private pickBalancedLayout(count: number): { columns: number; rows: number } {
    const safeCount = Math.max(1, Math.floor(count));
    const workspaceAspect = this.gridSize.columns / Math.max(1, this.gridSize.rows);
    let best = { columns: safeCount, rows: 1 };
    let bestScore = Number.POSITIVE_INFINITY;

    for (let rows = 1; rows <= safeCount; rows += 1) {
      const columns = Math.ceil(safeCount / rows);
      const waste = columns * rows - safeCount;
      const aspect = columns / rows;
      const aspectPenalty = Math.abs(Math.log(aspect / workspaceAspect));
      const score = waste * 2 + aspectPenalty;
      if (score < bestScore) {
        best = { columns, rows };
        bestScore = score;
      }
    }

    return best;
  }

  private preferredInsertionIndex(preferred: Pick<LayoutRect, 'x' | 'y'>, columns: number, rows: number, count: number): number {
    const colWidth = this.gridSize.columns / Math.max(1, columns);
    const rowHeight = this.gridSize.rows / Math.max(1, rows);
    const col = Math.max(0, Math.min(columns - 1, Math.floor(preferred.x / Math.max(1, colWidth))));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(preferred.y / Math.max(1, rowHeight))));
    return Math.max(0, Math.min(count - 1, row * columns + col));
  }
}
