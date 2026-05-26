import {
  ACCESS_TAG_KIND,
  addLocationToCatalog,
  buildBuildingTree,
  compareAccessTags,
  getAccessTagKind,
  getAccessTagLabel,
  normalizeLocationCatalog,
} from '../js/utils/building-hierarchy.js';

describe('building hierarchy access tags', () => {
  test('formats location tags as user-facing labels', () => {
    expect(getAccessTagLabel('building:North Tower')).toBe('North Tower');
    expect(getAccessTagLabel('area:North Tower/Lobby')).toBe('North Tower / Lobby');
    expect(getAccessTagLabel('parking cameras')).toBe('parking cameras');
  });

  test('classifies and sorts access scopes before custom groups', () => {
    expect(getAccessTagKind('building:North Tower')).toBe(ACCESS_TAG_KIND.BUILDING);
    expect(getAccessTagKind('area:North Tower/Lobby')).toBe(ACCESS_TAG_KIND.AREA);
    expect(getAccessTagKind('parking cameras')).toBe(ACCESS_TAG_KIND.CUSTOM);

    const sorted = ['parking cameras', 'area:North Tower/Lobby', 'building:North Tower']
      .sort(compareAccessTags);

    expect(sorted).toEqual([
      'building:North Tower',
      'area:North Tower/Lobby',
      'parking cameras',
    ]);
  });

  test('tracks running, warning, and offline counts in the building tree', () => {
    const tree = buildBuildingTree([
      { name: 'Lobby 1', enabled: true, status: 'Running', tags: 'building:North Tower, area:North Tower/Lobby' },
      { name: 'Lobby 2', enabled: true, status: 'Reconnecting', tags: 'building:North Tower, area:North Tower/Lobby' },
      { name: 'Roof', enabled: false, status: 'Stopped', tags: 'building:North Tower, area:North Tower/Roof' },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      name: 'North Tower',
      cameraCount: 3,
      onlineCount: 1,
      warningCount: 1,
      offlineCount: 1,
    });
  });

  test('normalizes manual location catalog entries', () => {
    const catalog = addLocationToCatalog(
      {
        buildings: [
          { name: ' North Tower ', areas: ['Lobby', 'Lobby'] },
        ],
      },
      'North Tower',
      'Roof'
    );

    expect(normalizeLocationCatalog(catalog)).toEqual({
      buildings: [
        { name: 'North Tower', areas: ['Lobby', 'Roof'] },
      ],
    });
  });

  test('shows catalog-only buildings and areas before cameras are assigned', () => {
    const tree = buildBuildingTree([], {}, {
      buildings: [
        { name: 'North Tower', areas: ['Lobby'] },
      ],
    });

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      name: 'North Tower',
      tag: 'building:North Tower',
      cameraCount: 0,
      catalogOnly: true,
    });
    expect(tree[0].areas[0]).toMatchObject({
      name: 'Lobby',
      tag: 'area:North Tower/Lobby',
      cameras: [],
      catalogOnly: true,
    });
  });
});
