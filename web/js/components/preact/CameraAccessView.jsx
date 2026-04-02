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
  items,
  onClose,
  onSave,
}) {
  const { t } = useI18n();
  const [groupTag, setGroupTag] = useState(initialGroupTag || '');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelectedIds || []));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setGroupTag(initialGroupTag || '');
    setSearch('');
    setSelectedIds(new Set(initialSelectedIds || []));
    setIsSaving(false);
  }, [isOpen, initialGroupTag, initialSelectedIds]);

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
              <label className="block text-sm font-semibold mb-2" htmlFor="group-tag">
                {t('cameraAccess.groupName')}
              </label>
              <input
                id="group-tag"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                type="text"
                value={groupTag}
                onInput={(e) => setGroupTag(e.currentTarget.value)}
                placeholder={mode === 'camera' ? t('cameraAccess.cameraGroupPlaceholder') : t('cameraAccess.userGroupPlaceholder')}
                maxLength={64}
                autoComplete="off"
              />
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
    setEditorState({
      mode,
      initialGroupTag: '',
      initialSelectedIds: [],
    });
  }, []);

  const handleOpenEdit = useCallback((mode, tag) => {
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
  }, [getAuthHeaders, refetchStreams, refetchUsers, streams, users, t]);

  const handleSaveGroup = useCallback(async ({ groupTag, selectedIds }) => {
    if (!editorState) return;
    const mutation = editorState.mode === 'camera' ? updateCameraGroupMutation : updateUserGroupMutation;
    await mutation.mutateAsync({
      fromTag: editorState.initialGroupTag || null,
      toTag: groupTag,
      selectedIds,
    });
  }, [editorState, updateCameraGroupMutation, updateUserGroupMutation]);

  const selectedCameraGroups = filteredCameraGroups;
  const selectedUserGroups = filteredUserGroups;

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

  const renderGroupTable = (mode, groups) => (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow">
      <table className="w-full border-collapse">
        <thead className="bg-muted/30">
          <tr className="text-left text-sm">
            <th className="px-4 py-3 font-semibold">{t('cameraAccess.groupName')}</th>
            <th className="px-4 py-3 font-semibold">{mode === 'camera' ? t('cameraAccess.cameraCount') : t('cameraAccess.userCount')}</th>
            <th className="px-4 py-3 font-semibold">{mode === 'camera' ? t('cameraAccess.accessUsers') : t('cameraAccess.accessCameras')}</th>
            <th className="px-4 py-3 font-semibold">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {groups.map((group) => {
            const accessCount = mode === 'camera'
              ? users.filter((user) => hasTag(user.allowed_tags, group.tag)).length
              : streams.filter((stream) => hasTag(stream.tags, group.tag)).length;
            return (
              <tr key={`${mode}-${group.tag}`} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{group.tag}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {mode === 'camera'
                      ? t('cameraAccess.cameraGroupDescription')
                      : t('cameraAccess.userGroupDescription')}
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">{group.members.length}</td>
                <td className="px-4 py-3 tabular-nums">{accessCount}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => handleOpenEdit(mode, group.tag)}>
                      {t('cameraAccess.editGroup')}
                    </button>
                    <button type="button" className="btn-secondary text-red-600 hover:text-red-700" onClick={() => handleDeleteGroup(mode, group.tag)}>
                      {t('cameraAccess.deleteGroup')}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {groups.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>
                {t('cameraAccess.noGroupsFound')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div id="camera-access-page" className="space-y-6">
      <div className="page-header flex flex-col gap-4 rounded-2xl bg-card p-4 shadow md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('cameraAccess.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('cameraAccess.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => refetchStreams()}>{t('common.refresh')}</button>
          <button className="btn-primary" onClick={() => handleOpenCreate(activeTab)}>{activeTab === 'camera' ? t('cameraAccess.newCameraGroup') : t('cameraAccess.newUserGroup')}</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.cameraGroups')}</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{cameraGroups.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.userGroups')}</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{userGroups.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.linkedUsers')}</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{cameraGroupStats}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cameraAccess.linkedCameras')}</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{userGroupStats}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-lg bg-muted/40 p-1">
            <button
              type="button"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'camera' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('camera')}
            >
              {t('cameraAccess.cameraGroups')}
              <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{cameraGroups.length}</span>
            </button>
            <button
              type="button"
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'user' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('user')}
            >
              {t('cameraAccess.userGroups')}
              <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{userGroups.length}</span>
            </button>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:w-96">
              <input
                className="w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                type="search"
                value={searchTerm}
                onInput={(e) => setSearchTerm(e.currentTarget.value)}
                placeholder={t('cameraAccess.searchGroups')}
              />
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </div>
            {activeTab === 'camera' ? (
              <button className="btn-primary whitespace-nowrap" onClick={() => handleOpenCreate('camera')}>
                {t('cameraAccess.newCameraGroup')}
              </button>
            ) : (
              <button className="btn-primary whitespace-nowrap" onClick={() => handleOpenCreate('user')}>
                {t('cameraAccess.newUserGroup')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6">
          {activeTab === 'camera'
            ? renderGroupTable('camera', selectedCameraGroups)
            : renderGroupTable('user', selectedUserGroups)}
        </div>
      </div>

      {editorState && (
        <AccessGroupModal
          isOpen
          mode={editorState.mode}
          initialGroupTag={editorState.initialGroupTag}
          initialSelectedIds={editorState.initialSelectedIds}
          items={editorState.mode === 'camera' ? streams.map((stream) => ({ ...stream, __group_key: stream.name })) : users.map((user) => ({ ...user, __group_key: String(user.id) }))}
          onClose={() => setEditorState(null)}
          onSave={handleSaveGroup}
        />
      )}
    </div>
  );
}
