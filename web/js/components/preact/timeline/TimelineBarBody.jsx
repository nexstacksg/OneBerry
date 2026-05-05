import { useMemo } from 'preact/hooks';
import { getLocalDayBounds } from './timelineUtils.js';

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
  onWheel,
  renderTrackContent,
  footerContent = null
}) {
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
