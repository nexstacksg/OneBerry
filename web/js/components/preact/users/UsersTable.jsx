/**
 * Users Table Component
 */

import { useCallback } from 'preact/hooks';
import { getUserRoleLabel } from './UserRoles.js';
import { getUserGroupLabels } from './userGroups.js';
import { formatLocalDateTime } from '../../../utils/date-utils.js';
import { useI18n } from '../../../i18n.js';
import { useSortableData } from '../useSortableData.js';

/**
 * Users Table Component
 * @param {Object} props - Component props
 * @param {Array} props.users - List of users to display
 * @param {Function} props.onEdit - Function to handle edit action
 * @param {Function} props.onDelete - Function to handle delete action
 * @param {Function} props.onApiKey - Function to handle API key action
 * @param {Function} props.onMfa - Function to handle MFA setup action
 * @returns {JSX.Element} Users table
 */
export function UsersTable({ users, onEdit, onDelete, onApiKey, onMfa }) {
  const { t } = useI18n();

  const normalizedUsers = Array.isArray(users) ? users : [];
  const NO_SORT_COLUMN = '';

  const {
    sortedItems: sortedUsers,
    sortColumn,
    sortDirection,
    handleSort,
  } = useSortableData(normalizedUsers, NO_SORT_COLUMN, {
    id: (user) => user.id || 0,
    username: (user) => (user.username || '').toLowerCase(),
    email: (user) => (user.email || '').toLowerCase(),
    role: (user) => user.role ?? 0,
    group: (user) => getUserGroupLabels(user).join(', ').toLowerCase(),
    status: (user) => user.is_active ? 1 : 0,
    password: (user) => user.password_change_locked ? 1 : 0,
    mfa: (user) => user.totp_enabled ? 1 : 0,
    lastLogin: (user) => user.last_login ? new Date(user.last_login).getTime() : 0,
  });

  // Create memoized handlers for each button to maintain stable references
  const handleEdit = useCallback((user, e) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit(user);
  }, [onEdit]);

  const handleDelete = useCallback((user, e) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(user);
  }, [onDelete]);

  const handleApiKey = useCallback((user, e) => {
    e.preventDefault();
    e.stopPropagation();
    onApiKey(user);
  }, [onApiKey]);

  const handleMfa = useCallback((user, e) => {
    e.preventDefault();
    e.stopPropagation();
    onMfa(user);
  }, [onMfa]);

  const getInitials = (user) => {
    const name = user?.username || user?.email || '?';
    return name.trim().slice(0, 2).toUpperCase();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-base font-semibold text-card-foreground">Users</h3>
          <p className="text-sm text-muted-foreground">{normalizedUsers.length} accounts in this view</p>
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead className="bg-muted/60">
          <tr>
            {[
              { key: 'username',  label: t('fields.username') },
              { key: 'email',     label: t('fields.email') },
              { key: 'role',      label: t('fields.role') },
              { key: 'group',     label: t('users.userGroup') },
              { key: 'status',    label: t('users.status') },
              { key: 'password',  label: t('fields.password') },
              { key: 'mfa',       label: 'MFA' },
              { key: 'lastLogin', label: t('users.lastLogin') },
            ].map(({ key, label }) => (
              <th
                key={key}
                className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort(key)}
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  <span className="inline-flex flex-col leading-none text-[0.6rem]">
                    <span className={sortColumn === key && sortDirection === 'asc' ? 'opacity-100' : 'opacity-30'}>▲</span>
                    <span className={sortColumn === key && sortDirection === 'desc' ? 'opacity-100' : 'opacity-30'}>▼</span>
                  </span>
                </span>
              </th>
            ))}
            <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sortedUsers.map((user) => (
            <tr
              key={
                user.id != null
                  ? `user-${user.id}`
                  : `user-fallback-${user.username ?? 'unknown'}-${user.email ?? 'unknown'}-${user.role ?? 'unknown'}`
              }
              className="transition-colors hover:bg-muted/35"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {getInitials(user)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-card-foreground">{user.username ?? '-'}</div>
                    <div className="text-xs text-muted-foreground">ID {user.id ?? '-'}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-card-foreground">{user.email || '-'}</td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                  {getUserRoleLabel(t, user.role)}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex max-w-[18rem] flex-wrap gap-1">
                  {getUserGroupLabels(user).map((group) => (
                    <span key={group} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {group}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${user.is_active ? 'badge-success' : 'badge-danger'}`}>
                  {user.is_active ? t('users.active') : t('users.inactive')}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${user.password_change_locked ? 'badge-warning' : 'badge-info'}`} title={user.password_change_locked ? t('users.passwordChangesLocked') : t('users.passwordChangesAllowed')}>
                  {user.password_change_locked ? t('users.locked') : t('users.unlocked')}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${user.totp_enabled ? 'badge-success' : 'badge-info'}`}>
                  {user.totp_enabled ? t('users.mfaEnabled') : t('users.mfaDisabled')}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-card-foreground">{user.last_login ? formatLocalDateTime(user.last_login) : t('common.never')}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)_/_0.1)]"
                    onClick={(e) => handleEdit(user, e)}
                    title={t('users.editUser')}
                    aria-label={t('users.editUser')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)_/_0.1)]"
                    onClick={(e) => handleDelete(user, e)}
                    title={t('users.deleteUser')}
                    aria-label={t('users.deleteUser')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(e) => handleApiKey(user, e)}
                    title={t('users.manageApiKey')}
                    aria-label={t('users.manageApiKey')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </button>
                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={(e) => handleMfa(user, e)}
                    title={t('users.manageMfa')}
                    aria-label={t('users.manageMfa')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
