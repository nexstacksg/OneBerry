import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Priority } from '../../../request-queue.js';
import { TimelineThumbnailTile } from './TimelineThumbnailTile.jsx';
import {
  findContainingSegmentIndex,
  findNearestSegmentIndex,
  getLocalDayBounds
} from './timelineUtils.js';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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

export function TimelineBarBody({
  segments = [],
  selectedDate,
  startHour,
  endHour,
  dateLabel,
  isLoading = false,
  error = null,
  loadingText = 'Loading...',
  errorText = 'Failed to load timeline',
  emptyText = 'No recordings found',
  onPreviewSelect,
  onWheel,
  previewPriority = Priority.HIGH,
  previewStripClassName = 'border-b border-white/10 bg-black/30 px-2 py-1 sm:px-3',
  renderTrackContent,
  footerContent = null
}) {
  const [previewStripWidth, setPreviewStripWidth] = useState(0);
  const previewStripRef = useRef(null);

  useEffect(() => {
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
  }, []);

  const previewSamples = useMemo(() => {
    if (!segments.length) {
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
    const sampleCount = clamp(
      Math.round(measuredWidth / desiredTileWidth),
      visibleRange <= 1 ? 16 : 10,
      visibleRange <= 0.25 ? 40 : 28
    );

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
        segment
      };
    });
  }, [endHour, previewStripWidth, segments, selectedDate, startHour]);

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

  return (
    <>
      {previewSamples.length > 0 && (
        <div className={previewStripClassName}>
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
                onClick={(event) => onPreviewSelect?.(sample, event)}
                className="relative aspect-video overflow-hidden rounded-[3px] border border-white/10 bg-[#10151f] transition-colors hover:border-sky-300/40 hover:bg-[#18202d]"
              >
                {sample.thumbUrl ? (
                  <TimelineThumbnailTile
                    thumbUrl={sample.thumbUrl}
                    alt="Timeline preview"
                    priority={previewPriority}
                    imgClassName="h-full w-full object-cover"
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
        {dateLabel}
      </div>

      <div className="px-2 pb-2 pt-2 sm:px-3">
        {isLoading ? (
          <div className="flex h-20 items-center justify-center px-3 text-sm text-white/55">
            {loadingText}
          </div>
        ) : error ? (
          <div className="flex h-20 items-center justify-center px-3 text-sm text-red-200">
            {errorText}
          </div>
        ) : segments.length === 0 ? (
          <div className="flex h-20 items-center justify-center px-3 text-sm text-white/45">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-2" onWheel={onWheel}>
            <div className="relative h-6">
              {visibleMarkers}
            </div>

            {renderTrackContent?.({ visibleMarkers })}

            {footerContent}
          </div>
        )}
      </div>
    </>
  );
}
