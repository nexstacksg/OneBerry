/**
 * LightNVR Timeline Controls Component
 * Handles play/pause and zoom controls for the timeline
 */

import { useState, useEffect } from 'preact/hooks';
import { timelineState } from './TimelinePage.jsx';
import { showStatusMessage } from '../ToastContainer.jsx';
import { TagIcon, TagsOverlay } from '../recordings/TagsOverlay.jsx';
import {
  findContainingSegmentIndex,
  findNearestSegmentIndex,
  formatPlaybackTimeLabel,
  getPlayableSegmentTimestamp,
  getTimelineDayLengthHours,
  getTimelineRangeHours,
  MIN_TIMELINE_VIEW_HOURS,
  resolveActiveSegmentIndex,
  resolvePlaybackStreamName,
  scaleTimelineWindowHours
} from './timelineUtils.js';
import { useI18n } from '../../../i18n.js';

/**
 * TimelineControls component
 * @returns {JSX.Element} TimelineControls component
 */
export function TimelineControls() {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(false);
  const [canZoomIn, setCanZoomIn] = useState(true);
  const [canZoomOut, setCanZoomOut] = useState(true);
  const [timeDisplayText, setTimeDisplayText] = useState('00:00:00');
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [segmentCount, setSegmentCount] = useState(0);
  const [currentRecordingId, setCurrentRecordingId] = useState(null);
  const [isProtected, setIsProtected] = useState(false);
  const [recordingTags, setRecordingTags] = useState([]);
  const [showTagsOverlay, setShowTagsOverlay] = useState(false);

  useEffect(() => {
    const syncControlsState = (state) => {
      setIsPlaying(state.isPlaying);
      setSegmentCount(state.timelineSegments?.length || 0);
      setActiveSegmentIndex(resolveActiveSegmentIndex(
        state.timelineSegments,
        state.currentSegmentIndex,
        state.currentTime
      ));
      setCurrentRecordingId(state.currentRecordingId ?? null);
      setIsProtected(!!state.currentRecordingProtected);
      setRecordingTags(Array.isArray(state.currentRecordingTags) ? state.currentRecordingTags : []);
      const dayLengthHours = getTimelineDayLengthHours(state.selectedDate);
      const range = state.timelineWindowHours ?? getTimelineRangeHours(
        state.timelineStartHour ?? 0,
        state.timelineEndHour ?? dayLengthHours
      );
      setCanZoomIn(range > MIN_TIMELINE_VIEW_HOURS);
      setCanZoomOut(range < dayLengthHours);

      const streamName = resolvePlaybackStreamName(
        state.timelineSegments,
        state.currentSegmentIndex,
        state.currentTime
      );
      const nextTimeDisplayText = formatPlaybackTimeLabel(state.currentTime, streamName);
      setTimeDisplayText(nextTimeDisplayText || '00:00:00');
    };

    syncControlsState(timelineState);

    const unsubscribe = timelineState.subscribe(syncControlsState);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setShowTagsOverlay(false);
  }, [currentRecordingId]);

  // Toggle playback (play/pause)
  const togglePlayback = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  };

  // Pause playback
  const pausePlayback = () => {
    timelineState.setState({ isPlaying: false });
    const videoPlayer = document.querySelector('#video-player video');
    if (videoPlayer) {
      videoPlayer.pause();
    }
  };

  // Resume playback — finds the right segment for the current cursor position and
  // updates state.  TimelinePlayer.handleVideoPlayback detects the change and drives
  // the actual video loading / seeking / play() call, so there is no need to touch
  // the video element here (which previously caused race conditions and a
  // play→pause→play loop via the checkPlayback polling).
  const resumePlayback = () => {
    if (!timelineState.timelineSegments || timelineState.timelineSegments.length === 0) {
      showStatusMessage(t('timeline.noRecordingsToPlay'), 'warning');
      return;
    }

    let segmentIndex = -1;
    let segmentToPlay = null;
    let relativeTime = 0;

    if (timelineState.currentTime !== null) {
      const containingIndex = findContainingSegmentIndex(
        timelineState.timelineSegments,
        timelineState.currentTime
      );
      if (containingIndex !== -1) {
        segmentIndex = containingIndex;
        segmentToPlay = timelineState.timelineSegments[containingIndex];
      } else {
        const closestIndex = findNearestSegmentIndex(
          timelineState.timelineSegments,
          timelineState.currentTime
        );
        segmentIndex = closestIndex;
        segmentToPlay = timelineState.timelineSegments[closestIndex];
      }
      if (!segmentToPlay) {
        showStatusMessage(t('timeline.noActiveRecordingSelected'), 'warning');
        return;
      }
      const playableTimestamp = getPlayableSegmentTimestamp(segmentToPlay, timelineState.currentTime);
      relativeTime = playableTimestamp - segmentToPlay.start_timestamp;
    } else if (
      timelineState.currentSegmentIndex >= 0 &&
      timelineState.currentSegmentIndex < timelineState.timelineSegments.length
    ) {
      segmentIndex = timelineState.currentSegmentIndex;
      segmentToPlay = timelineState.timelineSegments[segmentIndex];
      relativeTime = 0;
    } else {
      segmentIndex = 0;
      segmentToPlay = timelineState.timelineSegments[0];
      relativeTime = 0;
    }

    timelineState.setState({
      isPlaying: true,
      currentSegmentIndex: segmentIndex,
      currentTime: segmentToPlay.start_timestamp + relativeTime,
      prevCurrentTime: timelineState.currentTime,
      forceReload: true,
    });
  };

  // Zoom in — halve the visible window while keeping the right edge anchored.
  const zoomIn = () => {
    const dayLengthHours = getTimelineDayLengthHours(timelineState.selectedDate);
    const range = timelineState.timelineWindowHours ?? getTimelineRangeHours(
      timelineState.timelineStartHour ?? 0,
      timelineState.timelineEndHour ?? dayLengthHours
    );
    if (range <= MIN_TIMELINE_VIEW_HOURS) return;
    const nextRange = scaleTimelineWindowHours(range, 0.5, dayLengthHours, MIN_TIMELINE_VIEW_HOURS);
    timelineState.setState({ timelineWindowHours: nextRange });
  };

  // Zoom out — double the visible window while keeping the right edge anchored.
  const zoomOut = () => {
    const dayLengthHours = getTimelineDayLengthHours(timelineState.selectedDate);
    const range = timelineState.timelineWindowHours ?? getTimelineRangeHours(
      timelineState.timelineStartHour ?? 0,
      timelineState.timelineEndHour ?? dayLengthHours
    );
    if (range >= dayLengthHours) return;
    const nextRange = scaleTimelineWindowHours(range, 2, dayLengthHours, MIN_TIMELINE_VIEW_HOURS);
    timelineState.setState({ timelineWindowHours: nextRange });
  };

  // Fit — reset to the auto-fit range computed on data load
  const fitToSegments = () => {
    const fs = timelineState.autoFitStartHour ?? 0;
    const fe = timelineState.autoFitEndHour ?? getTimelineDayLengthHours(timelineState.selectedDate);
    timelineState.setState({
      timelineWindowHours: Math.max(fe - fs, MIN_TIMELINE_VIEW_HOURS)
    });
  };

  const jumpToAdjacentSegment = (direction) => {
    const segments = timelineState.timelineSegments;
    if (!Array.isArray(segments) || segments.length === 0) {
      showStatusMessage(t('timeline.noRecordingsToNavigate'), 'warning');
      return;
    }

    const currentIndex = resolveActiveSegmentIndex(
      timelineState.timelineSegments,
      timelineState.currentSegmentIndex,
      timelineState.currentTime
    );
    if (currentIndex === -1) {
      showStatusMessage(t('timeline.noActiveRecordingSelected'), 'warning');
      return;
    }

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= segments.length) {
      return;
    }

    const targetSegment = segments[targetIndex];
    timelineState.setState({
      currentSegmentIndex: targetIndex,
      currentTime: targetSegment.start_timestamp,
      prevCurrentTime: timelineState.currentTime,
      isPlaying: timelineState.isPlaying,
      forceReload: true
    });
  };

  const canJumpBackward = activeSegmentIndex > 0;
  const canJumpForward = activeSegmentIndex !== -1 && activeSegmentIndex < segmentCount - 1;

  const handleToggleProtection = async () => {
    if (!currentRecordingId) return;

    const newState = !isProtected;
    try {
      const response = await fetch(`/api/recordings/${currentRecordingId}/protect`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protected: newState }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${newState ? 'protect' : 'unprotect'} recording`);
      }

      timelineState.setState({ currentRecordingProtected: newState });
      showStatusMessage(
        newState ? t('recordings.recordingProtected') : t('recordings.recordingProtectionRemoved'),
        'success'
      );
    } catch (error) {
      console.error('Error toggling protection:', error);
      showStatusMessage(t('recordings.errorMessage', { message: error.message }), 'error');
    }
  };

  const handleTagsChanged = (_id, newTags) => {
    timelineState.setState({ currentRecordingTags: newTags });
  };

  return (
    <div className="overflow-hidden rounded-none border-x border-b border-white/10 bg-[#070a12] shadow-[0_18px_55px_rgba(15,23,42,0.24)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-black/25 p-1">
            <button
              type="button"
              id="zoom-out-button"
              data-keyboard-nav-preserve
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/25 text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={zoomOut}
              title={t('timeline.zoomOut')}
              disabled={!canZoomOut}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              id="zoom-in-button"
              data-keyboard-nav-preserve
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/25 text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={zoomIn}
              title={t('timeline.zoomIn')}
              disabled={!canZoomIn}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              data-keyboard-nav-preserve
              className="inline-flex h-7 items-center rounded-md border border-white/10 bg-white/5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              onClick={fitToSegments}
              title={t('timeline.fitToRecordings')}
            >
              {t('timeline.fit')}
            </button>
          </div>

          <div className="min-w-0">
            <div
              id="time-display"
              data-keyboard-nav-preserve
              className="font-mono text-[12px] font-semibold tabular-nums tracking-[0.12em] text-sky-200 sm:text-[13px]"
            >
              {timeDisplayText}
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/30">
              {t('timeline.playFromCursor')}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <div className="hidden min-[700px]:flex items-center gap-1 rounded-md border border-white/10 bg-black/25 p-1">
            <button
              type="button"
              data-keyboard-nav-preserve
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/25 text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => jumpToAdjacentSegment(-1)}
              title={t('timeline.previousRecording')}
              aria-label={t('timeline.previousRecording')}
              disabled={!canJumpBackward}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 12 20 5v14l-9-7Zm-1 0 9-7v14l-9-7ZM4 5h2v14H4z" />
              </svg>
            </button>
            <button
              type="button"
              id="play-button"
              data-keyboard-nav-preserve
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                isPlaying
                  ? 'border-white/20 bg-white/15 text-white'
                  : 'border-white/10 bg-black/25 text-white/75 hover:bg-white/10 hover:text-white'
              }`}
              onClick={togglePlayback}
              title={isPlaying ? t('timeline.pause') : t('timeline.playFromCurrentPosition')}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.1v13.8l11-6.9-11-6.9Z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              data-keyboard-nav-preserve
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/25 text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => jumpToAdjacentSegment(1)}
              title={t('timeline.nextRecording')}
              aria-label={t('timeline.nextRecording')}
              disabled={!canJumpForward}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 12 4 5v14l9-7Zm1 0-9-7v14l9-7ZM20 5h-2v14h2z" />
              </svg>
            </button>
          </div>

          {currentRecordingId && (
            <button
              type="button"
              data-keyboard-nav-preserve
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                isProtected
                  ? 'border-amber-300/30 bg-amber-500/90 text-black'
                  : 'border-white/10 bg-black/25 text-white/75 hover:bg-white/10 hover:text-white'
              }`}
              onClick={handleToggleProtection}
              title={isProtected ? t('recordings.unprotect') : t('recordings.protect')}
              aria-label={isProtected ? t('recordings.unprotect') : t('recordings.protect')}
              aria-pressed={isProtected}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3l7 4v5c0 4.3-2.9 8.2-7 9-4.1-.8-7-4.7-7-9V7l7-4z" />
              </svg>
            </button>
          )}

          {currentRecordingId && (
            <div className="relative inline-block">
              <button
                type="button"
                data-keyboard-nav-preserve
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/25 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                onClick={() => setShowTagsOverlay(!showTagsOverlay)}
                title={t('recordings.manageTags')}
                aria-label={recordingTags.length > 0 ? t('timeline.manageRecordingTagsCount', { count: recordingTags.length }) : t('recordings.manageTags')}
              >
                <TagIcon className="h-3.5 w-3.5" />
                {recordingTags.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-sky-300 px-0.5 text-[9px] leading-[14px] text-black text-center">
                    {recordingTags.length}
                  </span>
                )}
              </button>
              {showTagsOverlay && (
                <TagsOverlay
                  recording={{ id: currentRecordingId, tags: recordingTags }}
                  onClose={() => setShowTagsOverlay(false)}
                  onTagsChanged={handleTagsChanged}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
