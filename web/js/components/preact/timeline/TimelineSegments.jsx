/**
 * LightNVR Timeline Segments Component
 * Displays recording segments on the timeline
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { timelineState } from './TimelinePage.jsx';
import {
  findContainingSegmentIndex,
  findNearestSegmentIndex,
  getClippedSegmentHourRange,
  getPlayableSegmentTimestamp
} from './timelineUtils.js';
import { formatLocalTime } from '../../../utils/date-utils.js';

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

  // ── Merge adjacent segments (gap ≤ 1 s) and render ──
  const renderSegments = () => {
    if (!segments || segments.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/45">
          No segments to display
        </div>
      );
    }

    const hourRange = endHour - startHour;
    if (hourRange <= 0) return null;

    // Sort + merge adjacent segments
    const sorted = [...segments].sort((a, b) => a.start_timestamp - b.start_timestamp);
    const merged = [];
    let cur = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
      const seg = sorted[i];
      if (seg.start_timestamp - cur.end_timestamp <= 1) {
        // extend current merged segment
        cur.end_timestamp = Math.max(cur.end_timestamp, seg.end_timestamp);
        if (seg.has_detection) cur.has_detection = true;
      } else {
        merged.push(cur);
        cur = { ...seg };
      }
    }
    merged.push(cur);

    // Render each merged segment as a positioned bar
    const rendered = [];
    merged.forEach((seg, i) => {
      const visibleRange = getClippedSegmentHourRange(seg, timelineState.selectedDate);
      if (!visibleRange) return;

      const sh = visibleRange.startHour;
      const eh = visibleRange.endHour;

      // Clip to visible range
      if (eh <= startHour || sh >= endHour) return;
      const vStart = Math.max(sh, startHour);
      const vEnd   = Math.min(eh, endHour);

      const leftPct  = ((vStart - startHour) / hourRange) * 100;
      const widthPct = ((vEnd - vStart) / hourRange) * 100;

      // Tooltip
      const t0 = formatLocalTime(seg.start_timestamp);
      const t1 = formatLocalTime(seg.end_timestamp);
      const dur = Math.round(seg.end_timestamp - seg.start_timestamp);
      const durLabel = dur >= 3600
        ? `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`
        : dur >= 60
          ? `${Math.floor(dur / 60)}m ${dur % 60}s`
          : `${dur}s`;

      rendered.push(
        <div
          key={`seg-${i}`}
          className="absolute top-1/2 -translate-y-1/2 rounded-sm"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(widthPct, 0.15)}%`,   // min width so tiny segments stay visible
            height: '8px',
            background: seg.has_detection
              ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.98) 0%, rgba(34, 197, 94, 0.95) 100%)'
              : 'linear-gradient(180deg, rgba(100, 220, 118, 0.95) 0%, rgba(58, 181, 74, 0.92) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'
          }}
          title={`${t0} – ${t1}  (${durLabel})`}
        />
      );
    });

    return rendered;
  };

  return (
    <div
      className="timeline-segments relative h-11 w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#121417] via-[#0d0f12] to-[#07080a] shadow-inner"
      ref={containerRef}
      aria-label="Recording timeline"
      style={{ pointerEvents: interactive ? 'auto' : 'none' }}
    >
      <div
        className="absolute inset-0 opacity-45"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3.125%)'
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-emerald-500/40 via-emerald-300/70 to-emerald-500/40" />
      {renderSegments()}
    </div>
  );
}
