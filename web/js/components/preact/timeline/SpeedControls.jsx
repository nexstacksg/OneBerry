/**
 * LightNVR Speed Controls Component
 * Handles playback speed controls for the timeline
 */

import { useState, useEffect } from 'preact/hooks';
import { timelineState } from './TimelinePage.jsx';
import { showStatusMessage } from '../ToastContainer.jsx';
import { useI18n } from '../../../i18n.js';

/**
 * SpeedControls component
 * @returns {JSX.Element} SpeedControls component
 */
export function SpeedControls() {
  const { t } = useI18n();
  // Local state
  const [currentSpeed, setCurrentSpeed] = useState(1.0);

  // Available speeds
  const speeds = [0.25, 0.5, 1.0, 1.5, 2.0, 4.0];

  // Subscribe to timeline state changes
  useEffect(() => {
    const syncSpeedState = (state) => {
      setCurrentSpeed(state.playbackSpeed);
    };

    syncSpeedState(timelineState);
    const unsubscribe = timelineState.subscribe(syncSpeedState);
    return () => unsubscribe();
  }, []);

  // Set playback speed
  const setPlaybackSpeed = (speed) => {
    // Update video playback rate
    const videoPlayer = document.querySelector('#video-player video');
    if (videoPlayer) {
      // Set the new playback rate
      videoPlayer.playbackRate = speed;
    }

    // Update timeline state
    timelineState.setState({ playbackSpeed: speed });

    // Show status message
    showStatusMessage(t('timeline.playbackSpeed', { speed }), 'info');
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{t('timeline.speed')}</span>
      <div className="flex rounded-md border border-slate-200 bg-slate-100 p-0.5">
        {speeds.map(speed => (
          <button
            key={`speed-${speed}`}
            className={`h-7 rounded-[0.35rem] px-2.5 text-[11px] font-medium transition-colors focus:outline-none ${
              speed === currentSpeed
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
            data-speed={speed}
            data-keyboard-nav-preserve
            onClick={() => setPlaybackSpeed(speed)}
          >
            {speed}×
          </button>
        ))}
      </div>
    </div>
  );
}
