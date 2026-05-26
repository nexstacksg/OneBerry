export const BUILDING_PREFIX = 'building:';
export const AREA_PREFIX = 'area:';

export const ACCESS_TAG_KIND = {
  BUILDING: 'building',
  AREA: 'area',
  CUSTOM: 'custom',
};

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

export function isBuildingTag(tag) {
  return String(tag || '').trim().toLowerCase().startsWith(BUILDING_PREFIX);
}

export function isAreaTag(tag) {
  return String(tag || '').trim().toLowerCase().startsWith(AREA_PREFIX);
}

export function isLocationTag(tag) {
  return isBuildingTag(tag) || isAreaTag(tag);
}

export function getAccessTagKind(tag) {
  if (isBuildingTag(tag)) return ACCESS_TAG_KIND.BUILDING;
  if (isAreaTag(tag)) return ACCESS_TAG_KIND.AREA;
  return ACCESS_TAG_KIND.CUSTOM;
}

export function getAccessTagLabel(tag) {
  const value = String(tag || '').trim();
  if (!value) return '';

  if (isBuildingTag(value)) {
    return value.slice(BUILDING_PREFIX.length).trim();
  }

  if (isAreaTag(value)) {
    const path = value.slice(AREA_PREFIX.length).trim();
    const parts = path.split('/').map((part) => part.trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : path;
  }

  return value;
}

export function getAccessTagTypeLabel(tag, labels = {}) {
  const kind = getAccessTagKind(tag);
  if (kind === ACCESS_TAG_KIND.BUILDING) return labels.building || 'Building';
  if (kind === ACCESS_TAG_KIND.AREA) return labels.area || 'Area';
  return labels.custom || 'Custom group';
}

export function getAccessTagSortRank(tag) {
  const kind = getAccessTagKind(tag);
  if (kind === ACCESS_TAG_KIND.BUILDING) return 0;
  if (kind === ACCESS_TAG_KIND.AREA) return 1;
  return 2;
}

export function compareAccessTags(a, b) {
  const rankA = getAccessTagSortRank(a);
  const rankB = getAccessTagSortRank(b);
  if (rankA !== rankB) return rankA - rankB;
  return getAccessTagLabel(a).localeCompare(getAccessTagLabel(b));
}

export function getStreamStatusKind(stream = {}) {
  if (!stream.enabled) return 'disabled';
  const status = String(stream.status || '').trim().toLowerCase();
  if (status === 'running') return 'online';
  if (['starting', 'reconnecting', 'stopping'].includes(status)) return 'warning';
  if (['error', 'stopped'].includes(status)) return 'offline';
  return 'unknown';
}

export function isStreamOnline(stream = {}) {
  return getStreamStatusKind(stream) === 'online';
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

      const statusKind = getStreamStatusKind(stream);

      if (!buildingMap.has(building.key)) {
        buildingMap.set(building.key, {
          ...building,
          areas: new Map(),
          cameraCount: 0,
          onlineCount: 0,
          warningCount: 0,
          offlineCount: 0,
        });
      }

      const buildingNode = buildingMap.get(building.key);
      if (!buildingNode.areas.has(area.key)) {
        buildingNode.areas.set(area.key, {
          ...area,
          cameras: [],
          onlineCount: 0,
          warningCount: 0,
          offlineCount: 0,
        });
      }

      const areaNode = buildingNode.areas.get(area.key);
      areaNode.cameras.push(stream);
      if (statusKind === 'online') areaNode.onlineCount += 1;
      else if (statusKind === 'warning') areaNode.warningCount += 1;
      else areaNode.offlineCount += 1;

      buildingNode.cameraCount += 1;
      if (statusKind === 'online') buildingNode.onlineCount += 1;
      else if (statusKind === 'warning') buildingNode.warningCount += 1;
      else buildingNode.offlineCount += 1;
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
