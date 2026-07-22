import type { LayoutRect, LayoutTile } from './types.ts';

export interface TileAnimation {
  instanceId: string;
  from: LayoutRect;
  to: LayoutRect;
}

export class AnimationEngine {
  diffTiles(previousTiles: LayoutTile[], nextTiles: LayoutTile[]): TileAnimation[] {
    const previousById = new Map(previousTiles.map((tile) => [tile.instanceId, tile]));
    return nextTiles
      .map((tile) => {
        const previous = previousById.get(tile.instanceId);
        if (!previous || this.sameRect(previous, tile)) return null;
        return {
          instanceId: tile.instanceId,
          from: this.toRect(previous),
          to: this.toRect(tile),
        };
      })
      .filter((animation): animation is TileAnimation => Boolean(animation));
  }

  private sameRect(a: LayoutRect, b: LayoutRect): boolean {
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  private toRect(rect: LayoutRect): LayoutRect {
    return {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
    };
  }
}
