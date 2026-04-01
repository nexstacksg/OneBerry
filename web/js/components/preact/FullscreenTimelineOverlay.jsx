/**
 * Fullscreen timeline overlay for live WebRTC cells.
 *
 * The overlay is shown only while a single live cell is in native fullscreen.
 * It renders a compact timeline strip that matches the screenshot-style live
 * bar instead of the full timeline page layout.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { useQuery } from '../../query-client.js';
import { useI18n } from '../../i18n.js';
import { currentDateInputValue, getLocalDayIsoRange } from '../../utils/date-utils.js';
import { formatUtils } from './recordings/formatUtils.js';
import {
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

function formatTickLabel(offsetHours, selectedDate) {
  const bounds = getLocalDayBounds(selectedDate);
  if (!bounds || !Number.isFinite(offsetHours)) {
    return '';
  }

  const timestamp = bounds.startTimestamp + (offsetHours * 3600);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(timestamp * 1000));
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
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

function stripHours(hours) {
  return Math.max(hours, 0);
}

/**
 * FullscreenTimelineOverlay
 * @param {Object} props
 * @param {string} props.streamName
 * @param {boolean} props.isVisible
 * @returns {JSX.Element|null}
 */
export function FullscreenTimelineOverlay({ streamName, isVisible }) {
  const { t } = useI18n();
  const [selectedDate] = useState(() => currentDateInputValue());
  const [clockNow, setClockNow] = useState(() => Math.floor(Date.now() / 1000));
  const [cursorTimestamp, setCursorTimestamp] = useState(() => Math.floor(Date.now() / 1000));
  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(() => getTimelineDayLengthHours(selectedDate));

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

  const mergedSegments = useMemo(() => {
    if (segments.length === 0) {
      return [];
    }

    const clipped = segments
      .map((segment) => {
        const range = getClippedSegmentHourRange(segment, selectedDate);
        if (!range) return null;
        return {
          ...segment,
          startHour: range.startHour,
          endHour: range.endHour
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.start_timestamp - b.start_timestamp);

    if (clipped.length === 0) {
      return [];
    }

    const merged = [];
    let current = { ...clipped[0] };

    for (let i = 1; i < clipped.length; i++) {
      const next = clipped[i];
      if (next.start_timestamp - current.end_timestamp <= 1) {
        current.end_timestamp = Math.max(current.end_timestamp, next.end_timestamp);
        current.endHour = Math.max(current.endHour, next.endHour);
        current.has_detection = current.has_detection || next.has_detection;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }, [segments, selectedDate]);

  const visibleMarkers = useMemo(() => {
    const markers = [];
    const visibleRange = Math.max(endHour - startHour, 0.001);
    const step = visibleRange <= 6 ? 0.25 : 0.5;
    const firstMarker = Math.ceil(startHour / step) * step;

    for (let hour = firstMarker; hour <= endHour + 0.001; hour += step) {
      const position = ((hour - startHour) / visibleRange) * 100;
      const isWholeHour = Math.abs(hour - Math.round(hour)) < 0.0001;

      markers.push(
        <div
          key={`marker-${hour.toFixed(2)}`}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        >
          <div
            className={`w-px ${isWholeHour ? 'h-[12px] bg-white/35' : 'h-[8px] bg-white/20'}`}
          />
          <div className={`mt-[-1px] whitespace-nowrap ${isWholeHour ? 'text-[10px] text-white/70' : 'text-[9px] text-white/45'}`}>
            {formatTickLabel(hour, selectedDate)}
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

    const now = Math.floor(Date.now() / 1000);
    setCursorTimestamp((prev) => (Number.isFinite(prev) ? prev : now));
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
    const nextRange = zoomTimelineRange(startHour, endHour, 0.5, anchorHour, dayLengthHours);
    setStartHour(nextRange.startHour);
    setEndHour(nextRange.endHour);
    setIsFollowingLive(false);
  };

  const zoomOut = () => {
    const anchorHour = Number.isFinite(cursorHour)
      ? cursorHour
      : (startHour + endHour) / 2;
    const nextRange = zoomTimelineRange(startHour, endHour, 2, anchorHour, dayLengthHours);
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

    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1));
    const clickHour = startHour + (clickRatio * visibleRange);
    const timestamp = Math.round(bounds.startTimestamp + (clickHour * 3600));

    setCursorTimestamp(timestamp);
    setIsFollowingLive(false);
  };

  const zoomAtPoint = (zoomFactor, clientX, element) => {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return;
    }

    const rect = element.getBoundingClientRect();
    const clickRatio = rect.width > 0
      ? Math.max(0, Math.min((clientX - rect.left) / rect.width, 1))
      : 0.5;
    const anchorHour = startHour + (clickRatio * visibleRange);
    const nextRange = zoomTimelineRange(startHour, endHour, zoomFactor, anchorHour, dayLengthHours);
    setStartHour(nextRange.startHour);
    setEndHour(nextRange.endHour);
    setIsFollowingLive(false);
  };

  const handleWheelZoom = (event) => {
    event.preventDefault();

    const zoomFactor = event.deltaY < 0 ? 0.8 : 1.25;
    zoomAtPoint(zoomFactor, event.clientX, event.currentTarget);
  };

  const currentTimeLabel = formatClockLabel(clockNow);
  const fullDateLabel = formatOverlayDate(selectedDate);
  const liveStateLabel = isFollowingLive ? 'SYNC' : 'PAUSED';

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-40 px-2 pb-2 sm:px-3 sm:pb-3"
      style={{
        pointerEvents: 'auto'
      }}
    >
      <div
        className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(9, 14, 23, 0.96) 0%, rgba(4, 8, 15, 0.98) 100%)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 18px 60px rgba(0, 0, 0, 0.42)'
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="font-mono text-[12px] font-semibold tabular-nums tracking-[0.16em] text-sky-300 sm:text-[13px]">
              {currentTimeLabel}
            </div>

            <div className="hidden min-[680px]:flex items-center gap-1 rounded-md border border-white/10 bg-black/25 p-1">
              <IconButton
                title="Back 5m"
                onClick={() => stepCursor(-300)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 6h2v12H6zM20 7.4 11.4 12 20 16.6V7.4zM10 7.4 1.4 12 10 16.6V7.4z" />
                </svg>
              </IconButton>
              <IconButton
                title="Back 1m"
                onClick={() => stepCursor(-60)}
              >
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
              <IconButton
                title="Forward 1m"
                onClick={() => stepCursor(60)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 12 4 5v14l9-7Zm1 0-9-7v14l9-7ZM20 5h-2v14h2z" />
                </svg>
              </IconButton>
              <IconButton
                title="Forward 5m"
                onClick={() => stepCursor(300)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 6h-2v12h2zM4 7.4 12.6 12 4 16.6V7.4zM14 7.4 22.6 12 14 16.6V7.4z" />
                </svg>
              </IconButton>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              title="Back to live"
              onClick={jumpToLive}
              className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70 transition-colors hover:bg-white/10 sm:flex"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.55)]" />
              LIVE
            </button>

            <div className="hidden items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200 sm:flex">
              <span className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.6)]" />
              {liveStateLabel}
            </div>

            <div className="hidden text-right sm:block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                {t('nav.timeline')}
              </div>
              <div className="text-[12px] text-white/70">
                {fullDateLabel}
              </div>
            </div>

            <IconButton
              title={t('timeline.zoomOut')}
              onClick={zoomOut}
              disabled={stripHours(endHour - startHour) >= dayLengthHours}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </IconButton>
            <IconButton
              title={t('timeline.zoomIn')}
              onClick={zoomIn}
              disabled={stripHours(endHour - startHour) <= 0.5}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </IconButton>

            <a
              href={formatUtils.getTimelineUrl(streamName, Math.floor(Date.now() / 1000), true)}
              className="hidden h-7 items-center rounded-md border border-white/10 bg-white/5 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/75 no-underline transition-colors hover:bg-white/10 sm:inline-flex"
            >
              {t('nav.timeline')}
            </a>
          </div>
        </div>

        <div className="px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
          {isLoading ? (
            <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-sm text-white/55">
              {t('common.loading')}
            </div>
          ) : error ? (
            <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-red-500/30 bg-red-500/[0.04] text-sm text-red-200">
              {t('timeline.reloadTimelineData')}
            </div>
          ) : (
            <div className="relative rounded-xl border border-white/10 bg-black/25 px-2 pb-2 pt-8 sm:px-3">
              <div className="pointer-events-none absolute inset-x-2 top-1 h-6">
                {visibleMarkers}
              </div>

              <div
                className="relative h-8 overflow-hidden rounded-md border border-emerald-700/40 bg-[#294f2c] shadow-inner"
                onClick={handleStripClick}
                onWheel={handleWheelZoom}
              >
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.0)_18%,rgba(0,0,0,0.08)_100%)]" />

                <div className="absolute left-0 top-0 h-full w-full opacity-75">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 3.125%)'
                    }}
                  />
                </div>

                {mergedSegments.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/45">
                    {t('recordings.noRecordingsFound')}
                  </div>
                ) : (
                  <>
                    {mergedSegments.map((segment, index) => {
                      const left = ((segment.startHour - startHour) / visibleRange) * 100;
                      const width = Math.max(((segment.endHour - segment.startHour) / visibleRange) * 100, 0.12);

                      return (
                        <div
                          key={`${segment.id || index}-${segment.start_timestamp}`}
                          className="absolute top-1/2 -translate-y-1/2 rounded-sm"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            height: '10px',
                            background: segment.has_detection
                              ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.96) 0%, rgba(34, 197, 94, 0.96) 100%)'
                              : 'linear-gradient(180deg, rgba(107, 220, 119, 0.98) 0%, rgba(67, 194, 92, 0.92) 100%)',
                            boxShadow: segment.has_detection
                              ? 'inset 0 0 0 1px rgba(255, 220, 154, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.18)'
                              : 'inset 0 0 0 1px rgba(255, 255, 255, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.14)'
                          }}
                        >
                          {segment.has_detection && (
                            <div
                              className="absolute inset-0 rounded-sm"
                              style={{
                                backgroundImage: 'repeating-linear-gradient(90deg, rgba(239, 68, 68, 0.42) 0 2px, rgba(245, 158, 11, 0.22) 2px 7px, rgba(255,255,255,0) 7px 13px)'
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                <div
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-md border border-white/10 bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white shadow-md"
                >
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
                    <div
                      className="mx-auto h-3 w-[2px] rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.75)]"
                    />
                    <div
                      className="mt-0.5 -translate-x-1/2 rounded-sm border border-amber-300/30 bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-black shadow-lg"
                    >
                      {formatClockLabel(cursorTimestamp)}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
                <span>{t('nav.timeline')}</span>
                <span>{formatOverlayDate(selectedDate)}</span>
              </div>
              <div className="mt-1 text-[10px] text-white/35">
                Use mouse wheel to zoom. Click the strip to seek.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
