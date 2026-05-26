import { getAccessTagLabel, getAccessTagKind, parseTagList, ACCESS_TAG_KIND } from '../../../utils/building-hierarchy.js';

export const ALL_USERS_GROUP_KEY = 'all';
export const UNRESTRICTED_GROUP_KEY = 'unrestricted';

export function formatAccessTag(tag) {
  if (!tag) return '';

  const label = getAccessTagLabel(tag);
  if (getAccessTagKind(tag) === ACCESS_TAG_KIND.BUILDING) return `Building: ${label}`;
  if (getAccessTagKind(tag) === ACCESS_TAG_KIND.AREA) return label;
  return label;
}

export function getUserAccessTags(user) {
  return parseTagList(user?.allowed_tags || '');
}

export function getUserGroupLabels(user) {
  const tags = getUserAccessTags(user);
  return tags.length > 0 ? tags.map(formatAccessTag) : ['All cameras'];
}

export function userMatchesGroup(user, groupKey) {
  if (!groupKey || groupKey === ALL_USERS_GROUP_KEY) return true;
  const tags = getUserAccessTags(user);
  if (groupKey === UNRESTRICTED_GROUP_KEY) return tags.length === 0;
  return tags.includes(groupKey);
}

export function deriveUserGroups(users = []) {
  const normalizedUsers = Array.isArray(users) ? users : [];
  const groups = new Map();

  const addGroup = (key, label, user) => {
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        users: [],
        activeCount: 0,
        adminCount: 0,
      });
    }

    const group = groups.get(key);
    group.users.push(user);
    if (user?.is_active) group.activeCount += 1;
    if (Number(user?.role) === 0) group.adminCount += 1;
  };

  normalizedUsers.forEach((user) => {
    const tags = getUserAccessTags(user);
    if (tags.length === 0) {
      addGroup(UNRESTRICTED_GROUP_KEY, 'All cameras', user);
      return;
    }

    tags.forEach((tag) => addGroup(tag, formatAccessTag(tag), user));
  });

  return Array.from(groups.values()).sort((a, b) => {
    if (a.key === UNRESTRICTED_GROUP_KEY) return -1;
    if (b.key === UNRESTRICTED_GROUP_KEY) return 1;
    return a.label.localeCompare(b.label);
  });
}
