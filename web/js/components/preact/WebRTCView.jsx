/**
 * LightNVR Web Interface WebRTCView Component
 * Preact component for the WebRTC view page
 */

import { LiveView } from './LiveView.jsx';

/**
 * WebRTCView component
 * @returns {JSX.Element} WebRTCView component
 */
export function WebRTCView() {
  return <LiveView mode="webrtc" />;
}
