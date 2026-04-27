/**
 * LightNVR Web Interface Stream Delete Modal Component
 * Preact component for the stream delete modal
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../i18n.js';

/**
 * StreamDeleteModal component
 * @param {Object} props Component props
 * @param {string} props.streamId ID of the stream to delete
 * @param {string} props.streamName Name of the stream to display
 * @param {Function} props.onClose Function to call when the modal is closed
 * @param {Function} props.onDisable Function to call when the disable button is clicked
 * @param {Function} props.onDelete Function to call when the delete button is clicked
 * @param {boolean} props.isDeleting Whether a delete operation is in progress
 * @param {boolean} props.isDisabling Whether a disable operation is in progress
 * @returns {JSX.Element} StreamDeleteModal component
 */
export function StreamDeleteModal({ streamId, streamName, onClose, onDisable, onDelete, isDeleting = false, isDisabling = false }) {
  const { t } = useI18n();
  const [isConfirmDelete, setIsConfirmDelete] = useState(false);
  const isLoading = isDeleting || isDisabling;
  const backdropRef = useRef(null);
  const displayStreamName = streamName || streamId;

  const disableEffects = [
    t('streams.disableStreamBulletStopProcessing'),
    t('streams.disableStreamBulletLiveDisabled'),
    t('streams.disableStreamBulletRecordingDisabled'),
    t('streams.disableStreamBulletAudioDisabled'),
    t('streams.disableStreamBulletDetectionDisabled'),
    t('streams.disableStreamBulletConfigurationPreserved'),
    t('streams.disableStreamBulletRecordingsKept'),
    t('streams.disableStreamBulletCanReenable'),
  ];

  const deleteEffects = [
    t('streams.deleteStreamBulletRemoved'),
    t('streams.deleteStreamBulletConfigurationDeleted'),
    t('streams.deleteStreamBulletRecordingsAccessible'),
    t('streams.deleteStreamBulletCannotRecover'),
  ];

  useEffect(() => {
    if (isLoading) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onClose]);

  // Show delete confirmation step
  const showDeleteConfirmation = () => {
    setIsConfirmDelete(true);
  };

  // Handle disable stream - don't close modal, let parent handle it via onSuccess/onError
  const handleDisable = () => {
    onDisable(streamId);
  };

  // Handle delete stream - don't close modal, let parent handle it via onSuccess/onError
  const handleDelete = () => {
    onDelete(streamId);
  };

  const handleBackdropClick = (event) => {
    if (!isLoading && event.target === backdropRef.current) {
      onClose();
    }
  };

  const renderEffectList = (items, tone) => (
    <ul class="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} class="flex items-start gap-2 text-sm text-muted-foreground leading-5">
          <span
            class={`mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${tone === 'danger' ? 'bg-red-500' : 'bg-amber-500'}`}
            aria-hidden="true"
          ></span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  const renderActionSection = ({
    action,
    title,
    description,
    details,
    buttonLabel,
    buttonClass,
    icon,
    tone,
    onAction,
  }) => (
    <section class="py-5 first:pt-0 last:pb-0">
      <div class="flex items-start gap-4">
        <div
          class={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${
            tone === 'danger'
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}
          aria-hidden="true"
        >
          {icon}
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="text-base font-semibold leading-6">{title}</h4>
                <span
                  class={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                    tone === 'danger'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {action}
                </span>
              </div>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            </div>

            <button
              type="button"
              class={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
              onClick={onAction}
              disabled={isLoading}
            >
              {buttonLabel}
            </button>
          </div>

          <div class="mt-4">
            {renderEffectList(details, tone)}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div
      ref={backdropRef}
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-delete-modal-title"
        class="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl"
      >
        <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div class="flex min-w-0 items-start gap-3">
            <div
              class={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                isConfirmDelete
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
              aria-hidden="true"
            >
              {isConfirmDelete ? (
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m0 3.75h.008v.008H12v-.008z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
              ) : (
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7h12M9 7V5.75A1.75 1.75 0 0 1 10.75 4h2.5A1.75 1.75 0 0 1 15 5.75V7m-7.5 0-.6 10.05A2 2 0 0 0 8.9 19h6.2a2 2 0 0 0 1.99-1.95L16.5 7M10 11.25v4.5m4-4.5v4.5" />
                </svg>
              )}
            </div>

            <div class="min-w-0">
              <h3 id="stream-delete-modal-title" class="text-lg font-semibold leading-6">
                {isLoading
                  ? (isDeleting ? t('streams.deletingStream') : t('streams.disablingStream'))
                  : isConfirmDelete ? t('streams.confirmPermanentDeletion') : t('streams.streamActions')}
              </h3>
              {!isLoading && (
                <p class="mt-1 text-sm text-muted-foreground">
                  {isConfirmDelete
                    ? t('streams.streamDeleteCannotBeUndone')
                    : t('streams.chooseFollowingOptions')}
                </p>
              )}
            </div>
          </div>

          {!isLoading && (
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>

        <div class="max-h-[80vh] overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div class="flex flex-col items-center justify-center py-12 text-center">
              <div class="inline-block h-10 w-10 animate-spin rounded-full border-4 border-input border-t-primary"></div>
              <p class="mt-5 text-sm font-medium text-foreground">
                {isDeleting ? t('streams.permanentlyDeletingStream') : t('streams.disablingStreamProgress')}
              </p>
              <p class="mt-2 text-sm text-muted-foreground">{t('streams.thisMayTakeAFewSeconds')}</p>
            </div>
          ) : !isConfirmDelete ? (
            <div>
              <div class="mb-6">
                <p class="text-sm font-medium text-foreground">
                  {t('streams.whatWouldYouLikeToDoWith', { streamName: displayStreamName })}
                </p>
                <div class="mt-3 inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-sm font-medium">
                  {displayStreamName}
                </div>
              </div>

              <div class="divide-y divide-border border-y border-border">
                {renderActionSection({
                  action: t('common.disable'),
                  title: t('streams.disableStreamSoftDelete'),
                  description: t('streams.disableStreamExplanation'),
                  details: disableEffects,
                  buttonLabel: t('common.disable'),
                  buttonClass: 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500',
                  tone: 'warning',
                  onAction: handleDisable,
                  icon: (
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v9m0 0 3-3m-3 3-3-3M5 13.5v2.75A1.75 1.75 0 0 0 6.75 18h10.5A1.75 1.75 0 0 0 19 16.25V13.5" />
                    </svg>
                  ),
                })}

                {renderActionSection({
                  action: t('common.delete'),
                  title: t('streams.deleteStreamPermanent'),
                  description: t('streams.deleteStreamExplanation'),
                  details: deleteEffects,
                  buttonLabel: t('common.delete'),
                  buttonClass: 'border border-red-500/40 bg-transparent text-red-600 hover:bg-red-500/10 focus:ring-red-500 dark:text-red-400',
                  tone: 'danger',
                  onAction: showDeleteConfirmation,
                  icon: (
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7h12M9 7V5.75A1.75 1.75 0 0 1 10.75 4h2.5A1.75 1.75 0 0 1 15 5.75V7m-7.5 0-.6 10.05A2 2 0 0 0 8.9 19h6.2a2 2 0 0 0 1.99-1.95L16.5 7M10 11.25v4.5m4-4.5v4.5" />
                    </svg>
                  ),
                })}
              </div>
            </div>
          ) : (
            <div>
              <div class="rounded-lg border border-red-500/20 bg-red-500/5 px-5 py-4">
                <div class="flex items-start gap-4">
                  <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m0 3.75h.008v.008H12v-.008z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    </svg>
                  </div>

                  <div class="min-w-0 flex-1">
                    <h4 class="text-lg font-semibold leading-6">
                      {t('streams.areYouSureDeletePermanent', { streamName: displayStreamName })}
                    </h4>
                    <p class="mt-2 text-sm leading-6 text-muted-foreground">
                      {t('streams.streamDeleteCannotBeUndone')}
                    </p>
                  </div>
                </div>
              </div>

              <div class="mt-5">
                {renderEffectList(deleteEffects, 'danger')}
              </div>

              <div class="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  class="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setIsConfirmDelete(false)}
                  disabled={isLoading}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  class="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleDelete}
                  disabled={isLoading}
                >
                  {t('streams.yesDeletePermanently')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
