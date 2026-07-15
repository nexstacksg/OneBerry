import { ALL_USERS_GROUP_KEY } from './userGroups.js';
import { useI18n } from '../../../i18n.js';

function GroupCard({ group, selected, onSelect }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`min-w-[12rem] rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-primary bg-primary/10 text-foreground shadow-md shadow-primary/10'
          : 'border-border bg-card text-card-foreground shadow-sm hover:border-primary/40 hover:bg-muted/35'
      }`}
      onClick={() => onSelect(group.key)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{group.label}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('users.groupUserCount', { count: group.users.length })}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}>
          {group.users.length}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">
          {t('users.groupActiveCount', { count: group.activeCount })}
        </span>
        <span className="rounded-md bg-background px-2 py-1 text-muted-foreground">
          {t('users.groupAdminCount', { count: group.adminCount })}
        </span>
      </div>
    </button>
  );
}

export function UserGroupsPanel({ groups, totalUsers, activeUserCount, adminUserCount, selectedGroup, onSelectGroup }) {
  const { t } = useI18n();
  const allGroup = {
    key: ALL_USERS_GROUP_KEY,
    label: t('users.allUserGroups'),
    users: Array.from({ length: totalUsers }),
    activeCount: activeUserCount,
    adminCount: adminUserCount,
  };

  return (
    <section className="mb-5 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            {t('users.userGroups')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('users.userGroupsDescription')}
          </p>
        </div>
        {selectedGroup !== ALL_USERS_GROUP_KEY && (
          <button
            type="button"
            className="btn-secondary inline-flex min-h-9 items-center rounded-lg px-3 text-sm"
            onClick={() => onSelectGroup(ALL_USERS_GROUP_KEY)}
          >
            {t('users.clearGroupFilter')}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GroupCard
          group={allGroup}
          selected={selectedGroup === ALL_USERS_GROUP_KEY}
          onSelect={onSelectGroup}
        />
        {groups.map((group) => (
          <GroupCard
            key={group.key}
            group={group}
            selected={selectedGroup === group.key}
            onSelect={onSelectGroup}
          />
        ))}
      </div>
    </section>
  );
}
