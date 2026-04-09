/**
 * Shared stream video option helpers.
 */

export const VIDEO_RESOLUTION_PRESETS = [
  { width: 3840, height: 2160 },
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1600, height: 1200 },
  { width: 1600, height: 900 },
  { width: 1280, height: 960 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 960, height: 540 },
  { width: 854, height: 480 },
  { width: 800, height: 600 },
  { width: 640, height: 480 },
  { width: 640, height: 360 },
  { width: 320, height: 240 }
];

export const VIDEO_FPS_PRESETS = [5, 10, 12, 15, 20, 24, 25, 30, 50, 60];

export function formatResolutionValue(width, height) {
  const parsedWidth = Number(width) || 0;
  const parsedHeight = Number(height) || 0;
  return parsedWidth > 0 && parsedHeight > 0 ? `${parsedWidth}x${parsedHeight}` : '';
}

export function formatResolutionLabel(width, height) {
  return `${width}x${height}`;
}

export function parseResolutionValue(value) {
  if (!value || typeof value !== 'string') {
    return { width: 0, height: 0 };
  }

  const [width, height] = value.split('x').map(Number);
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  };
}

export function formatFpsValue(fps) {
  const parsedFps = Number(fps) || 0;
  return parsedFps > 0 ? String(parsedFps) : '';
}

export function parseFpsValue(value) {
  const fps = Number(value);
  return Number.isFinite(fps) ? fps : 0;
}
