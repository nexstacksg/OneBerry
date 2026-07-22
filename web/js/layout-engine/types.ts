export const DEFAULT_GRID_COLUMNS = 24;
export const DEFAULT_GRID_ROWS = 24;

export type TileKind = 'camera' | 'slot';
export type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw';
export type PlacementStatus = 'valid' | 'invalid';

export interface GridSize {
  columns: number;
  rows: number;
}

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CameraTile extends LayoutRect {
  type: 'camera';
  instanceId: string;
  cameraId: string;
}

export interface SlotTile extends LayoutRect {
  type: 'slot';
  instanceId: string;
  cameraId: '';
}

export type LayoutTile = CameraTile | SlotTile;

export interface SerializedCameraTile extends LayoutRect {
  id: string;
  camera: string;
}

export interface SerializedSlotTile extends LayoutRect {
  id: string;
}

export interface PlacementPreview extends LayoutRect {
  status: PlacementStatus;
  tileIds: string[];
}

export interface CollisionResult {
  collidingTiles: LayoutTile[];
}

export interface LayoutCommand {
  readonly label: string;
  execute(): LayoutTile[];
  undo(): LayoutTile[];
}

export interface SnapState {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface SnapOptions {
  threshold?: number;
  releaseThreshold?: number;
  previous?: SnapState | null;
}

export interface PlacementOptions {
  preferred?: Pick<LayoutRect, 'x' | 'y'> | null;
  relatedTiles?: LayoutTile[];
}

export interface ReflowOptions {
  removedTile?: LayoutTile | null;
  pinnedIds?: string[];
}
