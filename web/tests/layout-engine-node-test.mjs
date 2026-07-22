import assert from 'node:assert/strict';

import {
  AutoPlacement,
  AnimationEngine,
  DragController,
  LayoutEngine,
  OccupancyGrid,
  SnapEngine,
  SwapEngine,
} from '../js/layout-engine/index.ts';

const gridSize = { columns: 4, rows: 4 };
const tile = (id, x, y, w = 1, h = 1) => ({
  type: 'camera',
  instanceId: id,
  cameraId: id,
  x,
  y,
  w,
  h,
});

{
  const grid = new OccupancyGrid(4, 4, [tile('a', 0, 0, 2, 2)]);
  assert.equal(grid.isAreaFree(2, 0, 2, 2), true);
  assert.equal(grid.isAreaFree(1, 1, 1, 1), false);
  assert.equal(grid.isAreaFree(3, 3, 2, 1), false);

  assert.equal(grid.occupy(tile('b', 2, 0, 2, 2)), true);
  assert.equal(grid.occupy(tile('c', 1, 0, 1, 1)), false);
  grid.release('a');
  assert.equal(grid.isAreaFree(0, 0, 2, 2), true);
}

{
  const placement = new AutoPlacement(gridSize).findFirstAvailable([
    tile('a', 0, 0, 1, 1),
    tile('b', 1, 0, 1, 1),
  ], 1, 1);
  assert.deepEqual(placement, { x: 2, y: 0, w: 1, h: 1 });

  const fullTiles = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      fullTiles.push(tile(`${x}-${y}`, x, y));
    }
  }
  assert.equal(new AutoPlacement(gridSize).findFirstAvailable(fullTiles, 1, 1), null);
}

{
  const engine = new LayoutEngine(gridSize);
  const tiles = [tile('a', 0, 0, 2, 2), tile('b', 2, 0, 2, 2)];
  const result = engine.move(tiles, ['a'], [{ x: 2, y: 0, w: 2, h: 2 }]);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'swap');
  assert.deepEqual(result.tiles.find((item) => item.instanceId === 'a'), tile('a', 2, 0, 2, 2));
  assert.deepEqual(result.tiles.find((item) => item.instanceId === 'b'), tile('b', 0, 0, 2, 2));
}

{
  const engine = new LayoutEngine(gridSize);
  const tiles = [tile('a', 0, 0, 2, 2), tile('b', 2, 0, 1, 1)];
  const result = engine.move(tiles, ['a'], [{ x: 2, y: 0, w: 2, h: 2 }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Different Size');
}

{
  const swapEngine = new SwapEngine();
  assert.equal(swapEngine.canSwap({ x: 0, y: 0, w: 2, h: 2 }, [tile('b', 2, 0, 2, 2)]), true);
  assert.equal(swapEngine.canSwap({ x: 0, y: 0, w: 2, h: 2 }, [tile('b', 2, 0, 1, 1)]), false);
}

{
  const startTiles = [tile('a', 2, 0, 1, 1), tile('b', 3, 0, 1, 1)];
  const preview = new DragController(gridSize).getPreview({
    tileIds: ['a', 'b'],
    startTiles,
    startClientX: 0,
    startClientY: 0,
  }, 200, 0, 100, 100);

  assert.deepEqual(preview.map(({ x, y }) => ({ x, y })), [{ x: 2, y: 0 }, { x: 3, y: 0 }]);
}

{
  const snap = new SnapEngine(gridSize);
  assert.deepEqual(snap.snapRect({ x: 1.82, y: 0.18, w: 1, h: 1 }), { x: 2, y: 0, w: 1, h: 1 });
  assert.deepEqual(
    snap.snapRect({ x: 1.61, y: 0.39, w: 1, h: 1 }, { previous: { x: 2, y: 0 } }),
    { x: 2, y: 0, w: 1, h: 1 }
  );
}

{
  const placement = new AutoPlacement({ columns: 6, rows: 4 }).findBestAvailable([
    tile('a', 0, 0, 2, 2),
    tile('b', 2, 0, 2, 2),
  ], 1, 1, {
    preferred: { x: 4, y: 0 },
  });
  assert.deepEqual(placement, { x: 4, y: 0, w: 1, h: 1 });
}

{
  const engine = new LayoutEngine({ columns: 6, rows: 4 });
  const tiles = [
    tile('a', 0, 0, 2, 2),
    tile('b', 4, 0, 2, 2),
    tile('c', 0, 2, 2, 2),
  ];
  const result = engine.removeAndReflow(tiles, 'a');
  assert.equal(result.ok, true);
  assert.equal(result.tiles.length, 2);
  assert.equal(result.tiles.some((item) => item.instanceId === 'a'), false);
}

{
  const animations = new AnimationEngine().diffTiles(
    [tile('a', 0, 0, 1, 1), tile('b', 1, 0, 1, 1)],
    [tile('a', 1, 0, 1, 1), tile('b', 1, 0, 1, 1)]
  );
  assert.deepEqual(animations, [{
    instanceId: 'a',
    from: { x: 0, y: 0, w: 1, h: 1 },
    to: { x: 1, y: 0, w: 1, h: 1 },
  }]);
}

{
  const engine = new LayoutEngine(gridSize);
  const result = engine.add(
    [tile('a', 0, 0, 4, 4)],
    tile('b', 0, 0, 2, 2),
    { x: 0, y: 0 }
  );
  assert.equal(result.ok, true);
  assert.equal(result.action, 'add');
  assert.equal(result.tiles.length, 2);
  assert.deepEqual(result.tiles.map((item) => ({
    id: item.instanceId,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  })), [
    { id: 'b', x: 0, y: 0, w: 2, h: 4 },
    { id: 'a', x: 2, y: 0, w: 2, h: 4 },
  ]);
}
