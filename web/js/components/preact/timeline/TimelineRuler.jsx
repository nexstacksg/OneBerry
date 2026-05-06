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
    const syncRulerState = (state) => {
      const s = state.timelineStartHour ?? 0;
      const e = state.timelineEndHour ?? getTimelineDayLengthHours(state.selectedDate);
      setStartHour(s);
      setEndHour(e);
      setSelectedDate(state.selectedDate ?? null);
    };

    syncRulerState(timelineState);
    const unsubscribe = timelineState.subscribe(syncRulerState);
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
          className={`absolute top-0 w-px ${isMajorTick ? 'h-[12px] bg-white/35' : 'h-[8px] bg-white/20'}`}
          style={{ left: `${position}%` }}
        />
      );

      if (showLabel) {
        markers.push(
          <div
            key={`label-${timestamp}`}
            className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${isMajorTick ? 'text-[10px] text-white/70' : 'text-[9px] text-white/45'}`}
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
    <div className="timeline-ruler relative w-full h-7 border-b border-white/10 bg-black/40 px-2 sm:px-3">
      {generateHourMarkers()}
      <div className="absolute bottom-0 left-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
        {formatTimelineWindowLabel(endHour - startHour)}
      </div>
    </div>
  );
}
