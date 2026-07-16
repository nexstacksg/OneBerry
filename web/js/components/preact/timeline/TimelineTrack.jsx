import { getClippedSegmentHourRange } from './timelineUtils.js';
import { formatLocalTime } from '../../../utils/date-utils.js';

const CONTINUOUS_SEGMENT_GAP_SECONDS = 10;

function getMergedSegments(segments) {
  const sorted = [...(segments || [])]
    .map(segment => ({
      ...segment,
      start_timestamp: Number(segment.start_timestamp),
      end_timestamp: Number(segment.end_timestamp)
    }))
    .filter(segment =>
      Number.isFinite(segment.start_timestamp) &&
      Number.isFinite(segment.end_timestamp) &&
      segment.end_timestamp > segment.start_timestamp
    )
    .sort((a, b) => a.start_timestamp - b.start_timestamp);

  const merged = [];
  for (const segment of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && segment.start_timestamp - previous.end_timestamp <= CONTINUOUS_SEGMENT_GAP_SECONDS) {
      previous.end_timestamp = Math.max(previous.end_timestamp, segment.end_timestamp);
      previous.has_detection = Boolean(previous.has_detection || segment.has_detection);
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

function formatDurationLabel(seconds) {
  const duration = Math.round(seconds);
  if (duration >= 3600) {
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  }

  if (duration >= 60) {
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  }

  return `${duration}s`;
}

export function TimelineTrack({
  segments = [],
  selectedDate,
  startHour,
  endHour,
  compact = false,
  interactive = true,
  containerRef = null,
  children = null,
  className = '',
  ...eventHandlers
}) {
  const hourRange = Math.max(endHour - startHour, 0);
  const heightClass = compact ? 'h-6' : 'h-11';
  const pointerStyle = interactive ? 'auto' : 'none';

  const renderedSegments = hourRange > 0
    ? getMergedSegments(segments).map((segment, index) => {
      const visibleRange = getClippedSegmentHourRange(segment, selectedDate);
      if (!visibleRange) return null;

      const visibleStart = Math.max(visibleRange.startHour, startHour);
      const visibleEnd = Math.min(visibleRange.endHour, endHour);
      if (visibleEnd <= startHour || visibleStart >= endHour) return null;

      const leftPct = ((visibleStart - startHour) / hourRange) * 100;
      const widthPct = ((visibleEnd - visibleStart) / hourRange) * 100;
      const startLabel = formatLocalTime(segment.start_timestamp);
      const endLabel = formatLocalTime(segment.end_timestamp);
      const durationLabel = formatDurationLabel(segment.end_timestamp - segment.start_timestamp);

      return (
        <div
          key={`${segment.id || 'segment'}-${segment.start_timestamp}-${index}`}
          className="absolute top-1/2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(widthPct, 0.15)}%`,
            height: '8px',
            background: segment.has_detection
              ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.98) 0%, rgba(34, 197, 94, 0.95) 100%)'
              : 'linear-gradient(180deg, rgba(100, 220, 118, 0.95) 0%, rgba(58, 181, 74, 0.92) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'
          }}
          title={`${startLabel} - ${endLabel}  (${durationLabel})`}
        />
      );
    })
    : null;

  return (
    <div
      className={`timeline-segments relative w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#121417] via-[#0d0f12] to-[#07080a] shadow-inner ${heightClass} ${className}`}
      ref={containerRef}
      aria-label="Recording timeline"
      style={{ pointerEvents: pointerStyle }}
      {...eventHandlers}
    >
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3.125%)'
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-emerald-500/40 via-emerald-300/70 to-emerald-500/40" />
      {renderedSegments}
      {children}
    </div>
  );
}
