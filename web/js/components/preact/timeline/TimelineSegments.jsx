/**
 * LightNVR Timeline Segments Component
 * Displays recording segments on the timeline
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { timelineState } from './TimelinePage.jsx';
import {
  findContainingSegmentIndex,
  findNearestSegmentIndex,
  getPlayableSegmentTimestamp
} from './timelineUtils.js';
import { TimelineTrack } from './TimelineTrack.jsx';

/**
 * TimelineSegments component
 * @param {Object} props Component props
 * @param {Array} props.segments Array of timeline segments
 * @returns {JSX.Element} TimelineSegments component
 */
export function TimelineSegments({ segments: propSegments, interactive = true }) {
  // Local state
  const [segments, setSegments] = useState(propSegments || []);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(24);
  const currentSegmentIndexRef = useRef(-1);

  // Update segments when props change (including when cleared to empty on deletion)
  useEffect(() => {
    if (Array.isArray(propSegments)) {
      setSegments(propSegments);
    }
  }, [propSegments]);

  // Refs
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastSegmentsRef = useRef([]);

  // Subscribe to timeline state changes
  useEffect(() => {
    const unsubscribe = timelineState.subscribe(state => {
      // Update segments when they change
      if (state.timelineSegments) {
        const changed = state.forceReload
          || state.timelineSegments !== lastSegmentsRef.current;
        if (changed) {
          setSegments(state.timelineSegments);
          lastSegmentsRef.current = state.timelineSegments;
        }
      }

      setStartHour(state.timelineStartHour ?? 0);
      setEndHour(state.timelineEndHour ?? 24);
      currentSegmentIndexRef.current = state.currentSegmentIndex ?? -1;
    });

    // Hydrate from global state on mount
    if (timelineState.timelineSegments && timelineState.timelineSegments.length > 0) {
      setSegments(timelineState.timelineSegments);
      lastSegmentsRef.current = timelineState.timelineSegments;
      currentSegmentIndexRef.current = timelineState.currentSegmentIndex ?? -1;
      if (timelineState.timelineStartHour !== undefined) setStartHour(timelineState.timelineStartHour);
      if (timelineState.timelineEndHour !== undefined)   setEndHour(timelineState.timelineEndHour);
    }

    return () => unsubscribe();
  }, []);

  // Set up drag handling
  useEffect(() => {
    if (!interactive) {
      return undefined;
    }

    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e) => {
      // Handle clicks on the container, clickable area, or directly on segments
      const target = e.target;
      const isElementTarget = target instanceof Element;
      if (
        target === container ||
        (isElementTarget &&
          (target.classList.contains('timeline-clickable-area') ||
            target.classList.contains('timeline-segment')))
      ) {
        isDragging.current = true;
        handleTimelineClick(e);

        // Add event listeners for drag
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }
    };

    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      handleTimelineClick(e);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    container.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [endHour, interactive, segments, startHour]);

  // Handle click on timeline for seeking
  const handleTimelineClick = (event) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const clickPercent = (event.clientX - rect.left) / rect.width;
    const clickHour = startHour + clickPercent * (endHour - startHour);

    // Convert fractional hour → timestamp using the shared utility
    const clickTimestamp = timelineState.timelineHourToTimestamp(clickHour, timelineState.selectedDate);

    // Resolve the clicked time to an actual recording segment.  If the click lands
    // in a gap, fall back to the nearest recording so the player stays in recorded
    // playback instead of dropping into the live/no-segment state.
    const foundIndex = findContainingSegmentIndex(segments, clickTimestamp);
    const nextSegmentIndex = foundIndex !== -1
      ? foundIndex
      : findNearestSegmentIndex(segments, clickTimestamp);
    const nextSegment = nextSegmentIndex !== -1 ? segments[nextSegmentIndex] : null;
    const playableTimestamp = getPlayableSegmentTimestamp(nextSegment, clickTimestamp);

    // Move cursor to click position and update segment index in a single atomic setState so
    // that currentTime is never skipped by the "time-only update" batching logic.  When the
    // two updates were separate, the first one (currentTime only) was sometimes throttled
    // away within 250 ms of the previous notification, leaving the time display stale while
    // the segment index had already advanced to the newly-clicked segment.
    timelineState.setState({
      currentTime: playableTimestamp,
      prevCurrentTime: timelineState.currentTime,
      isPlaying: true,
      currentSegmentIndex: nextSegmentIndex,
      forceReload: true
    });
  };

  return (
    <TimelineTrack
      segments={segments}
      selectedDate={timelineState.selectedDate}
      startHour={startHour}
      endHour={endHour}
      interactive={interactive}
      containerRef={containerRef}
    />
  );
}
