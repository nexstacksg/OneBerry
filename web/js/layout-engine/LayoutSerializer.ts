import { normalizeRect } from './geometry.ts';
import type { GridSize, LayoutTile, SerializedCameraTile, SerializedSlotTile } from './types.ts';

export class LayoutSerializer {
  private readonly gridSize: GridSize;

  constructor(gridSize: GridSize) {
    this.gridSize = gridSize;
  }

  serializeCameras(tiles: LayoutTile[]): SerializedCameraTile[] {
    return tiles.filter((tile) => tile.type === 'camera' && tile.cameraId).map((tile) => {
      const rect = normalizeRect(tile, this.gridSize);
      return { id: tile.instanceId, camera: tile.cameraId, ...rect };
    });
  }

  serializeSlots(tiles: LayoutTile[]): SerializedSlotTile[] {
    return tiles.filter((tile) => tile.type === 'slot').map((tile) => {
      const rect = normalizeRect(tile, this.gridSize);
      return { id: tile.instanceId, ...rect };
    });
  }
}
