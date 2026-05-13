const BUILDING_PREFIX = 'building:';
const AREA_PREFIX = 'area:';

export const UNASSIGNED_BUILDING_KEY = '__unassigned_building__';
export const GENERAL_AREA_KEY = '__general_area__';

export function parseTagList(value) {
  if (!value) return [];
  return Array.from(new Set(
    String(value)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  ));
}

export function joinTagList(tags) {
  return parseTagList(tags.join(',')).join(', ');
}

export function getTagValue(tags, prefix) {
  const tag = parseTagList(tags).find((item) => item.toLowerCase().startsWith(prefix));
  return tag ? tag.slice(prefix.length).trim() : '';
}

export function getBuildingName(tags) {
  return getTagValue(tags, BUILDING_PREFIX);
}

export function getAreaPath(tags) {
  return getTagValue(tags, AREA_PREFIX);
}

export function getAreaName(tags) {
  const areaPath = getAreaPath(tags);
  if (!areaPath) return '';
  const parts = areaPath.split('/').map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : areaPath;
}

export function setBuildingAreaTags(tags, building, area) {
  const buildingName = String(building || '').trim();
  const areaName = String(area || '').trim();
  const regularTags = parseTagList(tags).filter((tag) => {
    const normalized = tag.toLowerCase();
    return !normalized.startsWith(BUILDING_PREFIX) && !normalized.startsWith(AREA_PREFIX);
  });

  if (buildingName) {
    regularTags.push(`${BUILDING_PREFIX}${buildingName}`);
  }

  if (areaName) {
    regularTags.push(`${AREA_PREFIX}${buildingName ? `${buildingName}/${areaName}` : areaName}`);
  }

  return joinTagList(regularTags);
}

export function getStreamBuilding(stream, labels = {}) {
  const building = getBuildingName(stream?.tags || '');
  return {
    key: building || UNASSIGNED_BUILDING_KEY,
    name: building || labels.unassignedBuilding || 'Unassigned',
    tag: building ? `${BUILDING_PREFIX}${building}` : '',
    assigned: Boolean(building),
  };
}

export function getStreamArea(stream, labels = {}) {
  const areaPath = getAreaPath(stream?.tags || '');
  const areaName = getAreaName(stream?.tags || '');
  return {
    key: areaPath || GENERAL_AREA_KEY,
    name: areaName || labels.generalArea || 'General',
    tag: areaPath ? `${AREA_PREFIX}${areaPath}` : '',
    assigned: Boolean(areaPath),
  };
}

export function buildBuildingTree(streams = [], labels = {}) {
  const buildingMap = new Map();

  streams
    .filter((stream) => stream && !stream.is_deleted)
    .forEach((stream) => {
      const building = getStreamBuilding(stream, labels);
      const area = getStreamArea(stream, labels);

      if (!buildingMap.has(building.key)) {
        buildingMap.set(building.key, {
          ...building,
          areas: new Map(),
          cameraCount: 0,
        });
      }

      const buildingNode = buildingMap.get(building.key);
      if (!buildingNode.areas.has(area.key)) {
        buildingNode.areas.set(area.key, {
          ...area,
          cameras: [],
        });
      }

      buildingNode.areas.get(area.key).cameras.push(stream);
      buildingNode.cameraCount += 1;
    });

  return Array.from(buildingMap.values())
    .map((building) => ({
      ...building,
      areas: Array.from(building.areas.values())
        .map((area) => ({
          ...area,
          cameras: area.cameras.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
        }))
        .sort((a, b) => {
          if (a.key === GENERAL_AREA_KEY) return 1;
          if (b.key === GENERAL_AREA_KEY) return -1;
          return a.name.localeCompare(b.name);
        }),
    }))
    .sort((a, b) => {
      if (a.key === UNASSIGNED_BUILDING_KEY) return 1;
      if (b.key === UNASSIGNED_BUILDING_KEY) return -1;
      return a.name.localeCompare(b.name);
    });
}
