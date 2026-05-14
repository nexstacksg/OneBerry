import { ALL_USERS_GROUP_KEY } from './userGroups.js';
import { useI18n } from '../../../i18n.js';

function GroupCard({ group, selected, onSelect }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`min-w-[11rem] rounded-lg border p-3 text-left transition ${
        selected
          ? 'border-primary bg-primary/10 text-foreground shadow-sm'
          : 'border-border bg-card text-card-foreground hover:border-primary/30 hover:bg-muted/35'
      }`}
      onClick={() => onSelect(group.key)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{group.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t('users.groupUserCount', { count: group.users.length })}
          </div>
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-bold text-muted-foreground">
          {group.users.length}
        </span>
      </div>
      <div className="mt-3 flex gap-2 text-[11px] text-muted-foreground">
        <span>{t('users.groupActiveCount', { count: group.activeCount })}</span>
        {group.adminCount > 0 && <span>{t('users.groupAdminCount', { count: group.adminCount })}</span>}
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
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('users.userGroups')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('users.userGroupsDescription')}
          </p>
        </div>
        {selectedGroup !== ALL_USERS_GROUP_KEY && (
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => onSelectGroup(ALL_USERS_GROUP_KEY)}
          >
            {t('users.clearGroupFilter')}
          </button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
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
