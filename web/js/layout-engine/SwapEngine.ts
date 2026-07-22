import { sameSize } from './geometry.ts';
import type { LayoutRect, LayoutTile } from './types.ts';

export class SwapEngine {
  canSwap(source: LayoutRect, collisions: LayoutTile[]): boolean {
    return collisions.length === 1 && sameSize(source, collisions[0]);
  }

  applySwap(tiles: LayoutTile[], sourceId: string, targetId: string): LayoutTile[] {
    const source = tiles.find((tile) => tile.instanceId === sourceId);
    const target = tiles.find((tile) => tile.instanceId === targetId);
    if (!source || !target || !sameSize(source, target)) return tiles;
    return tiles.map((tile) => {
      if (tile.instanceId === sourceId) return { ...tile, x: target.x, y: target.y };
      if (tile.instanceId === targetId) return { ...tile, x: source.x, y: source.y };
      return tile;
    });
  }
}
