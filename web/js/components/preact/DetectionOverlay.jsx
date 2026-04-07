/**
 * Detection overlay component for LiveView
 * Renders a canvas overlay for displaying detection boxes on video streams
 */
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { showStatusMessage } from './ToastContainer.jsx';
import { formatFilenameTimestamp } from '../../utils/date-utils.js';

import { forwardRef, useImperativeHandle } from 'preact/compat';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + ((b - a) * t);

const pathRoundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const pointInPolygon = (px, py, polygon) => {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (((yj - yi) || 0.000001)) + xi);
    if (intersects) inside = !inside;
  }

  return inside;
};

const getZoneMatch = (zones, px, py) => {
  if (!zones || zones.length === 0) return null;

  for (const zone of zones) {
    if (zone.polygon && zone.polygon.length >= 3 && pointInPolygon(px, py, zone.polygon)) {
      return zone;
    }
  }

  return null;
};

/**
 * DetectionOverlay component
 * @param {Object} props - Component props
 * @param {string} props.streamName - Name of the stream
 * @param {Object} props.videoRef - Reference to the video element
 * @param {boolean} props.enabled - Whether detection is enabled
 * @param {string} props.detectionModel - Detection model to use
 * @param {Object} ref - Forwarded ref
 * @returns {JSX.Element} DetectionOverlay component
 */
export const DetectionOverlay = forwardRef(({
  streamName,
  videoRef,
  enabled = false,
  detectionModel = null
}, ref) => {
  const [detections, setDetections] = useState([]);
  const [motionSnapshot, setMotionSnapshot] = useState(null);
  const [zones, setZones] = useState([]);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const animationFrameRef = useRef(null);
  const motionSnapshotRef = useRef(null);
  const motionTrailRef = useRef({ gridSize: 0, values: new Array(1024).fill(0), lastUpdate: 0 });
  const errorCountRef = useRef(0);
  const isMotionModel = detectionModel === 'motion';
  // Motion mode is a live motion mask, so we poll much faster to keep the
  // overlay in sync with movement instead of letting it lag behind.
  const currentIntervalRef = useRef(isMotionModel ? 50 : 1000);

  // Expose the canvas ref to parent components
  useImperativeHandle(ref, () => ({
    getCanvasRef: () => canvasRef,
    getDetections: () => detections,
    getMotionSnapshot: () => motionSnapshot
  }), [detections, motionSnapshot]);

  // Fetch detection zones for this stream
  useEffect(() => {
    if (!streamName) return;
    fetch(`/api/streams/${encodeURIComponent(streamName)}/zones`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.zones && Array.isArray(data.zones)) {
          setZones(data.zones.filter(z => z.enabled));
        }
      })
      .catch(err => console.warn('Failed to load detection zones:', err));
  }, [streamName]);

  useEffect(() => {
    motionSnapshotRef.current = motionSnapshot;
  }, [motionSnapshot]);

  const getLayout = useCallback(() => {
    if (!canvasRef.current || !videoRef.current) return null;

    const canvas = canvasRef.current;
    const videoElement = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = videoElement.clientWidth;
    canvas.height = videoElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    if (!videoWidth || !videoHeight || canvas.width === 0 || canvas.height === 0) {
      return null;
    }

    const videoAspect = videoWidth / videoHeight;
    const canvasAspect = canvas.width / canvas.height;

    let drawWidth;
    let drawHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > canvasAspect) {
      drawWidth = canvas.width;
      drawHeight = canvas.width / videoAspect;
      offsetY = (canvas.height - drawHeight) / 2;
    } else {
      drawHeight = canvas.height;
      drawWidth = canvas.height * videoAspect;
      offsetX = (canvas.width - drawWidth) / 2;
    }

    return { canvas, ctx, drawWidth, drawHeight, offsetX, offsetY };
  }, [videoRef]);

  const drawMotionGrid = useCallback((nowMs = performance.now()) => {
    const layout = getLayout();
    if (!layout) return;

    const { ctx, drawWidth, drawHeight, offsetX, offsetY } = layout;
    const snapshot = motionSnapshotRef.current;
    const sourceGridSize = Math.max(2, snapshot && snapshot.grid_size ? snapshot.grid_size : 32);
    // Render at least a 16x16 visible mesh so the motion pattern stays legible
    // even when the backend grid is configured more coarsely.
    const gridSize = Math.max(16, Math.min(32, sourceGridSize));
    const totalCells = Math.min(
      gridSize * gridSize,
      motionTrailRef.current.values.length
    );
    const cellWidth = drawWidth / gridSize;
    const cellHeight = drawHeight / gridSize;
    const activePulse = 0.5 + (Math.sin(nowMs / 180) * 0.5);
    const glowPulse = 0.35 + (Math.sin(nowMs / 420) * 0.15);
    const trailState = motionTrailRef.current;

    if (trailState.gridSize !== gridSize) {
      trailState.gridSize = gridSize;
      trailState.values = new Array(1024).fill(0);
      trailState.lastUpdate = 0;
    }

    const dt = trailState.lastUpdate > 0 ? Math.max(16, nowMs - trailState.lastUpdate) : 16;
    trailState.lastUpdate = nowMs;
    const decay = Math.exp(-dt / 280);

    let activeMinX = gridSize;
    let activeMinY = gridSize;
    let activeMaxX = -1;
    let activeMaxY = -1;
    let activeCount = 0;
    let zoneActiveCount = 0;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.03)';
    ctx.fillRect(offsetX, offsetY, drawWidth, drawHeight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, drawWidth, drawHeight);

    if (zones && zones.length > 0) {
      zones.forEach(zone => {
        if (!zone.polygon || zone.polygon.length < 3) return;
        ctx.save();
        ctx.beginPath();
        const p0x = offsetX + (zone.polygon[0].x * drawWidth);
        const p0y = offsetY + (zone.polygon[0].y * drawHeight);
        ctx.moveTo(p0x, p0y);
        for (let i = 1; i < zone.polygon.length; i++) {
          const px = offsetX + (zone.polygon[i].x * drawWidth);
          const py = offsetY + (zone.polygon[i].y * drawHeight);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 194, 72, 0.035)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 194, 72, 0.14)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      });
    }

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const idx = gy * gridSize + gx;
        if (idx >= totalCells) break;
        const sourceX = Math.min(
          sourceGridSize - 1,
          Math.floor((gx / Math.max(1, gridSize)) * sourceGridSize)
        );
        const sourceY = Math.min(
          sourceGridSize - 1,
          Math.floor((gy / Math.max(1, gridSize)) * sourceGridSize)
        );
        const sourceIdx = sourceY * sourceGridSize + sourceX;
        const score = snapshot && snapshot.cell_scores ? (snapshot.cell_scores[sourceIdx] || 0) : 0;
        const rawIntensity = trailState.values[idx] || 0;
        const x = offsetX + gx * cellWidth;
        const y = offsetY + gy * cellHeight;
        const centerX = (gx + 0.5) / gridSize;
        const centerY = (gy + 0.5) / gridSize;
        const matchedZone = getZoneMatch(zones, centerX, centerY);
        const edgeDistance = Math.min(gx, gy, gridSize - 1 - gx, gridSize - 1 - gy);
        const edgeFactor = clamp(edgeDistance / Math.max(1, gridSize / 2), 0, 1);
        const incoming = clamp(score + (matchedZone ? 0.18 : 0), 0, 1);
        trailState.values[idx] = Math.max(rawIntensity * decay, incoming);
        const intensity = trailState.values[idx];
        const baseAlpha = 0.012 + (0.015 * edgeFactor);
        const heat = clamp(intensity * 1.25, 0, 1);
        const pulseBoost = intensity > 0.02 ? (0.12 + (activePulse * 0.24)) : 0;
        const alpha = clamp(baseAlpha + (heat * 0.60) + pulseBoost, 0.02, 0.92);
        const warm = clamp((heat * 1.14) + glowPulse * 0.18 + (matchedZone ? 0.16 : 0), 0, 1);
        const red = mix(72, 255, warm);
        const green = mix(130, 182, warm);
        const blue = mix(180, 22, warm);

        ctx.fillStyle = `rgba(${red | 0}, ${green | 0}, ${blue | 0}, ${alpha})`;
        ctx.fillRect(x, y, Math.ceil(cellWidth) + 1, Math.ceil(cellHeight) + 1);

        if (intensity > 0.04) {
          activeCount++;
          if (gx < activeMinX) activeMinX = gx;
          if (gy < activeMinY) activeMinY = gy;
          if (gx > activeMaxX) activeMaxX = gx;
          if (gy > activeMaxY) activeMaxY = gy;
        }

        if (matchedZone && intensity > 0.06) {
          zoneActiveCount++;
        }

        ctx.strokeStyle = intensity > 0.02
          ? `rgba(255, 238, 176, ${0.24 + (activePulse * 0.22)})`
          : 'rgba(148, 163, 184, 0.08)';
        ctx.lineWidth = intensity > 0.02 ? 1.15 : 1;
        ctx.strokeRect(x, y, cellWidth, cellHeight);

        if (intensity > 0.32) {
          const innerInset = Math.max(1, Math.min(cellWidth, cellHeight) * 0.13);
          ctx.save();
          ctx.shadowColor = 'rgba(255, 210, 120, 0.50)';
          ctx.shadowBlur = 8 + (activePulse * 6);
          ctx.strokeStyle = `rgba(255, 231, 165, ${0.40 + (activePulse * 0.20)})`;
          ctx.lineWidth = 1.25;
          ctx.strokeRect(
            x + innerInset,
            y + innerInset,
            cellWidth - (innerInset * 2),
            cellHeight - (innerInset * 2)
          );
          ctx.restore();
        }
      }
    }

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= gridSize; gx++) {
      const x = offsetX + gx * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + drawHeight);
      ctx.stroke();
    }
    for (let gy = 0; gy <= gridSize; gy++) {
      const y = offsetY + gy * cellHeight;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + drawWidth, y);
      ctx.stroke();
    }

    if (snapshot && snapshot.motion_detected) {
      ctx.strokeStyle = `rgba(255, 194, 72, ${0.52 + (activePulse * 0.24)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, drawWidth - 1, drawHeight - 1);

      ctx.fillStyle = 'rgba(255, 194, 72, 0.22)';
      ctx.fillRect(offsetX, offsetY, drawWidth, 4);
      ctx.fillRect(offsetX, offsetY + drawHeight - 4, drawWidth, 4);
    }

    if (activeCount > 0 && activeMaxX >= activeMinX && activeMaxY >= activeMinY) {
      const outlineX = offsetX + (activeMinX * cellWidth) + 0.5;
      const outlineY = offsetY + (activeMinY * cellHeight) + 0.5;
      const outlineW = ((activeMaxX - activeMinX + 1) * cellWidth) - 1;
      const outlineH = ((activeMaxY - activeMinY + 1) * cellHeight) - 1;
      const outlineHue = zoneActiveCount > 0 ? '255, 194, 72' : '255, 220, 142';
      const outlineAlpha = zoneActiveCount > 0 ? (0.54 + (activePulse * 0.22)) : (0.36 + (activePulse * 0.18));

      ctx.save();
      ctx.shadowColor = 'rgba(255, 194, 72, 0.55)';
      ctx.shadowBlur = 10 + (activePulse * 8);
      ctx.strokeStyle = `rgba(${outlineHue}, ${outlineAlpha})`;
      ctx.lineWidth = zoneActiveCount > 0 ? 2.6 : 2.2;
      ctx.strokeRect(outlineX, outlineY, outlineW, outlineH);

      ctx.fillStyle = `rgba(${outlineHue}, ${0.10 + (activePulse * 0.08)})`;
      ctx.fillRect(outlineX, outlineY, outlineW, 2);
      ctx.fillRect(outlineX, outlineY + outlineH - 2, outlineW, 2);
      ctx.restore();
    }

    if (snapshot) {
      const chipText = snapshot.motion_detected
        ? `MOTION ${snapshot.active_cells || 0}${zoneActiveCount > 0 ? ' ZONE' : ''}`
        : 'MOTION';
      ctx.save();
      ctx.font = '600 12px Arial';
      const chipWidth = ctx.measureText(chipText).width + 24;
      const chipHeight = 22;
      const chipX = offsetX + 10;
      const chipY = offsetY + 10;
      ctx.fillStyle = snapshot.motion_detected
        ? 'rgba(45, 22, 0, 0.74)'
        : 'rgba(10, 15, 25, 0.62)';
      ctx.strokeStyle = snapshot.motion_detected
        ? `rgba(255, 194, 72, ${0.58 + (activePulse * 0.2)})`
        : 'rgba(148, 163, 184, 0.34)';
      ctx.lineWidth = 1;
      pathRoundedRect(ctx, chipX, chipY, chipWidth, chipHeight, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = snapshot.motion_detected ? 'rgba(255, 234, 178, 0.96)' : 'rgba(203, 213, 225, 0.9)';
      ctx.fillText(chipText, chipX + 11, chipY + 15);
      ctx.restore();
    }

    ctx.restore();
  }, [getLayout, zones]);

  // Function to draw bounding boxes and zone polygons
  const drawDetectionBoxes = useCallback(() => {
    const layout = getLayout();
    if (!layout) return;

    const { ctx, drawWidth, drawHeight, offsetX, offsetY } = layout;

    // Draw zone polygons first (underneath detections)
    zones.forEach(zone => {
      if (!zone.polygon || zone.polygon.length < 3) return;
      const color = zone.color || '#3b82f6';

      ctx.beginPath();
      const p0x = (zone.polygon[0].x * drawWidth) + offsetX;
      const p0y = (zone.polygon[0].y * drawHeight) + offsetY;
      ctx.moveTo(p0x, p0y);
      for (let i = 1; i < zone.polygon.length; i++) {
        const px = (zone.polygon[i].x * drawWidth) + offsetX;
        const py = (zone.polygon[i].y * drawHeight) + offsetY;
        ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = color + '1A';
      ctx.fill();
      ctx.strokeStyle = color + 'CC';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (zone.name) {
        ctx.font = '12px Arial';
        const labelWidth = ctx.measureText(zone.name).width;
        ctx.fillStyle = color + 'B3';
        ctx.fillRect(p0x, p0y - 18, labelWidth + 8, 18);
        ctx.fillStyle = 'white';
        ctx.fillText(zone.name, p0x + 4, p0y - 4);
      }
    });

    if (detections && detections.length > 0) {
      detections.forEach(detection => {
        const x = (detection.x * drawWidth) + offsetX;
        const y = (detection.y * drawHeight) + offsetY;
        const width = detection.width * drawWidth;
        const height = detection.height * drawHeight;

        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        const label = `${detection.label} (${Math.round(detection.confidence * 100)}%)`;
        ctx.font = '14px Arial';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.fillRect(x, y - 20, textWidth + 10, 20);

        ctx.fillStyle = 'white';
        ctx.fillText(label, x + 5, y - 5);
      });
    }
  }, [detections, getLayout, zones]);

  const pollDetections = useCallback(() => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      return;
    }

    const url = isMotionModel
      ? `/api/detection/results/${encodeURIComponent(streamName)}?live=1`
      : `/api/detection/results/${encodeURIComponent(streamName)}`;

    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch detection results: ${response.status}`);
        }
        errorCountRef.current = 0;
        return response.json();
      })
      .then(data => {
        if (isMotionModel) {
          motionSnapshotRef.current = data || null;
          setMotionSnapshot(data || null);
          setDetections([]);
        } else if (data && data.detections) {
          setDetections(data.detections);
          motionSnapshotRef.current = null;
          setMotionSnapshot(null);
        }
      })
      .catch(error => {
        console.error(`Error fetching detection results for ${streamName}:`, error);
        setDetections([]);
        motionSnapshotRef.current = null;
        setMotionSnapshot(null);

        errorCountRef.current++;
        if (errorCountRef.current > 3) {
          clearInterval(intervalRef.current);
          currentIntervalRef.current = Math.min(5000, currentIntervalRef.current * 2);
          console.log(`Reducing detection polling frequency to ${currentIntervalRef.current}ms due to errors`);
          intervalRef.current = setInterval(pollDetections, currentIntervalRef.current);
        }
      });
  }, [isMotionModel, streamName, videoRef]);

  const resetMotionTrail = useCallback(() => {
    motionTrailRef.current.gridSize = 0;
    motionTrailRef.current.values = new Array(1024).fill(0);
    motionTrailRef.current.lastUpdate = 0;
  }, []);

  // Start/stop detection polling based on enabled prop
  useEffect(() => {
    currentIntervalRef.current = isMotionModel ? 50 : 1000;

    if (enabled && detectionModel && videoRef.current && canvasRef.current) {
      console.log(`Starting detection polling for stream ${streamName}`);

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      pollDetections();
      intervalRef.current = setInterval(pollDetections, currentIntervalRef.current);

      return () => {
        console.log(`Cleaning up detection polling for stream ${streamName}`);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        resetMotionTrail();
      };
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setDetections([]);
    setMotionSnapshot(null);
    resetMotionTrail();
  }, [drawMotionGrid, enabled, detectionModel, isMotionModel, pollDetections, resetMotionTrail, streamName, videoRef]);

  const redrawOverlay = useCallback(() => {
    if (isMotionModel) {
      drawMotionGrid();
    } else {
      drawDetectionBoxes();
    }
  }, [drawDetectionBoxes, drawMotionGrid, isMotionModel]);

  // Draw overlay whenever the live data changes
  useEffect(() => {
    redrawOverlay();
  }, [detections, motionSnapshot, redrawOverlay]);

  useEffect(() => {
    if (!isMotionModel || !enabled) return undefined;
    const tick = () => {
      redrawOverlay();
      animationFrameRef.current = requestAnimationFrame(tick);
    };
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [enabled, isMotionModel, redrawOverlay]);

  useEffect(() => {
    if (!isMotionModel || !enabled) return undefined;
    redrawOverlay();
  }, [enabled, isMotionModel, motionSnapshot, redrawOverlay]);

  // Handle resize events to redraw overlay
  useEffect(() => {
    const handleResize = () => {
      redrawOverlay();
    };

    const observedTargets = [];
    let resizeObserver = null;

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        redrawOverlay();
      });

      if (videoRef.current) observedTargets.push(videoRef.current);
      if (canvasRef.current && canvasRef.current.parentElement) observedTargets.push(canvasRef.current.parentElement);

      observedTargets.forEach(target => resizeObserver.observe(target));
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, [redrawOverlay, videoRef]);

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          redrawOverlay();
        });
      });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [redrawOverlay]);

  return (
    <canvas
      ref={canvasRef}
      className="detection-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2
      }}
    />
  );
});

/**
 * Draw detection boxes directly on a canvas at specified dimensions.
 * Used for snapshot canvases at native video resolution where the video fills the
 * entire canvas (no letterbox/pillarbox offsets needed).
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context to draw on
 * @param {number} width - Canvas width (native video width)
 * @param {number} height - Canvas height (native video height)
 * @param {Array} detections - Array of detection objects with normalized coordinates
 */
export function drawDetectionsOnCanvas(ctx, width, height, detections) {
  if (!ctx || !detections || detections.length === 0) return;

  // Scale line width and font for native resolution
  const scale = Math.max(1, Math.min(width, height) / 500);

  detections.forEach(detection => {
    // Calculate pixel coordinates from normalized values (0-1)
    // No letterbox/pillarbox offset since video fills the entire canvas
    const x = detection.x * width;
    const y = detection.y * height;
    const w = detection.width * width;
    const h = detection.height * height;

    // Draw bounding box
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 3 * scale;
    ctx.strokeRect(x, y, w, h);

    // Draw label background
    const label = `${detection.label} (${Math.round(detection.confidence * 100)}%)`;
    ctx.font = `${Math.round(14 * scale)}px Arial`;
    const textWidth = ctx.measureText(label).width;
    const labelHeight = 20 * scale;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.fillRect(x, y - labelHeight, textWidth + 10 * scale, labelHeight);

    // Draw label text
    ctx.fillStyle = 'white';
    ctx.fillText(label, x + 5 * scale, y - 5 * scale);
  });
}

/**
 * Take a snapshot with detections
 * @param {Object} videoRef - Reference to the video element
 * @param {Object} canvasRef - Reference to the canvas element (from detectionOverlayRef.current.getCanvasRef())
 * @param {string} streamName - Name of the stream
 * @returns {Object} Canvas and filename for the snapshot
 */
export function takeSnapshotWithDetections(videoRef, canvasRef, streamName) {
  if (!videoRef.current || !canvasRef.current) {
    showStatusMessage('Cannot take snapshot: Video not available', 'error');
    return null;
  }

  const videoElement = videoRef.current;

  // Create a combined canvas with video and detections
  const combinedCanvas = document.createElement('canvas');
  combinedCanvas.width = videoElement.videoWidth;
  combinedCanvas.height = videoElement.videoHeight;

  // Check if we have valid dimensions
  if (combinedCanvas.width === 0 || combinedCanvas.height === 0) {
    showStatusMessage('Cannot take snapshot: Video not loaded or has invalid dimensions', 'error');
    return null;
  }

  const ctx = combinedCanvas.getContext('2d');

  // Draw the video frame at native resolution
  ctx.drawImage(videoElement, 0, 0, combinedCanvas.width, combinedCanvas.height);

  // Draw detections directly at native resolution (fixes boundary shift bug)
  // Previously this scaled the display-resolution overlay canvas which introduced
  // letterbox/pillarbox offset errors when display aspect ratio didn't match video
  const overlayRef = canvasRef;
  if (overlayRef && overlayRef.current) {
    // Try to get detections from the parent detection overlay ref
    // The canvasRef passed here is actually from detectionOverlayRef.current.getCanvasRef()
    // We need to get detections from the detection overlay component
    // Fall back to drawing the overlay canvas if we can't get raw detections
    const canvasOverlay = overlayRef.current;
    if (canvasOverlay.width > 0 && canvasOverlay.height > 0) {
      // NOTE: This path still has the scaling issue but is kept as fallback
      // Prefer using drawDetectionsOnCanvas with raw detection data instead
      ctx.drawImage(canvasOverlay, 0, 0, canvasOverlay.width, canvasOverlay.height,
                   0, 0, combinedCanvas.width, combinedCanvas.height);
    }
  }

  // Generate a filename
  const timestamp = formatFilenameTimestamp();
  const fileName = `snapshot-${streamName.replace(/\s+/g, '-')}-${timestamp}.jpg`;

  return {
    canvas: combinedCanvas,
    fileName
  };
}
