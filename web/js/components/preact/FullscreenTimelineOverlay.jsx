/**
 * Fullscreen timeline dock for live WebRTC cells.
 *
 * The dock supports two modes:
 * - `floating`: fixed to the bottom edge of the page fullscreen overlay
 * - `dock`: reserves space inside a fullscreen video cell so the timeline feels
 *   like NX Witness playback instead of a panel sitting on top of the video
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useQuery } from '../../query-client.js';
import { useI18n } from '../../i18n.js';
import { currentDateInputValue, getLocalDayIsoRange } from '../../utils/date-utils.js';
import { forceNavigation } from '../../utils/navigation-utils.js';
import { formatUtils } from './recordings/formatUtils.js';
import { TimelineBarBody } from './timeline/TimelineBarBody.jsx';
import {
  findContainingSegmentIndex,
  findNearestSegmentIndex,
  getClippedSegmentHourRange,
  getLocalDayBounds,
  getTimelineDayLengthHours,
  timestampToTimelineOffset,
  zoomTimelineRange
} from './timeline/timelineUtils.js';

function formatClockLabel(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date(timestamp * 1000));
}

function formatOverlayDate(dateString) {
  if (!dateString) return '';

  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function IconButton({ title, onClick, children, active = false, disabled = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
        active
          ? 'border-white/20 bg-white/15 text-white'
          : 'border-white/10 bg-black/25 text-white/75 hover:bg-white/10 hover:text-white'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {children}
    </button>
  );
}

function stripHours(hours) {
  return Math.max(hours, 0);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const MIN_FULLSCREEN_TIMELINE_VIEW_HOURS = 1 / 3600;

function getPreviewFrameIndex(segment, sampleTimestamp) {
  const start = Number(segment?.start_timestamp);
  const end = Number(segment?.end_timestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 1;
  }

  const ratio = clamp((sampleTimestamp - start) / (end - start), 0, 1);
  if (ratio < 0.33) return 0;
  if (ratio < 0.66) return 1;
  return 2;
}

function formatTickLabel(offsetHours, selectedDate, stepSeconds = 3600) {
  const bounds = getLocalDayBounds(selectedDate);
  if (!bounds || !Number.isFinite(offsetHours)) {
    return '';
  }

  const timestamp = bounds.startTimestamp + (offsetHours * 3600);
  const date = new Date(timestamp * 1000);

  if (stepSeconds < 60) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function MiniChevron({ expanded }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-3.5 w-3.5 transition-transform ${expanded ? '' : 'rotate-180'}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * FullscreenTimelineOverlay
 * @param {Object} props
 * @param {string} props.streamName
 * @param {boolean} props.isVisible
 * @param {'floating'|'dock'} [props.mode='floating']
 * @param {number|null} [props.playbackTimestamp]
 * @param {Function} [props.onPreviewSelect]
 * @param {Function} [props.onReturnToLive]
 * @returns {JSX.Element|null}
 */
export function FullscreenTimelineOverlay({
  streamName,
  isVisible,
  mode = 'floating',
  playbackTimestamp = null,
  onPreviewSelect,
  onReturnToLive
}) {
  const { t } = useI18n();
  const [selectedDate, setSelectedDate] = useState(() => currentDateInputValue());
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [cursorTimestamp, setCursorTimestamp] = useState(() => Math.floor(Date.now() / 1000));
  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(() => getTimelineDayLengthHours(selectedDate));
  const [scrubTimestamp, setScrubTimestamp] = useState(null);
  const trackRef = useRef(null);
  const scrubStateRef = useRef({ isDragging: false, pointerId: null });
  const isDocked = mode === 'dock';

  const dayRange = useMemo(() => getLocalDayIsoRange(selectedDate), [selectedDate]);
  const dayLengthHours = useMemo(() => getTimelineDayLengthHours(selectedDate), [selectedDate]);
  const timelineUrl = streamName
    ? `/api/timeline/segments?stream=${encodeURIComponent(streamName)}&start=${encodeURIComponent(dayRange.startTime)}&end=${encodeURIComponent(dayRange.endTime)}`
    : null;

  const {
    data: timelineData,
    isLoading,
    error
  } = useQuery(
    ['fullscreen-timeline-segments', streamName, selectedDate],
    timelineUrl,
    {
      timeout: 30000,
      retries: 2,
      retryDelay: 1000
    },
    {
      enabled: !!streamName && isVisible
    }
  );

  const segments = useMemo(() => {
    const rawSegments = Array.isArray(timelineData?.segments) ? timelineData.segments : [];
    return [...rawSegments].sort((a, b) => a.start_timestamp - b.start_timestamp);
  }, [timelineData]);

  const visibleSegments = useMemo(() => {
    if (!segments.length) {
      return [];
    }

    return segments
      .map((segment) => {
        const range = getClippedSegmentHourRange(segment, selectedDate);
        if (!range) return null;
        return {
          ...segment,
          startHour: range.startHour,
          endHour: range.endHour
        };
      })
      .filter(Boolean);
  }, [segments, selectedDate]);

  const updateCursorFromPointer = (event) => {
    const bounds = getLocalDayBounds(selectedDate);
    const trackElement = trackRef.current;
    if (!bounds || !trackElement) {
      return;
    }

    const rect = trackElement.getBoundingClientRect();
    if (!rect.width) {
      return;
    }

    const visibleRange = Math.max(endHour - startHour, 0.001);
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const clickHour = startHour + (ratio * visibleRange);
    const timestamp = Math.round(bounds.startTimestamp + (clickHour * 3600));

    setCursorTimestamp(timestamp);
    setScrubTimestamp(timestamp);
    setIsFollowingLive(false);
  };

  const buildPlaybackSample = (segment, timestamp) => {
    if (!segment) {
      return null;
    }

    const safeTimestamp = Math.max(segment.start_timestamp, Math.min(timestamp, segment.end_timestamp));
    const offsetSeconds = Math.max(0, safeTimestamp - segment.start_timestamp);

    return {
      key: `seek-${segment.id}-${safeTimestamp}`,
      timestamp: safeTimestamp,
      segmentId: segment.id,
      offsetSeconds,
      thumbUrl: `/api/recordings/thumbnail/${segment.id}/${getPreviewFrameIndex(segment, safeTimestamp)}`,
      playbackUrl: `/api/recordings/play/${segment.id}?v=${safeTimestamp}`,
      href: formatUtils.getTimelineUrl(streamName, safeTimestamp, true)
    };
  };

  const resolvePlaybackSampleAtTimestamp = (timestamp) => {
    if (!segments.length) {
      return null;
    }

    const containingIndex = findContainingSegmentIndex(segments, timestamp);
    const segmentIndex = containingIndex !== -1
      ? containingIndex
      : findNearestSegmentIndex(segments, timestamp);

    if (segmentIndex === -1) {
      return null;
    }

    return buildPlaybackSample(segments[segmentIndex], timestamp);
  };

  useEffect(() => {
    if (!isVisible || !streamName) {
      return undefined;
    }

    // Keep the live-day label aligned to the user's local midnight boundary.
    const syncSelectedDate = () => {
      const nextDate = currentDateInputValue();
      setSelectedDate(nextDate);
    };

    const midnightTick = setInterval(syncSelectedDate, 60000);
    syncSelectedDate();

    return () => clearInterval(midnightTick);
  }, [isVisible, streamName]);

  useEffect(() => {
    if (!isVisible || !streamName) {
      return undefined;
    }

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setClockNow(now);
      if (isFollowingLive) {
        setCursorTimestamp(now);
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [isVisible, streamName, isFollowingLive]);

  useEffect(() => {
    if (!isVisible || !streamName) {
      return;
    }

    setStartHour(0);
    setEndHour(dayLengthHours);
  }, [dayLengthHours, isVisible, streamName]);

  if (!isVisible || !streamName) {
    return null;
  }

  const visibleRange = Math.max(endHour - startHour, 0.001);

  const zoomIn = () => {
    const activeHour = timestampToTimelineOffset(scrubTimestamp ?? cursorTimestamp, selectedDate);
    const anchorHour = Number.isFinite(activeHour) ? activeHour : (startHour + endHour) / 2;
    const nextRange = zoomTimelineRange(startHour, endHour, 0.5, anchorHour, dayLengthHours, MIN_FULLSCREEN_TIMELINE_VIEW_HOURS);
    setStartHour(nextRange.startHour);
    setEndHour(nextRange.endHour);
    setIsFollowingLive(false);
  };

  const zoomOut = () => {
    const activeHour = timestampToTimelineOffset(scrubTimestamp ?? cursorTimestamp, selectedDate);
    const anchorHour = Number.isFinite(activeHour) ? activeHour : (startHour + endHour) / 2;
    const nextRange = zoomTimelineRange(startHour, endHour, 2, anchorHour, dayLengthHours, MIN_FULLSCREEN_TIMELINE_VIEW_HOURS);
    setStartHour(nextRange.startHour);
    setEndHour(nextRange.endHour);
    setIsFollowingLive(false);
  };

  const jumpToLive = () => {
    const now = Math.floor(Date.now() / 1000);
    setStartHour(0);
    setEndHour(dayLengthHours);
    setCursorTimestamp(now);
    setIsFollowingLive(true);
    setIsExpanded(true);
  };

  const stepCursor = (seconds) => {
    setCursorTimestamp((current) => {
      const next = Math.max(current + seconds, 0);
      const bounds = getLocalDayBounds(selectedDate);
      if (!bounds) return next;
      return Math.max(bounds.startTimestamp, Math.min(next, bounds.endTimestamp));
    });
    setIsFollowingLive(false);
  };

  const handleTrackPointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') {
      return;
    }

    event.preventDefault();
    scrubStateRef.current.isDragging = true;
    scrubStateRef.current.pointerId = event.pointerId;

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore capture errors; scrubbing still works with direct pointer events.
      }
    }

    updateCursorFromPointer(event);
  };

  const handleTrackPointerMove = (event) => {
    if (!scrubStateRef.current.isDragging) {
      return;
    }

    event.preventDefault();
    updateCursorFromPointer(event);
  };

  const endTrackScrub = (event) => {
    if (!scrubStateRef.current.isDragging) {
      return;
    }

    scrubStateRef.current.isDragging = false;
    scrubStateRef.current.pointerId = null;
    setScrubTimestamp(null);

    if (event?.currentTarget && typeof event.currentTarget.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore release errors.
      }
    }
  };

  const handleStripClick = (event) => {
    const bounds = getLocalDayBounds(selectedDate);
    if (!bounds) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickRatio = rect.width > 0
      ? Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1))
      : 0.5;
    const clickHour = startHour + (clickRatio * visibleRange);
    const timestamp = Math.round(bounds.startTimestamp + (clickHour * 3600));

    const sample = resolvePlaybackSampleAtTimestamp(timestamp);
    if (sample) {
      handlePreviewSelect(sample, event);
      return;
    }

    setCursorTimestamp(timestamp);
    setIsFollowingLive(false);
  };

  const handleWheelZoom = (event) => {
    event.preventDefault();

    const zoomFactor = event.deltaY < 0 ? 0.8 : 1.25;
    const rect = event.currentTarget.getBoundingClientRect();
    const clickRatio = rect.width > 0
      ? Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1))
      : 0.5;
    const anchorHour = startHour + (clickRatio * visibleRange);
    const nextRange = zoomTimelineRange(startHour, endHour, zoomFactor, anchorHour, dayLengthHours, MIN_FULLSCREEN_TIMELINE_VIEW_HOURS);
    setStartHour(nextRange.startHour);
    setEndHour(nextRange.endHour);
    setIsFollowingLive(false);
  };

  const handlePreviewSelect = (sample, event) => {
    if (!sample) return;

    const resolvedSample = sample.segment
      ? (buildPlaybackSample(sample.segment, sample.timestamp) || sample)
      : sample;

    setCursorTimestamp(resolvedSample.timestamp);
    setIsFollowingLive(false);

    if (typeof onPreviewSelect === 'function') {
      onPreviewSelect(resolvedSample, event);
      return;
    }

    if (resolvedSample.href) {
      forceNavigation(resolvedSample.href, event);
    }
  };

  const handleLiveButton = (event) => {
    if (typeof onReturnToLive === 'function') {
      onReturnToLive(event);
    }

    jumpToLive();
  };

  const currentTimeLabel = formatClockLabel(clockNow);
  const fullDateLabel = formatOverlayDate(selectedDate);
  const activeCursorTimestamp = playbackTimestamp ?? scrubTimestamp ?? cursorTimestamp;
  const activeCursorHour = timestampToTimelineOffset(activeCursorTimestamp, selectedDate);
  const cursorPosition = Number.isFinite(activeCursorHour)
    ? ((activeCursorHour - startHour) / visibleRange) * 100
    : -1;
  const showCursor = cursorPosition >= 0 && cursorPosition <= 100;

  return (
    <div
      className={`text-white ${isDocked ? 'w-full' : 'border-t border-white/10 bg-[#05070d]'}`}
      style={{
        pointerEvents: 'auto',
        position: isDocked ? 'relative' : 'fixed',
        left: isDocked ? 'auto' : 0,
        right: isDocked ? 'auto' : 0,
        bottom: isDocked ? 'auto' : 0,
        zIndex: isDocked ? 20 : 1000,
        width: isDocked ? '100%' : '100vw',
        maxWidth: '100vw',
        marginTop: isDocked ? 'auto' : 0,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}
    >
      <div className={`flex items-center justify-center ${isDocked ? 'border-t border-white/10 bg-black/55 py-1' : 'border-b border-white/10 py-1'}`}>
        <button
          type="button"
          title={isExpanded ? 'Hide timeline' : 'Show timeline'}
          aria-label={isExpanded ? 'Hide timeline' : 'Show timeline'}
          onClick={() => setIsExpanded(v => !v)}
          className="inline-flex h-2 w-14 items-center justify-center rounded-full border border-white/10 bg-white/15 text-white/70 transition-colors hover:bg-white/25 hover:text-white"
        >
          <span className="sr-only">{isExpanded ? 'Hide timeline' : 'Show timeline'}</span>
        </button>
      </div>

      {isExpanded && (
        <div className={isDocked ? 'px-2 pb-2 pt-2 sm:px-3' : 'px-2 pb-2 pt-2 sm:px-3 sm:pb-3'}>
          <div className={isDocked
            ? 'overflow-hidden rounded-t-2xl rounded-b-none border border-white/10 bg-[#05070d]/96 shadow-[0_-24px_60px_rgba(0,0,0,0.48)]'
            : 'overflow-hidden rounded-2xl border border-white/10 bg-black/45 shadow-2xl'
          }>
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-2 py-2 sm:px-3 ${isDocked ? 'bg-black/35' : ''}`}>
              <div className="min-w-0 flex items-center gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[12px] font-semibold tabular-nums tracking-[0.12em] text-sky-200 sm:text-[13px]">
                    {currentTimeLabel}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/30">
                    {fullDateLabel}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                <div className="hidden min-[700px]:flex items-center gap-1 rounded-md border border-white/10 bg-black/25 p-1">
                  <IconButton title="Back 5m" onClick={() => stepCursor(-300)}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 6h2v12H6zM20 7.4 11.4 12 20 16.6V7.4zM10 7.4 1.4 12 10 16.6V7.4z" />
                    </svg>
                  </IconButton>
                  <IconButton title="Back 1m" onClick={() => stepCursor(-60)}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11 12 20 5v14l-9-7Zm-1 0 9-7v14l-9-7ZM4 5h2v14H4z" />
                    </svg>
                  </IconButton>
                  <IconButton
                    title={isFollowingLive ? t('timeline.pause') : t('timeline.playFromCurrentPosition')}
                    active={isFollowingLive}
                    onClick={() => {
                      if (isFollowingLive) {
                        setIsFollowingLive(false);
                      } else {
                        jumpToLive();
                      }
                    }}
                  >
                    {isFollowingLive ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5.1v13.8l11-6.9-11-6.9Z" />
                      </svg>
                    )}
                  </IconButton>
                  <IconButton title="Forward 1m" onClick={() => stepCursor(60)}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 12 4 5v14l9-7Zm1 0-9-7v14l9-7ZM20 5h-2v14h2z" />
                    </svg>
                  </IconButton>
                  <IconButton title="Forward 5m" onClick={() => stepCursor(300)}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 6h-2v12h2zM4 7.4 12.6 12 4 16.6V7.4zM14 7.4 22.6 12 14 16.6V7.4z" />
                    </svg>
                  </IconButton>
                </div>

                <IconButton
                  title={t('timeline.zoomOut')}
                  onClick={zoomOut}
                  disabled={stripHours(endHour - startHour) >= dayLengthHours}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </IconButton>
                <IconButton
                  title={t('timeline.zoomIn')}
                  onClick={zoomIn}
                  disabled={stripHours(endHour - startHour) <= MIN_FULLSCREEN_TIMELINE_VIEW_HOURS}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </IconButton>

                <button
                  type="button"
                  title={isFollowingLive ? 'Current live position' : 'Back to live'}
                  onClick={handleLiveButton}
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75 transition-colors hover:bg-white/10"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.55)]" />
                  LIVE
                </button>

                <div className="hidden min-[700px]:flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200">
                  <span className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.6)]" />
                  {isFollowingLive ? 'SYNC' : 'PAUSED'}
                </div>
              </div>
            </div>

            <TimelineBarBody
              segments={segments}
              selectedDate={selectedDate}
              startHour={startHour}
              endHour={endHour}
              dateLabel={fullDateLabel}
              isLoading={isLoading}
              error={error}
              loadingText={t('common.loading')}
              errorText={t('timeline.reloadTimelineData')}
              emptyText={t('recordings.noRecordingsFound')}
              onPreviewSelect={handlePreviewSelect}
              onWheel={handleWheelZoom}
              renderTrackContent={() => (
                <div
                  ref={trackRef}
                  className="relative h-11 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#121417] via-[#0d0f12] to-[#07080a] shadow-inner"
                  onPointerDown={handleTrackPointerDown}
                  onPointerMove={handleTrackPointerMove}
                  onPointerUp={endTrackScrub}
                  onPointerCancel={endTrackScrub}
                  onClick={handleStripClick}
                >
                  <div
                    className="absolute inset-0 opacity-45"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3.125%)'
                    }}
                  />

                  <div
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-emerald-500/40 via-emerald-300/70 to-emerald-500/40"
                    style={{ opacity: isFollowingLive ? 0.7 : 0.35 }}
                  />

                  {visibleSegments.map((segment, index) => {
                    const left = ((segment.startHour - startHour) / visibleRange) * 100;
                    const width = Math.max(((segment.endHour - segment.startHour) / visibleRange) * 100, 0.12);

                    return (
                      <div
                        key={`${segment.id || index}-${segment.start_timestamp}`}
                        className="absolute top-1/2 -translate-y-1/2 rounded-sm"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          height: '8px',
                          background: segment.has_detection
                            ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.98) 0%, rgba(34, 197, 94, 0.95) 100%)'
                            : 'linear-gradient(180deg, rgba(100, 220, 118, 0.95) 0%, rgba(58, 181, 74, 0.92) 100%)',
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'
                        }}
                      />
                    );
                  })}

                  {showCursor && (
                    <div
                      className="absolute top-[-4px] z-20"
                      style={{
                        left: `${cursorPosition}%`,
                        transform: 'translateX(-50%)'
                      }}
                    >
                      <div className="mx-auto h-4 w-[2px] rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.75)]" />
                      <div className="mt-0.5 -translate-x-1/2 rounded-sm border border-amber-300/30 bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-black shadow-lg">
                        {formatClockLabel(activeCursorTimestamp)}
                      </div>
                    </div>
                  )}
                </div>
              )}
              footerContent={(
                <div className="flex items-center justify-end gap-2 px-1 text-[10px] uppercase tracking-[0.22em] text-white/35">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/65">Click to seek</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/65">
                    {isFollowingLive ? 'Live sync' : 'Paused'}
                  </span>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
