/**
 * LightNVR Timeline Ruler Component
 * Pure display — reads timelineStartHour / timelineEndHour from global state
 * and renders tick marks + labels.  All range calculations live in
 * TimelinePage (auto-fit on load) and TimelineControls (zoom in/out).
 */

import { useState, useEffect } from 'preact/hooks';
import { timelineState } from './TimelinePage.jsx';
import {
  formatTimelineWindowLabel,
  getLocalDayBounds,
  getTimelineDayLengthHours
} from './timelineUtils.js';

export function TimelineRuler() {
  const [startHour, setStartHour] = useState(timelineState.timelineStartHour ?? 0);
  const [endHour, setEndHour] = useState(timelineState.timelineEndHour ?? getTimelineDayLengthHours(timelineState.selectedDate));
  const [selectedDate, setSelectedDate] = useState(timelineState.selectedDate ?? null);

  useEffect(() => {
    const unsubscribe = timelineState.subscribe(state => {
      const s = state.timelineStartHour ?? 0;
      const e = state.timelineEndHour ?? getTimelineDayLengthHours(state.selectedDate);
      setStartHour(s);
      setEndHour(e);
      setSelectedDate(state.selectedDate ?? null);
    });
    return () => unsubscribe();
  }, []);

  // Generate hour markers and labels
  const generateHourMarkers = () => {
    const markers = [];
    const bounds = getLocalDayBounds(selectedDate);
    if (!bounds) {
      return markers;
    }

    const visibleRange = Math.max(endHour - startHour, 0.001);
    const visibleSeconds = visibleRange * 3600;
    const stepSeconds = visibleSeconds <= 30
      ? 1
      : visibleSeconds <= 120
        ? 5
        : visibleSeconds <= 600
          ? 15
          : visibleSeconds <= 1800
            ? 60
            : visibleSeconds <= 7200
              ? 300
              : visibleSeconds <= 21600
                ? 900
                : visibleSeconds <= 43200
                  ? 1800
                  : 3600;
    const labelEverySeconds = visibleSeconds <= 30
      ? 5
      : visibleSeconds <= 120
        ? 10
        : visibleSeconds <= 600
          ? 30
          : stepSeconds;

    const startTimestamp = Math.floor(bounds.startTimestamp + (startHour * 3600));
    const endTimestamp = Math.ceil(bounds.startTimestamp + (endHour * 3600));
    const firstTick = Math.ceil(startTimestamp / stepSeconds) * stepSeconds;
    const labelInterval = Math.max(Math.round(labelEverySeconds / stepSeconds), 1);

    for (let index = 0, timestamp = firstTick; timestamp <= endTimestamp + 0.001; index++, timestamp += stepSeconds) {
      const offsetHours = (timestamp - bounds.startTimestamp) / 3600;
      const position = ((offsetHours - startHour) / visibleRange) * 100;
      const isMajorTick = stepSeconds >= 60;
      const showLabel = index % labelInterval === 0;
      const labelOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      };
      if (stepSeconds < 60) {
        labelOptions.second = '2-digit';
      }
      const formattedTime = new Intl.DateTimeFormat(undefined, labelOptions)
        .format(new Date(timestamp * 1000));

      markers.push(
        <div
          key={`tick-${timestamp}`}
          className={`absolute top-0 w-px ${isMajorTick ? 'h-5 bg-foreground/90' : 'h-3 bg-muted-foreground/80'}`}
          style={{ left: `${position}%` }}
        />
      );

      if (showLabel) {
        markers.push(
          <div
            key={`label-${timestamp}`}
            className="absolute top-0 text-xs text-muted-foreground transform -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${position}%` }}
          >
            {formattedTime}
          </div>
        );
      }
    }

    return markers;
  };

  return (
    <div className="timeline-ruler relative w-full h-8 bg-muted border-b border-border">
      {generateHourMarkers()}
      <div className="absolute bottom-0 left-0 text-xs text-muted-foreground px-1">
        {formatTimelineWindowLabel(endHour - startHour)}
      </div>
    </div>
  );
}
