/**
 * Detection overlay functionality for LiveView using preact-query
 */

import { useQuery } from '../../query-client.js';
import { drawDetectionBoxes, setupDetectionCanvasLayout } from './detection-overlay-utils.js';

/**
 * Custom hook to fetch detection results
 * @param {string} streamName - Name of the stream
 * @param {boolean} enabled - Whether to enable the query
 * @param {number} pollingInterval - Polling interval in milliseconds
 * @returns {Object} Query result
 */
export function useDetectionResults(streamName, enabled = true, pollingInterval = 1000) {
  return useQuery(
    ['detection-results', streamName],
    `/api/detection/results/${encodeURIComponent(streamName)}`,
    {
      timeout: 5000, // 5 second timeout
      retries: 1,     // Retry once
      retryDelay: 1000 // 1 second between retries
    },
    {
      enabled: !!streamName && enabled,
      refetchInterval: pollingInterval,
      refetchIntervalInBackground: false,
      onError: (error) => {
        console.error(`Error fetching detection results for ${streamName}:`, error);
      }
    }
  );
}

/**
 * Draw detections on canvas overlay
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {HTMLVideoElement} videoElement - Video element
 * @param {Array} detections - Array of detection objects
 */
export function drawDetections(canvas, videoElement, detections) {
  if (!canvas || !videoElement || !detections || !detections.length) return;

  const layout = setupDetectionCanvasLayout({
    canvas,
    videoElement
  });

  if (!layout) {
    console.log('Video dimensions not available yet, skipping detection drawing');
    return;
  }

  const {
    ctx: layoutCtx,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY
  } = layout;

  drawDetectionBoxes({
    ctx: layoutCtx,
    detections,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY
  });
}

/**
 * DetectionOverlay component
 * @param {Object} props Component props
 * @param {string} props.streamName Stream name
 * @param {HTMLVideoElement} props.videoElement Video element
 * @param {HTMLCanvasElement} props.canvasOverlay Canvas element
 */
export function DetectionOverlay({ streamName, videoElement, canvasOverlay }) {
  // Use the detection results hook
  const {
    data: detectionData,
    error
  } = useDetectionResults(streamName, true, 1000);
  
  // Draw detections when data is received
  if (detectionData && detectionData.detections && videoElement && canvasOverlay) {
    drawDetections(canvasOverlay, videoElement, detectionData.detections);
  }
  
  // Clear canvas on error
  if (error && canvasOverlay) {
    const ctx = canvasOverlay.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
    }
  }
  
  return null; // This is a non-rendering component
}
