/**
 * LightNVR Timeline Preview Strip
 * Renders a continuous thumbnail ribbon above the timeline ruler.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Priority } from '../../../request-queue.js';
import { timelineState } from './TimelinePage.jsx';
import { TimelineThumbnailTile } from './TimelineThumbnailTile.jsx';
import {
  findContainingSegmentIndex,
  findNearestSegmentIndex,
  getTimelineDayLengthHours
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

function formatPreviewLabel(timestamp) {
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

export function TimelinePreviewStrip({ segments: propSegments }) {
  const [segments, setSegments] = useState(Array.isArray(propSegments) ? propSegments : []);
  const [startHour, setStartHour] = useState(timelineState.timelineStartHour ?? 0);
  const [endHour, setEndHour] = useState(
    timelineState.timelineEndHour ?? getTimelineDayLengthHours(timelineState.selectedDate)
  );
  const [selectedDate, setSelectedDate] = useState(timelineState.selectedDate ?? null);
  const [stripWidth, setStripWidth] = useState(0);
  const stripRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(propSegments)) {
      setSegments(propSegments);
    }
  }, [propSegments]);

  useEffect(() => {
    const unsubscribe = timelineState.subscribe(state => {
      setSegments(state.timelineSegments || []);
      setStartHour(state.timelineStartHour ?? 0);
      setEndHour(state.timelineEndHour ?? getTimelineDayLengthHours(state.selectedDate));
      setSelectedDate(state.selectedDate ?? null);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const element = stripRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      setStripWidth(element?.getBoundingClientRect().width || 0);
      return undefined;
    }

    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect?.width || 0;
      setStripWidth(nextWidth);
    });

    observer.observe(element);
    setStripWidth(element.getBoundingClientRect().width || 0);

    return () => observer.disconnect();
  }, []);

  const samples = useMemo(() => {
    if (!segments.length) {
      return [];
    }

    const visibleRange = Math.max(endHour - startHour, 0.001);
    const dayLengthHours = getTimelineDayLengthHours(selectedDate);
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
    const measuredWidth = stripWidth > 0 ? stripWidth : 1200;
    const sampleCount = clamp(
      Math.round(measuredWidth / desiredTileWidth),
      visibleRange <= 1 ? 16 : 10,
      visibleRange <= 0.25 ? 40 : 28
    );

    const bounds = selectedDate
      ? {
          startTimestamp: Math.floor(new Date(`${selectedDate}T00:00:00`).getTime() / 1000)
        }
      : null;

    if (!bounds || !Number.isFinite(bounds.startTimestamp)) {
      return [];
    }

    return Array.from({ length: sampleCount }, (_, index) => {
      const ratio = (index + 0.5) / sampleCount;
      const sampleHour = startHour + (ratio * visibleRange);
      const sampleTimestamp = Math.round(bounds.startTimestamp + (sampleHour * 3600));
      const isWithinDay = sampleTimestamp >= bounds.startTimestamp &&
        sampleTimestamp <= (bounds.startTimestamp + (dayLengthHours * 3600));
      const containingIndex = isWithinDay ? findContainingSegmentIndex(segments, sampleTimestamp) : -1;
      const nearestIndex = isWithinDay && containingIndex !== -1
        ? containingIndex
        : (isWithinDay ? findNearestSegmentIndex(segments, sampleTimestamp) : -1);
      const segment = nearestIndex !== -1 ? segments[nearestIndex] : null;

      return {
        key: `preview-${index}`,
        timestamp: sampleTimestamp,
        thumbUrl: segment
          ? `/api/recordings/thumbnail/${segment.id}/${getPreviewFrameIndex(segment, sampleTimestamp)}`
          : null,
        segmentId: segment?.id ?? null
      };
    });
  }, [endHour, segments, selectedDate, startHour, stripWidth]);

  const handleSampleClick = (sample) => {
    if (!sample || !sample.thumbUrl) {
      return;
    }

    const containingIndex = findContainingSegmentIndex(segments, sample.timestamp);
    const nextSegmentIndex = containingIndex !== -1
      ? containingIndex
      : findNearestSegmentIndex(segments, sample.timestamp);

    timelineState.setState({
      currentTime: sample.timestamp,
      currentSegmentIndex: nextSegmentIndex,
      prevCurrentTime: timelineState.currentTime,
      isPlaying: false
    });
  };

  if (!samples.length) {
    return null;
  }

  return (
    <div className="timeline-preview-strip border-b border-border/70 bg-gradient-to-b from-card/70 to-muted/60" data-testid="timeline-preview-strip">
      <div
        ref={stripRef}
        className="grid gap-1 px-2 py-2 sm:px-3"
        style={{ gridTemplateColumns: `repeat(${samples.length}, minmax(0, 1fr))` }}
      >
        {samples.map(sample => (
          <button
            key={sample.key}
            type="button"
            className="group relative aspect-video overflow-hidden rounded-[3px] border border-border/60 bg-slate-900 transition-all hover:border-primary/50 hover:shadow-sm disabled:cursor-default disabled:opacity-70"
            disabled={!sample.thumbUrl}
            title={sample.timestamp ? formatPreviewLabel(sample.timestamp) : 'Open recording'}
            aria-label={sample.timestamp ? `Open recording at ${formatPreviewLabel(sample.timestamp)}` : 'Open recording'}
            onClick={() => handleSampleClick(sample)}
          >
            {sample.thumbUrl ? (
              <TimelineThumbnailTile
                thumbUrl={sample.thumbUrl}
                alt="Timeline preview"
                priority={Priority.NORMAL}
                imgClassName="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-[9px] text-white/35">
                No preview
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          </button>
        ))}
      </div>
    </div>
  );
}
