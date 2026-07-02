/**
 * Shared utilities for drawing detection overlays on HTML canvas.
 */

export function drawDetectionBoxes({
  ctx,
  detections,
  drawWidth,
  drawHeight,
  offsetX = 0,
  offsetY = 0,
  boxStrokeStyle = 'rgba(255, 0, 0, 0.8)',
  boxLineWidth = 3,
  labelFont = '14px Arial',
  labelBackgroundStyle = 'rgba(255, 0, 0, 0.7)',
  labelHeight = 20,
  labelTextColor = 'white',
  labelTextOffsetX = 5,
  labelTextOffsetY = 5,
  labelPaddingX = 10
}) {
  if (!ctx || !detections || detections.length === 0) return;

  detections.forEach(detection => {
    const x = (detection.x * drawWidth) + offsetX;
    const y = (detection.y * drawHeight) + offsetY;
    const width = detection.width * drawWidth;
    const height = detection.height * drawHeight;

    const confidence = detection.confidence;
    const label = `${detection.label} (${Math.round(confidence * 100)}%)`;

    ctx.strokeStyle = boxStrokeStyle;
    ctx.lineWidth = boxLineWidth;
    ctx.strokeRect(x, y, width, height);

    ctx.font = labelFont;
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = labelBackgroundStyle;
    ctx.fillRect(x, y - labelHeight, textWidth + labelPaddingX, labelHeight);

    ctx.fillStyle = labelTextColor;
    ctx.fillText(label, x + labelTextOffsetX, y - labelTextOffsetY);
  });
}

export function setupDetectionCanvasLayout({
  videoElement,
  canvas
}) {
  if (!canvas || !videoElement) return null;

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
  const objectFit = typeof window !== 'undefined'
    ? window.getComputedStyle(videoElement).objectFit
    : 'contain';

  let drawWidth;
  let drawHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (objectFit === 'cover') {
    if (videoAspect > canvasAspect) {
      drawHeight = canvas.height;
      drawWidth = canvas.height * videoAspect;
      offsetX = (canvas.width - drawWidth) / 2;
    } else {
      drawWidth = canvas.width;
      drawHeight = canvas.width / videoAspect;
      offsetY = (canvas.height - drawHeight) / 2;
    }
  } else if (videoAspect > canvasAspect) {
    drawWidth = canvas.width;
    drawHeight = canvas.width / videoAspect;
    offsetY = (canvas.height - drawHeight) / 2;
  } else {
    drawHeight = canvas.height;
    drawWidth = canvas.height * videoAspect;
    offsetX = (canvas.width - drawWidth) / 2;
  }

  return {
    canvas,
    ctx,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY
  };
}
