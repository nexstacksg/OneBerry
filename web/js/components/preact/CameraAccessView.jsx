/**
 * LightNVR Web Interface Camera Access View Component
 * Camera group and user group management, backed by existing stream tags
 * and user allowed_tags fields.
 */

import { useEffect, useMemo, useState, useCallback } from 'preact/hooks';
import { showStatusMessage } from './ToastContainer.jsx';
import { ContentLoader } from './LoadingIndicator.jsx';
import { useMutation, useQuery, fetchJSON } from '../../query-client.js';
import { useI18n } from '../../i18n.js';

const parseTagList = (value) => {
  if (!value) return [];
  return Array.from(new Set(
    String(value)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  ));
};

const joinTagList = (tags) => tags.filter(Boolean).join(', ');

const hasTag = (value, tag) => parseTagList(value).includes(tag);

const addTag = (value, tag) => {
  const tags = parseTagList(value);
  if (!tags.includes(tag)) tags.push(tag);
  return joinTagList(tags);
};

const removeTag = (value, tag) => joinTagList(parseTagList(value).filter((item) => item !== tag));

const normalizeGroupName = (value) => value.trim().replace(/\s+/g, ' ');
const getGroupKey = (mode, tag) => `${mode}:${tag}`;

const getGroupMembers = (items, field, tag) =>
  items.filter((item) => hasTag(item[field] || '', tag));

const deriveGroups = (items, field) => {
  const groups = new Map();
  items.forEach((item) => {
    parseTagList(item?.[field]).forEach((tag) => {
      if (!groups.has(tag)) {
        groups.set(tag, { tag, members: [] });
      }
      groups.get(tag).members.push(item);
    });
  });
  return Array.from(groups.values()).sort((a, b) => a.tag.localeCompare(b.tag));
};

const filterVisibleGroups = (groups, searchTerm, memberLabelGetter) => {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return groups;
  return groups.filter((group) => {
    if (group.tag.toLowerCase().includes(term)) {
      return true;
    }
    return group.members.some((member) => memberLabelGetter(member).toLowerCase().includes(term));
  });
};

const updateTagMembership = (value, previousTag, nextTag, shouldKeep) => {
  const tags = parseTagList(value);
  const filtered = tags.filter((tag) => tag !== previousTag);
  if (shouldKeep) {
    if (!filtered.includes(nextTag)) {
      filtered.push(nextTag);
    }
  }
  return joinTagList(filtered);
};

function AccessGroupModal({
  isOpen,
  mode,
  initialGroupTag,
  initialSelectedIds,
  cameraGroups,
  items,
  onClose,
  onSave,
}) {
  const { t } = useI18n();
  const [groupTag, setGroupTag] = useState(initialGroupTag || '');
  const [linkedCameraGroupTag, setLinkedCameraGroupTag] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelectedIds || []));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setGroupTag(initialGroupTag || '');
    setLinkedCameraGroupTag(mode === 'user' && initialGroupTag ? initialGroupTag : '');
    setSearch('');
    setSelectedIds(new Set(initialSelectedIds || []));
    setIsSaving(false);
  }, [isOpen, mode, initialGroupTag, initialSelectedIds]);

  useEffect(() => {
    if (mode !== 'user') return;
    if (!linkedCameraGroupTag) return;
    const hasSelection = cameraGroups?.some((group) => group.tag === linkedCameraGroupTag);
    if (!hasSelection) {
      setLinkedCameraGroupTag('');
    }
  }, [cameraGroups, linkedCameraGroupTag, mode]);

  const handleCameraGroupSelect = (value) => {
    setLinkedCameraGroupTag(value);
    if (value) {
      setGroupTag(value);
    }
  };

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const label = mode === 'camera'
        ? item.name || ''
        : item.username || '';
      const secondary = mode === 'camera'
        ? [item.url || '', item.tags || ''].join(' ')
        : [item.email || '', item.role_name || '', item.allowed_tags || ''].join(' ');
      return `${label} ${secondary}`.toLowerCase().includes(term);
    });
  }, [items, search, mode]);

  const memberCount = selectedIds.size;
  const selectAllVisible = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(String(item.__group_key)));

  if (!isOpen) return null;

  const toggleItem = (key) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const shouldSelect = !filteredItems.every((item) => next.has(String(item.__group_key)));
      filteredItems.forEach((item) => {
        const key = String(item.__group_key);
        if (shouldSelect) {
          next.add(key);
        } else {
          next.delete(key);
        }
      });
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    const trimmed = normalizeGroupName(groupTag);
    if (!trimmed) {
      showStatusMessage(t('cameraAccess.groupNameRequired'), 'error', 5000);
      return;
    }
    if (selectedIds.size === 0) {
      showStatusMessage(t('cameraAccess.selectAtLeastOneMember'), 'warning', 5000);
      return;
    }
    setIsSaving(true);
    try {
      await onSave({
        groupTag: trimmed,
        selectedIds: Array.from(selectedIds),
      });
      onClose();
    } catch (error) {
      // onSave is responsible for surfacing the error toast; keep the modal open.
    } finally {
      setIsSaving(false);
    }
  };

  const selectedItems = items.filter((item) => selectedIds.has(String(item.__group_key)));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-auto my-8 w-full max-w-6xl rounded-2xl bg-card text-card-foreground shadow-2xl border border-border overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold">
              {mode === 'camera' ? t('cameraAccess.createCameraGroup') : t('cameraAccess.createUserGroup')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'camera'
                ? t('cameraAccess.cameraGroupHelp')
                : t('cameraAccess.userGroupHelp')}
            </p>
          </div>
          <button type="button" className="text-2xl leading-none text-muted-foreground hover:text-foreground" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            <div>
              {mode === 'user' && (
                <div className="mb-4 rounded-xl border border-border bg-muted/15 p-4">
                  <label className="block text-sm font-semibold mb-2" htmlFor="linked-camera-group">
                    {t('cameraAccess.linkCameraGroup')}
                  </label>
                  <select
                    id="linked-camera-group"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    value={linkedCameraGroupTag}
                    onChange={(e) => handleCameraGroupSelect(e.currentTarget.value)}
                  >
                    <option value="">{t('cameraAccess.customUserGroup')}</option>
                    {cameraGroups?.map((group) => (
                      <option key={group.tag} value={group.tag}>
                        {group.tag}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('cameraAccess.linkCameraGroupHelp')}
                  </p>
                </div>
              )}
              <label className="block text-sm font-semibold mb-2" htmlFor="group-tag">
                {t('cameraAccess.groupName')}
              </label>
              <input
                id="group-tag"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                type="text"
                value={groupTag}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  setGroupTag(value);
                  if (mode === 'user' && linkedCameraGroupTag && value !== linkedCameraGroupTag) {
                    setLinkedCameraGroupTag('');
                  }
                }}
                placeholder={mode === 'camera' ? t('cameraAccess.cameraGroupPlaceholder') : t('cameraAccess.userGroupPlaceholder')}
                maxLength={64}
                autoComplete="off"
              />
              {mode === 'user' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('cameraAccess.userGroupTagHelp')}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.selectedMembers')}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{memberCount}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {mode === 'camera' ? t('cameraAccess.camerasSelected') : t('cameraAccess.usersSelected')}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <input
                className="w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                type="search"
                value={search}
                onInput={(e) => setSearch(e.currentTarget.value)}
                placeholder={mode === 'camera' ? t('cameraAccess.searchCameras') : t('cameraAccess.searchUsers')}
              />
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </div>
            <button type="button" className="btn-secondary whitespace-nowrap" onClick={toggleAllVisible} disabled={filteredItems.length === 0}>
              {selectAllVisible ? t('cameraAccess.clearVisible') : t('cameraAccess.selectVisible')}
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="max-h-[52vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-left">
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectAllVisible}
                        onChange={toggleAllVisible}
                        aria-label={t('cameraAccess.selectVisible')}
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">{mode === 'camera' ? t('cameraAccess.camera') : t('cameraAccess.user')}</th>
                    <th className="px-4 py-3 font-semibold">{mode === 'camera' ? t('cameraAccess.details') : t('cameraAccess.membershipDetails')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map((item) => {
                    const key = String(item.__group_key);
                    const checked = selectedIds.has(key);
                    return (
                      <tr key={key} className={checked ? 'bg-primary/5' : ''}>
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(key)}
                            aria-label={mode === 'camera' ? item.name : item.username}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium">{mode === 'camera' ? item.name : item.username}</div>
                          {mode === 'user' && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.email || t('common.noDataAvailable')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-muted-foreground">
                          {mode === 'camera' ? (
                            <div className="space-y-1">
                              <div className="truncate">{item.url || t('common.noDataAvailable')}</div>
                              <div className="text-xs">{item.tags || t('cameraAccess.noCameraTags')}</div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div>{item.role_name || t('common.unknown')}</div>
                              <div className="text-xs">{item.allowed_tags || t('cameraAccess.noUserTags')}</div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selectedItems.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedItems.slice(0, 8).map((item) => (
                <span key={String(item.__group_key)} className="badge-info">
                  {mode === 'camera' ? item.name : item.username}
                </span>
              ))}
              {selectedItems.length > 8 && (
                <span className="badge-info">+{selectedItems.length - 8}</span>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? t('common.saving') : t('cameraAccess.saveGroup')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CameraAccessView() {
  const { t } = useI18n();
  const [userRole, setUserRole] = useState(null);
  const [activeTab, setActiveTab] = useState('camera');
  const [searchTerm, setSearchTerm] = useState('');
  const [editorState, setEditorState] = useState(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);

  const getAuthHeaders = useCallback(() => {
    const auth = localStorage.getItem('auth');
    return auth ? { Authorization: 'Basic ' + auth } : {};
  }, []);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const auth = localStorage.getItem('auth');
        if (!auth) {
          setUserRole('');
          return;
        }
        const response = await fetchJSON('/api/auth/verify', {
          headers: { Authorization: 'Basic ' + auth },
          timeout: 10000,
          retries: 1,
          retryDelay: 500,
        });
        setUserRole(response?.role || '');
      } catch (error) {
        console.error('Error fetching role for camera access page:', error);
        setUserRole('');
      }
    };
    loadRole();
  }, []);

  const canManageAccess = userRole === null || userRole === 'admin';
  const roleLoading = userRole === null;

  const {
    data: streamsData,
    isLoading: streamsLoading,
    error: streamsError,
    refetch: refetchStreams,
  } = useQuery(['camera-access-streams'], '/api/streams', {
    headers: getAuthHeaders(),
    cache: 'no-store',
    timeout: 15000,
    retries: 2,
    retryDelay: 1000,
  });

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery(['camera-access-users'], '/api/auth/users', {
    headers: getAuthHeaders(),
    cache: 'no-store',
    timeout: 15000,
    retries: 2,
    retryDelay: 1000,
  });

  const streams = Array.isArray(streamsData) ? streamsData : (streamsData?.streams || []);
  const users = usersData?.users || [];

  const cameraGroups = useMemo(() => deriveGroups(streams, 'tags'), [streams]);
  const userGroups = useMemo(() => deriveGroups(users, 'allowed_tags'), [users]);

  const filteredCameraGroups = useMemo(
    () => filterVisibleGroups(cameraGroups, searchTerm, (item) => item.name || ''),
    [cameraGroups, searchTerm]
  );

  const filteredUserGroups = useMemo(
    () => filterVisibleGroups(userGroups, searchTerm, (item) => item.username || ''),
    [userGroups, searchTerm]
  );

  const activeGroups = activeTab === 'camera' ? cameraGroups : userGroups;
  const visibleGroups = activeTab === 'camera' ? filteredCameraGroups : filteredUserGroups;

  useEffect(() => {
    if (activeGroups.length === 0) {
      setSelectedGroupKey(null);
      return;
    }

    const selectedStillExists = selectedGroupKey
      && activeGroups.some((group) => getGroupKey(activeTab, group.tag) === selectedGroupKey);

    if (!selectedStillExists) {
      setSelectedGroupKey(getGroupKey(activeTab, activeGroups[0].tag));
    }
  }, [activeTab, activeGroups, selectedGroupKey]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null;
    return activeGroups.find((group) => getGroupKey(activeTab, group.tag) === selectedGroupKey) || null;
  }, [activeGroups, activeTab, selectedGroupKey]);

  const cameraGroupStats = useMemo(() => {
    const linkedUsers = new Set();
    cameraGroups.forEach((group) => {
      users.forEach((user) => {
        if (hasTag(user.allowed_tags, group.tag)) {
          linkedUsers.add(user.id);
        }
      });
    });
    return linkedUsers.size;
  }, [cameraGroups, users]);

  const userGroupStats = useMemo(() => {
    const linkedStreams = new Set();
    userGroups.forEach((group) => {
      streams.forEach((stream) => {
        if (hasTag(stream.tags, group.tag)) {
          linkedStreams.add(stream.name);
        }
      });
    });
    return linkedStreams.size;
  }, [userGroups, streams]);

  const updateCameraGroupMutation = useMutation({
    mutationFn: async ({ fromTag, toTag, selectedIds }) => {
      const selected = new Set(selectedIds);
      const requests = streams
        .filter((stream) => fromTag ? (hasTag(stream.tags, fromTag) || selected.has(String(stream.name))) : selected.has(String(stream.name)))
        .map((stream) => {
          const shouldKeep = selected.has(String(stream.name));
          const nextTags = fromTag
            ? updateTagMembership(stream.tags || '', fromTag, toTag, shouldKeep)
            : addTag(stream.tags || '', toTag);
          if ((stream.tags || '') === nextTags) {
            return Promise.resolve({ skipped: true });
          }
          return fetchJSON(`/api/streams/${encodeURIComponent(stream.name)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
            body: JSON.stringify({ tags: nextTags }),
            timeout: 15000,
            retries: 1,
            retryDelay: 500,
          });
        });
      return await Promise.allSettled(requests);
    },
    onSuccess: async (results) => {
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) {
        showStatusMessage(t('cameraAccess.partialUpdate', { failed }), 'warning', 7000);
      } else {
        showStatusMessage(t('cameraAccess.cameraGroupSaved'), 'success', 4000);
      }
      await refetchStreams();
      await refetchUsers();
    },
    onError: (error) => {
      showStatusMessage(t('cameraAccess.cameraGroupSaveError', { message: error.message }), 'error', 8000);
    },
  });

  const updateUserGroupMutation = useMutation({
    mutationFn: async ({ fromTag, toTag, selectedIds }) => {
      const selected = new Set(selectedIds);
      const requests = users
        .filter((user) => fromTag ? (hasTag(user.allowed_tags, fromTag) || selected.has(String(user.id))) : selected.has(String(user.id)))
        .map((user) => {
          const shouldKeep = selected.has(String(user.id));
          const nextTags = fromTag
            ? updateTagMembership(user.allowed_tags || '', fromTag, toTag, shouldKeep)
            : addTag(user.allowed_tags || '', toTag);
          if ((user.allowed_tags || '') === nextTags) {
            return Promise.resolve({ skipped: true });
          }
          return fetchJSON(`/api/auth/users/${user.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
            body: JSON.stringify({ allowed_tags: nextTags || null }),
            timeout: 15000,
            retries: 1,
            retryDelay: 500,
          });
        });
      return await Promise.allSettled(requests);
    },
    onSuccess: async (results) => {
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) {
        showStatusMessage(t('cameraAccess.partialUpdate', { failed }), 'warning', 7000);
      } else {
        showStatusMessage(t('cameraAccess.userGroupSaved'), 'success', 4000);
      }
      await refetchStreams();
      await refetchUsers();
    },
    onError: (error) => {
      showStatusMessage(t('cameraAccess.userGroupSaveError', { message: error.message }), 'error', 8000);
    },
  });

  const handleOpenCreate = useCallback((mode) => {
    setActiveTab(mode);
    setEditorState({
      mode,
      initialGroupTag: '',
      initialSelectedIds: [],
    });
  }, []);

  const handleOpenEdit = useCallback((mode, tag) => {
    setActiveTab(mode);
    setSelectedGroupKey(getGroupKey(mode, tag));
    if (mode === 'camera') {
      const groupMembers = getGroupMembers(streams, 'tags', tag).map((stream) => String(stream.name));
      setEditorState({
        mode,
        initialGroupTag: tag,
        initialSelectedIds: groupMembers,
      });
    } else {
      const groupMembers = getGroupMembers(users, 'allowed_tags', tag).map((user) => String(user.id));
      setEditorState({
        mode,
        initialGroupTag: tag,
        initialSelectedIds: groupMembers,
      });
    }
  }, [streams, users]);

  const handleDeleteGroup = useCallback(async (mode, tag) => {
    const confirmed = window.confirm(
      mode === 'camera'
        ? t('cameraAccess.deleteCameraGroupConfirm', { group: tag })
        : t('cameraAccess.deleteUserGroupConfirm', { group: tag })
    );
    if (!confirmed) return;

    try {
      if (mode === 'camera') {
        await Promise.all(
          streams
            .filter((stream) => hasTag(stream.tags, tag))
            .map((stream) => fetchJSON(`/api/streams/${encodeURIComponent(stream.name)}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
              },
              body: JSON.stringify({ tags: removeTag(stream.tags || '', tag) }),
              timeout: 15000,
              retries: 1,
              retryDelay: 500,
            }))
        );
        showStatusMessage(t('cameraAccess.cameraGroupDeleted'), 'success', 4000);
      } else {
        await Promise.all(
          users
            .filter((user) => hasTag(user.allowed_tags, tag))
            .map((user) => fetchJSON(`/api/auth/users/${user.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
              },
              body: JSON.stringify({ allowed_tags: removeTag(user.allowed_tags || '', tag) || null }),
              timeout: 15000,
              retries: 1,
              retryDelay: 500,
            }))
        );
        showStatusMessage(t('cameraAccess.userGroupDeleted'), 'success', 4000);
      }
      if (selectedGroupKey === getGroupKey(mode, tag)) {
        setSelectedGroupKey(null);
      }
      await refetchStreams();
      await refetchUsers();
    } catch (error) {
      showStatusMessage(
        mode === 'camera'
          ? t('cameraAccess.cameraGroupDeleteError', { message: error.message })
          : t('cameraAccess.userGroupDeleteError', { message: error.message }),
        'error',
        8000
      );
    }
  }, [getAuthHeaders, refetchStreams, refetchUsers, selectedGroupKey, streams, users, t]);

  const handleSaveGroup = useCallback(async ({ groupTag, selectedIds }) => {
    if (!editorState) return;
    const mutation = editorState.mode === 'camera' ? updateCameraGroupMutation : updateUserGroupMutation;
    await mutation.mutateAsync({
      fromTag: editorState.initialGroupTag || null,
      toTag: groupTag,
      selectedIds,
    });
  }, [editorState, updateCameraGroupMutation, updateUserGroupMutation]);

  const isLoading = streamsLoading || usersLoading || roleLoading;
  const isAuthError = (streamsError || usersError) && (streamsError?.status === 401 || streamsError?.status === 403 || usersError?.status === 401 || usersError?.status === 403);
  const hasFatalError = (streamsError || usersError) && streams.length === 0 && users.length === 0;

  if (isLoading && streams.length === 0 && users.length === 0) {
    return <ContentLoader isLoading hasData={false} loadingMessage={t('common.loadingData')} />;
  }

  if (isAuthError && !canManageAccess) {
    return (
      <div className="space-y-4">
        <div className="page-header flex justify-between items-center mb-4 p-4 bg-card text-card-foreground rounded-lg shadow">
          <h2 className="text-xl font-semibold">{t('cameraAccess.title')}</h2>
        </div>
        <div className="border border-red-400 bg-red-100 px-4 py-3 rounded relative dark:bg-red-900 dark:border-red-600 dark:text-red-200">
          <h4 className="font-bold mb-2">{t('users.accessDenied')}</h4>
          <p>{t('cameraAccess.adminOnly')}</p>
        </div>
      </div>
    );
  }

  if (hasFatalError) {
    return (
      <div className="space-y-4">
        <div className="page-header flex justify-between items-center mb-4 p-4 bg-card text-card-foreground rounded-lg shadow">
          <h2 className="text-xl font-semibold">{t('cameraAccess.title')}</h2>
          <button className="btn-primary" onClick={() => { refetchStreams(); refetchUsers(); }}>
            {t('common.retry')}
          </button>
        </div>
        <div className="rounded-lg border border-red-400 bg-red-100 px-4 py-3 text-red-700 dark:bg-red-900 dark:border-red-600 dark:text-red-200">
          <h4 className="mb-2 font-bold">{t('cameraAccess.errorLoading')}</h4>
          <p>{streamsError?.message || usersError?.message || t('cameraAccess.errorLoadingDescription')}</p>
        </div>
      </div>
    );
  }

  return (
    <div id="camera-access-page" className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow">
        <div className="border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent px-6 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <span className="h-2 w-2 rounded-full bg-primary"></span>
                {t('cameraAccess.title')}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">{t('cameraAccess.subtitle')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('cameraAccess.panelHint')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => { refetchStreams(); refetchUsers(); }}>
                {t('common.refresh')}
              </button>
              <button className="btn-primary" onClick={() => handleOpenCreate(activeTab)}>
                {activeTab === 'camera' ? t('cameraAccess.newCameraGroup') : t('cameraAccess.newUserGroup')}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-border px-6 py-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.cameraGroups')}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{cameraGroups.length}</div>
          </div>
          <div className="rounded-2xl bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.userGroups')}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{userGroups.length}</div>
          </div>
          <div className="rounded-2xl bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.linkedUsers')}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{cameraGroupStats}</div>
          </div>
          <div className="rounded-2xl bg-muted/20 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.linkedCameras')}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{userGroupStats}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex rounded-xl bg-muted/40 p-1">
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'camera' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('camera')}
            >
              {t('cameraAccess.cameraGroups')}
              <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{cameraGroups.length}</span>
            </button>
            <button
              type="button"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'user' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('user')}
            >
              {t('cameraAccess.userGroups')}
              <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{userGroups.length}</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:w-[28rem]">
              <input
                className="w-full rounded-xl border border-input bg-background pl-10 pr-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                type="search"
                value={searchTerm}
                onInput={(e) => setSearchTerm(e.currentTarget.value)}
                placeholder={t('cameraAccess.searchGroups')}
              />
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </div>
            <button className="btn-primary whitespace-nowrap" onClick={() => handleOpenCreate(activeTab)}>
              {activeTab === 'camera' ? t('cameraAccess.newCameraGroup') : t('cameraAccess.newUserGroup')}
            </button>
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.55fr)_24rem]">
          <div className="border-b border-border xl:border-b-0 xl:border-r">
            <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">
                    {activeTab === 'camera' ? t('cameraAccess.cameraGroups') : t('cameraAccess.userGroups')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {activeTab === 'camera'
                      ? t('cameraAccess.cameraGroupListHelp')
                      : t('cameraAccess.userGroupListHelp')}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {visibleGroups.length} {visibleGroups.length === 1 ? t('cameraAccess.groupSingular') : t('cameraAccess.groupPlural')}
                </span>
              </div>

              <div className="mt-5">
                <div className="space-y-3">
                  {visibleGroups.map((group) => {
                    const accessCount = activeTab === 'camera'
                      ? users.filter((user) => hasTag(user.allowed_tags, group.tag)).length
                      : streams.filter((stream) => hasTag(stream.tags, group.tag)).length;
                    const isSelected = selectedGroupKey === getGroupKey(activeTab, group.tag);
                    const previewMembers = group.members.slice(0, 4).map((member) => activeTab === 'camera' ? member.name : member.username);
                    return (
                      <button
                        key={`${activeTab}-${group.tag}`}
                        type="button"
                        onClick={() => setSelectedGroupKey(getGroupKey(activeTab, group.tag))}
                        className={`w-full rounded-2xl border p-4 text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-border bg-card hover:border-primary/30 hover:bg-muted/20'
                        }`}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-base font-semibold">{group.tag}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${activeTab === 'camera' ? 'badge-info' : 'badge-success'}`}>
                                {activeTab === 'camera' ? t('cameraAccess.cameraGroups') : t('cameraAccess.userGroups')}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {activeTab === 'camera'
                                ? t('cameraAccess.cameraGroupDescription')
                                : t('cameraAccess.userGroupDescription')}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                                {group.members.length} {activeTab === 'camera' ? t('cameraAccess.cameraCount').toLowerCase() : t('cameraAccess.userCount').toLowerCase()}
                              </span>
                              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                                {accessCount} {activeTab === 'camera' ? t('cameraAccess.accessUsers').toLowerCase() : t('cameraAccess.accessCameras').toLowerCase()}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {previewMembers.map((name) => (
                                <span key={`${activeTab}-${group.tag}-${name}`} className="badge-info">
                                  {name}
                                </span>
                              ))}
                              {group.members.length > previewMembers.length && (
                                <span className="badge-info">+{group.members.length - previewMembers.length}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(activeTab, group.tag);
                              }}
                            >
                              {t('cameraAccess.editGroup')}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary text-red-600 hover:text-red-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteGroup(activeTab, group.tag);
                              }}
                            >
                              {t('cameraAccess.deleteGroup')}
                            </button>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {visibleGroups.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                      <p className="text-sm text-muted-foreground">{t('cameraAccess.noGroupsFound')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="bg-muted/15 px-6 py-5">
            <div className="sticky top-5">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('cameraAccess.groupDetails')}
                    </div>
                    <h3 className="mt-1 text-xl font-semibold">
                      {selectedGroup ? selectedGroup.tag : t('cameraAccess.selectGroupTitle')}
                    </h3>
                  </div>
                  {selectedGroup && (
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${activeTab === 'camera' ? 'badge-info' : 'badge-success'}`}>
                      {activeTab === 'camera' ? t('cameraAccess.cameraGroups') : t('cameraAccess.userGroups')}
                    </span>
                  )}
                </div>

                {selectedGroup ? (
                  <div className="mt-5 space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-muted/25 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{activeTab === 'camera' ? t('cameraAccess.cameraCount') : t('cameraAccess.userCount')}</div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">{selectedGroup.members.length}</div>
                      </div>
                      <div className="rounded-2xl bg-muted/25 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{activeTab === 'camera' ? t('cameraAccess.accessUsers') : t('cameraAccess.accessCameras')}</div>
                        <div className="mt-2 text-3xl font-semibold tabular-nums">
                          {activeTab === 'camera'
                            ? users.filter((user) => hasTag(user.allowed_tags, selectedGroup.tag)).length
                            : streams.filter((stream) => hasTag(stream.tags, selectedGroup.tag)).length}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('cameraAccess.groupMembers')}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedGroup.members.slice(0, 10).map((member) => (
                          <span key={`${activeTab}-${selectedGroup.tag}-${activeTab === 'camera' ? member.name : member.username}`} className="badge-info">
                            {activeTab === 'camera' ? member.name : member.username}
                          </span>
                        ))}
                        {selectedGroup.members.length === 0 && (
                          <span className="text-sm text-muted-foreground">{t('cameraAccess.noMembers')}</span>
                        )}
                        {selectedGroup.members.length > 10 && (
                          <span className="badge-info">+{selectedGroup.members.length - 10}</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t('cameraAccess.groupLinkHint')}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {activeTab === 'camera'
                          ? t('cameraAccess.cameraGroupHelp')
                          : t('cameraAccess.userGroupHelp')}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button type="button" className="btn-primary" onClick={() => handleOpenEdit(activeTab, selectedGroup.tag)}>
                        {t('cameraAccess.editGroup')}
                      </button>
                      <button type="button" className="btn-secondary text-red-600 hover:text-red-700" onClick={() => handleDeleteGroup(activeTab, selectedGroup.tag)}>
                        {t('cameraAccess.deleteGroup')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14" strokeLinecap="round" />
                        <path d="M5 12h14" strokeLinecap="round" />
                      </svg>
                    </div>
                    <h4 className="mt-4 text-sm font-semibold">{t('cameraAccess.selectGroupTitle')}</h4>
                    <p className="mt-2 text-sm text-muted-foreground">{t('cameraAccess.selectGroupHelp')}</p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {editorState && (
      <AccessGroupModal
          isOpen
          mode={editorState.mode}
          initialGroupTag={editorState.initialGroupTag}
          initialSelectedIds={editorState.initialSelectedIds}
          cameraGroups={cameraGroups}
          items={editorState.mode === 'camera' ? streams.map((stream) => ({ ...stream, __group_key: stream.name })) : users.map((user) => ({ ...user, __group_key: String(user.id) }))}
          onClose={() => setEditorState(null)}
          onSave={handleSaveGroup}
        />
      )}
    </div>
  );
}
