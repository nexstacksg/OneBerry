/**
 * Add User Modal Component
 */

import { USER_ROLE_KEYS, getUserRoleLabel } from './UserRoles.js';
import { useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../../i18n.js';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
];

const FOCUSABLE_SELECTOR_QUERY = FOCUSABLE_SELECTORS.join(',');
const INPUT_CLASS = 'w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground shadow-sm transition focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/10';
const SELECT_CLASS = `${INPUT_CLASS} appearance-none`;
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[144px] resize-y font-mono text-[13px] leading-6`;
const CHECKBOX_CLASS = 'mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary';
const ROLE_DETAILS = {
  0: 'Full administrative access across users, streams, recordings, and system settings.',
  1: 'Standard operator access for day-to-day monitoring and user workflows.',
  2: 'Read-only access for viewing without configuration changes.',
  3: 'Programmatic access for integrations, scripts, and automation tasks.',
};

function SectionCard({ eyebrow, title, description, children, className = '' }) {
  return (
    <section className={`rounded-[24px] border border-border bg-background/70 p-5 shadow-sm ${className}`}>
      <div className="mb-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FieldBlock({ htmlFor, label, hint, children }) {
  return (
    <div className="space-y-2.5">
      <label className="block text-sm font-semibold text-foreground" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ToggleCard({ id, name, checked, onChange, label, description }) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
        checked
          ? 'border-primary/35 bg-primary/10 shadow-sm'
          : 'border-border bg-card hover:border-primary/20 hover:bg-background'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className={CHECKBOX_CLASS}
      />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </label>
  );
}

/**
 * Add User Modal Component
 * @param {Object} props - Component props
 * @param {Object} props.formData - Form data for adding a user
 * @param {Function} props.handleInputChange - Function to handle input changes
 * @param {Function} props.handleAddUser - Function to handle user addition
 * @param {Function} props.onClose - Function to close the modal
 * @returns {JSX.Element} Add user modal
 */
export function AddUserModal({ formData, handleInputChange, handleAddUser, onClose }) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const backdropPointerDownRef = useRef(false);
  const { t } = useI18n();

  const allowedLoginCidrsPlaceholder = `${t('common.example')}
192.168.1.25
192.168.1.0/24
2001:db8::1
${t('users.allowedLoginCidrsPlaceholderTail')}`;

  const parsedAllowedTags = (formData.allowed_tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const parsedAllowedCidrs = (formData.allowed_login_cidrs || '')
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const selectedRole = String(formData.role ?? 1);
  const roleDescription = ROLE_DETAILS[selectedRole] || ROLE_DETAILS[1];
  const usernamePreview = formData.username?.trim() || 'new-user';
  const emailPreview = formData.email?.trim() || 'No email configured';

  const handleSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleAddUser(e);
  };

  const stopPropagation = (e) => {
    e.stopPropagation();
  };

  const handleDialogKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'Tab' && dialogRef.current) {
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR_QUERY)
      ).filter((el) => el.getAttribute('aria-hidden') !== 'true');

      if (focusableElements.length === 0) {
        return;
      }

      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];
      const current = document.activeElement;

      if (!e.shiftKey && current === lastEl) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && current === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    }
  };

  useEffect(() => {
    if (firstFieldRef.current && typeof firstFieldRef.current.focus === 'function') {
      firstFieldRef.current.focus();
    } else if (dialogRef.current && typeof dialogRef.current.focus === 'function') {
      dialogRef.current.focus();
    }
  }, []);

  const handleBackdropMouseDown = (e) => {
    backdropPointerDownRef.current = e.target === e.currentTarget;
  };

  const handleBackdropClick = (e) => {
    if (backdropPointerDownRef.current && e.target === e.currentTarget) {
      onClose();
    }
    backdropPointerDownRef.current = false;
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-modal-title"
          className="relative my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-border/80 bg-card text-card-foreground shadow-2xl"
          onClick={stopPropagation}
          onKeyDown={handleDialogKeyDown}
          ref={dialogRef}
          tabIndex={-1}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-primary/18 via-primary/6 to-transparent" />

          <div className="relative border-b border-border/80 px-6 py-5 sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Users
                </span>
                <h2 id="add-user-modal-title" className="mt-3 text-2xl font-semibold text-foreground">
                  {t('users.addNewUser')}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Configure identity, access level, and login restrictions before creating the account.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground transition hover:border-primary/30 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                onClick={onClose}
                aria-label={t('common.close')}
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.95fr)]">
                <div className="space-y-6">
                  <SectionCard
                    eyebrow="Identity"
                    title="Account details"
                    description="Set the primary credentials and contact information for this user."
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <FieldBlock htmlFor="username" label={t('fields.username')}>
                        <input
                          className={INPUT_CLASS}
                          id="username"
                          type="text"
                          name="username"
                          value={formData.username}
                          onChange={handleInputChange}
                          required
                          aria-required="true"
                          autoComplete="username"
                          ref={firstFieldRef}
                        />
                      </FieldBlock>

                      <FieldBlock htmlFor="password" label={t('fields.password')}>
                        <input
                          className={INPUT_CLASS}
                          id="password"
                          type="password"
                          name="password"
                          value={formData.password}
                          onChange={handleInputChange}
                          required
                          aria-required="true"
                          autoComplete="new-password"
                        />
                      </FieldBlock>
                    </div>

                    <div className="mt-4">
                      <FieldBlock htmlFor="email" label={t('fields.email')}>
                        <input
                          className={INPUT_CLASS}
                          id="email"
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          autoComplete="email"
                        />
                      </FieldBlock>
                    </div>
                  </SectionCard>

                  <SectionCard
                    eyebrow="Access"
                    title="Visibility and login policy"
                    description="Scope this account to specific cameras and trusted networks when needed."
                  >
                    <div className="space-y-5">
                      <FieldBlock
                        htmlFor="allowed_tags"
                        label={`${t('users.allowedStreamTags')} (RBAC)`}
                        hint={t('users.allowedTagsHelp')}
                      >
                        <div>
                          <input
                            className={INPUT_CLASS}
                            id="allowed_tags"
                            type="text"
                            name="allowed_tags"
                            value={formData.allowed_tags || ''}
                            onChange={handleInputChange}
                            placeholder={t('users.allowedTagsPlaceholder')}
                            maxLength={255}
                          />
                          {parsedAllowedTags.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2" role="list" aria-label={t('users.currentAllowedStreamTags')}>
                              {parsedAllowedTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </FieldBlock>

                      <FieldBlock
                        htmlFor="allowed_login_cidrs"
                        label={`${t('users.allowedLoginIpRanges')} (CIDR)`}
                        hint={t('users.allowedLoginCidrsHelp')}
                      >
                        <textarea
                          className={TEXTAREA_CLASS}
                          id="allowed_login_cidrs"
                          name="allowed_login_cidrs"
                          value={formData.allowed_login_cidrs || ''}
                          onChange={handleInputChange}
                          placeholder={allowedLoginCidrsPlaceholder}
                          rows={5}
                          maxLength={1023}
                        />
                      </FieldBlock>
                    </div>
                  </SectionCard>
                </div>

                <div className="space-y-6">
                  <SectionCard
                    eyebrow="Controls"
                    title="Role and security"
                    description="Choose how much access this account receives and how it authenticates."
                  >
                    <div className="space-y-5">
                      <FieldBlock htmlFor="role" label={t('fields.role')} hint={roleDescription}>
                        <div className="relative">
                          <select
                            className={SELECT_CLASS}
                            id="role"
                            name="role"
                            value={formData.role}
                            onChange={handleInputChange}
                          >
                            {Object.entries(USER_ROLE_KEYS).map(([value, key]) => (
                              <option key={value} value={value}>{t(key)}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted-foreground">
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        </div>
                      </FieldBlock>

                      <div className="space-y-3">
                        <ToggleCard
                          id="is_active"
                          name="is_active"
                          checked={formData.is_active}
                          onChange={handleInputChange}
                          label={t('users.active')}
                          description="Allow this account to sign in immediately after creation."
                        />

                        <ToggleCard
                          id="password_change_locked"
                          name="password_change_locked"
                          checked={formData.password_change_locked}
                          onChange={handleInputChange}
                          label={t('users.lockPasswordChanges')}
                          description={t('users.lockPasswordChangesHelp')}
                        />
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard
                    eyebrow="Review"
                    title={usernamePreview}
                    description={emailPreview}
                  >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-2xl border border-border bg-card px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Role
                        </div>
                        <div className="mt-2 text-sm font-semibold text-foreground">
                          {getUserRoleLabel(t, formData.role)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Status
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={formData.is_active ? 'badge-success' : 'badge-muted'}>
                            {formData.is_active ? t('users.active') : t('users.inactive')}
                          </span>
                          {formData.password_change_locked ? (
                            <span className="badge-warning">
                              {t('users.passwordChangesLocked')}
                            </span>
                          ) : (
                            <span className="badge-success">
                              {t('users.passwordChangesAllowed')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card px-4 py-3 sm:col-span-2 xl:col-span-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Stream scope
                        </div>
                        <div className="mt-2">
                          {parsedAllowedTags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {parsedAllowedTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No stream restriction configured.</p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card px-4 py-3 sm:col-span-2 xl:col-span-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Login networks
                        </div>
                        <div className="mt-2">
                          {parsedAllowedCidrs.length > 0 ? (
                            <div className="space-y-1.5">
                              {parsedAllowedCidrs.slice(0, 4).map((cidr) => (
                                <div key={cidr} className="rounded-xl bg-background px-3 py-2 font-mono text-xs text-foreground">
                                  {cidr}
                                </div>
                              ))}
                              {parsedAllowedCidrs.length > 4 ? (
                                <p className="text-xs text-muted-foreground">
                                  +{parsedAllowedCidrs.length - 4} more rules
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No IP restriction configured.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>

            <div className="border-t border-border/80 bg-background/70 px-6 py-4 sm:px-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-muted-foreground">
                  The account will be created immediately with the selected access policy.
                </p>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onClose}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    {t('users.addUser')}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
