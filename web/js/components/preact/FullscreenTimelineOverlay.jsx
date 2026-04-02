/**
 * Fullscreen timeline dock for live WebRTC cells.
 *
 * In fullscreen, the live view should keep the video unobstructed and place the
 * timeline below it, with a compact preview strip and a collapse handle.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useQuery } from '../../query-client.js';
import { useI18n } from '../../i18n.js';
import { currentDateInputValue, getLocalDayIsoRange } from '../../utils/date-utils.js';
import { forceNavigation } from '../../utils/navigation-utils.js';
import { formatUtils } from './recordings/formatUtils.js';
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
 * @param {Function} [props.onPreviewSelect]
 * @param {Function} [props.onReturnToLive]
 * @returns {JSX.Element|null}
 */
export function FullscreenTimelineOverlay({ streamName, isVisible, onPreviewSelect, onReturnToLive }) {
  const { t } = useI18n();
  const [selectedDate] = useState(() => currentDateInputValue());
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [cursorTimestamp, setCursorTimestamp] = useState(() => Math.floor(Date.now() / 1000));
  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(() => getTimelineDayLengthHours(selectedDate));
  const [previewStripWidth, setPreviewStripWidth] = useState(0);
  const previewStripRef = useRef(null);

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

  const previewSamples = useMemo(() => {
    if (!isExpanded || !segments.length) {
      return [];
    }

    const bounds = getLocalDayBounds(selectedDate);
    if (!bounds) {
      return [];
    }

    const visibleRange = Math.max(endHour - startHour, 0.001);
    const desiredTileWidth = visibleRange <= 0.05
      ? 28
      : visibleRange <= 0.25
        ? 34
        : visibleRange <= 1
          ? 42
          : visibleRange <= 6
            ? 54
            : visibleRange <= 12
              ? 60
              : 66;
    const measuredWidth = previewStripWidth > 0 ? previewStripWidth : 1200;
    const sampleCount = clamp(Math.round(measuredWidth / desiredTileWidth), visibleRange <= 1 ? 16 : 10, visibleRange <= 0.25 ? 40 : 28);

    return Array.from({ length: sampleCount }, (_, index) => {
      const ratio = (index + 0.5) / sampleCount;
      const sampleHour = startHour + (ratio * visibleRange);
      const sampleTimestamp = Math.round(bounds.startTimestamp + (sampleHour * 3600));
      const containingIndex = findContainingSegmentIndex(segments, sampleTimestamp);
      const nearestIndex = containingIndex !== -1
        ? containingIndex
        : findNearestSegmentIndex(segments, sampleTimestamp);
      const segment = nearestIndex !== -1 ? segments[nearestIndex] : null;

      return {
        key: `preview-${index}`,
        thumbUrl: segment ? `/api/recordings/thumbnail/${segment.id}/${getPreviewFrameIndex(segment, sampleTimestamp)}` : null,
        timestamp: sampleTimestamp,
        segmentId: segment?.id ?? null,
        offsetSeconds: segment ? Math.max(0, sampleTimestamp - segment.start_timestamp) : 0,
        playbackUrl: segment ? `/api/recordings/play/${segment.id}?v=${sampleTimestamp}` : null,
        href: segment ? formatUtils.getTimelineUrl(streamName, sampleTimestamp, true) : null
      };
    });
  }, [endHour, isExpanded, previewStripWidth, selectedDate, segments, startHour, streamName]);

  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }

    const element = previewStripRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect?.width || 0;
      setPreviewStripWidth(nextWidth);
    });

    observer.observe(element);
    setPreviewStripWidth(element.getBoundingClientRect().width || 0);

    return () => observer.disconnect();
  }, [isExpanded]);

  const visibleMarkers = useMemo(() => {
    const markers = [];
    const visibleRange = Math.max(endHour - startHour, 0.001);
    const visibleSeconds = visibleRange * 3600;
    let stepSeconds = 3600;
    if (visibleSeconds <= 30) {
      stepSeconds = 1;
    } else if (visibleSeconds <= 120) {
      stepSeconds = 5;
    } else if (visibleSeconds <= 600) {
      stepSeconds = 15;
    } else if (visibleSeconds <= 1800) {
      stepSeconds = 60;
    } else if (visibleSeconds <= 7200) {
      stepSeconds = 300;
    } else if (visibleSeconds <= 21600) {
      stepSeconds = 900;
    }
    const step = stepSeconds / 3600;
    const firstMarker = Math.ceil(startHour / step) * step;

    for (let hour = firstMarker; hour <= endHour + 0.001; hour += step) {
      const position = ((hour - startHour) / visibleRange) * 100;
      const isMajorTick = stepSeconds >= 3600;

      markers.push(
        <div
          key={`marker-${hour.toFixed(2)}`}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        >
          <div className={`w-px ${isMajorTick ? 'h-[12px] bg-white/35' : 'h-[8px] bg-white/20'}`} />
          <div className={`mt-[-1px] whitespace-nowrap ${isMajorTick ? 'text-[10px] text-white/70' : 'text-[9px] text-white/45'}`}>
            {formatTickLabel(hour, selectedDate, stepSeconds)}
          </div>
        </div>
      );
    }

    return markers;
  }, [endHour, selectedDate, startHour]);

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
  const cursorHour = timestampToTimelineOffset(cursorTimestamp, selectedDate);
  const cursorPosition = Number.isFinite(cursorHour)
    ? ((cursorHour - startHour) / visibleRange) * 100
    : -1;
  const showCursor = cursorPosition >= 0 && cursorPosition <= 100;

  const zoomIn = () => {
    const anchorHour = Number.isFinite(cursorHour)
      ? cursorHour
      : (startHour + endHour) / 2;
    const nextRange = zoomTimelineRange(startHour, endHour, 0.5, anchorHour, dayLengthHours, MIN_FULLSCREEN_TIMELINE_VIEW_HOURS);
    setStartHour(nextRange.startHour);
    setEndHour(nextRange.endHour);
    setIsFollowingLive(false);
  };

  const zoomOut = () => {
    const anchorHour = Number.isFinite(cursorHour)
      ? cursorHour
      : (startHour + endHour) / 2;
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

  const handleStripClick = (event) => {
    const bounds = getLocalDayBounds(selectedDate);
    if (!bounds) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickRatio = rect.width > 0
      ? Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1))
      : 0.5;
    const clickHour = startHour + (clickRatio * visibleRange);
    const timestamp = Math.round(bounds.startTimestamp + (clickHour * 3600));

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

    setCursorTimestamp(sample.timestamp);
    setIsFollowingLive(false);

    if (typeof onPreviewSelect === 'function') {
      onPreviewSelect(sample, event);
      return;
    }

    if (sample.href) {
      forceNavigation(sample.href, event);
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

  return (
    <div
      className="w-full shrink-0 border-t border-white/10 bg-[#05070d] text-white"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex items-center justify-center border-b border-white/10 py-1">
        <button
          type="button"
          title={isExpanded ? 'Hide timeline' : 'Show timeline'}
          aria-label={isExpanded ? 'Hide timeline' : 'Show timeline'}
          onClick={() => setIsExpanded(v => !v)}
          className="inline-flex h-5 w-10 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <MiniChevron expanded={isExpanded} />
        </button>
      </div>

      {isExpanded && (
        <div className="px-2 pb-2 pt-2 sm:px-3 sm:pb-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/45 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-2 sm:px-3">
              <div className="min-w-0">
                <div className="font-mono text-[12px] font-semibold tabular-nums tracking-[0.16em] text-sky-300 sm:text-[13px]">
                  {currentTimeLabel}
                </div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  {fullDateLabel}
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
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

            {previewSamples.length > 0 && (
              <div className="border-b border-white/10 bg-black/30 px-2 py-1 sm:px-3">
                <div
                  ref={previewStripRef}
                  className="grid gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${previewSamples.length}, minmax(0, 1fr))` }}
                >
                  {previewSamples.map((sample) => (
                    <button
                      type="button"
                      key={sample.key}
                      title={sample.timestamp ? formatClockLabel(sample.timestamp) : 'Open recording'}
                      aria-label={sample.timestamp ? `Open recording at ${formatClockLabel(sample.timestamp)}` : 'Open recording'}
                      onClick={(event) => handlePreviewSelect(sample, event)}
                      className="relative aspect-video overflow-hidden rounded-[3px] border border-white/10 bg-[#10151f] transition-colors hover:border-sky-300/40 hover:bg-[#18202d]"
                    >
                      {sample.thumbUrl ? (
                        <img
                          src={sample.thumbUrl}
                          alt="Timeline preview"
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-[9px] text-white/35">
                          No preview
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="border-b border-white/10 bg-black/40 px-2 py-1 text-center text-[11px] uppercase tracking-[0.24em] text-white/55 sm:px-3">
              {fullDateLabel}
            </div>

            {isLoading ? (
              <div className="flex h-20 items-center justify-center px-3 text-sm text-white/55">
                {t('common.loading')}
              </div>
            ) : error ? (
              <div className="flex h-20 items-center justify-center px-3 text-sm text-red-200">
                {t('timeline.reloadTimelineData')}
              </div>
            ) : visibleSegments.length === 0 ? (
              <div className="flex h-20 items-center justify-center px-3 text-sm text-white/45">
                {t('recordings.noRecordingsFound')}
              </div>
            ) : (
              <div className="px-2 pb-2 pt-2 sm:px-3" onWheel={handleWheelZoom}>
                <div className="relative h-6">
                  {visibleMarkers}
                </div>

                <div
                  className="relative h-5 overflow-hidden rounded-sm border border-emerald-700/40 bg-[#355d31] shadow-inner"
                  onClick={handleStripClick}
                >
                  <div
                    className="absolute inset-0 opacity-60"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 3.125%)'
                    }}
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
                          height: '6px',
                          background: segment.has_detection
                            ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.98) 0%, rgba(34, 197, 94, 0.95) 100%)'
                            : 'linear-gradient(180deg, rgba(100, 220, 118, 0.95) 0%, rgba(58, 181, 74, 0.92) 100%)',
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'
                        }}
                      />
                    );
                  })}

                  <div className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-md border border-white/10 bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white shadow-md">
                    {streamName}
                  </div>

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
                        {formatClockLabel(cursorTimestamp)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-1 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.22em] text-white/35">
                  <span>Mouse wheel zooms</span>
                  <span>Click strip to seek</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
