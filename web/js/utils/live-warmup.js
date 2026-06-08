const WARMUP_THROTTLE_MS = 15000;
const WARMUP_TIMEOUT_MS = 3000;
const SNAPSHOT_PRELOAD_THROTTLE_MS = 45000;
const SNAPSHOT_PRELOAD_DELAY_MS = 750;
const WARMUP_STORAGE_KEY = 'oneberry-live-warmup:last';
const SNAPSHOT_STORAGE_KEY = 'oneberry-live-snapshots:last';

let warmupInFlight = null;
let snapshotPreloadInFlight = false;

function now() {
  return Date.now();
}

function getStoredTimestamp(key) {
  try {
    const value = sessionStorage.getItem(key);
    const timestamp = value ? Number(value) : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}

function setStoredTimestamp(key, value) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; warmup still works for this page.
  }
}

function shouldThrottle(key, throttleMs) {
  const last = getStoredTimestamp(key);
  return last > 0 && now() - last < throttleMs;
}

function scheduleIdleTask(callback, timeout = SNAPSHOT_PRELOAD_DELAY_MS) {
  if (typeof window === 'undefined') {
    return;
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout });
    return;
  }

  window.setTimeout(callback, timeout);
}

export function buildGo2rtcSnapshotUrl(streamSource, cache = '30s') {
  if (!streamSource) {
    return '';
  }

  const params = new URLSearchParams({
    src: streamSource,
    cache,
  });

  return `/go2rtc/api/frame.jpeg?${params.toString()}`;
}

export function startLiveWarmup({ force = false } = {}) {
  if (warmupInFlight) {
    return warmupInFlight;
  }

  if (!force && shouldThrottle(WARMUP_STORAGE_KEY, WARMUP_THROTTLE_MS)) {
    return Promise.resolve(null);
  }

  setStoredTimestamp(WARMUP_STORAGE_KEY, now());
  const controller = typeof AbortController !== 'undefined'
    ? new AbortController()
    : null;
  const timeoutId = controller
    ? globalThis.setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS)
    : null;

  warmupInFlight = fetch('/api/streams?warmup=1', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: controller?.signal,
  })
    .catch((error) => {
      if (error?.name !== 'AbortError') {
        console.warn('Live camera warmup failed:', error);
      }
      return null;
    })
    .finally(() => {
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
      warmupInFlight = null;
    });

  return warmupInFlight;
}

export function preloadLiveSnapshots(streams, { limit = 8, force = false } = {}) {
  if (snapshotPreloadInFlight || !Array.isArray(streams) || streams.length === 0) {
    return;
  }

  if (!force && shouldThrottle(SNAPSHOT_STORAGE_KEY, SNAPSHOT_PRELOAD_THROTTLE_MS)) {
    return;
  }

  const candidates = streams
    .filter((stream) => (
      stream &&
      stream.name &&
      stream.enabled !== false &&
      stream.streaming_enabled !== false &&
      stream.privacy_mode !== true &&
      stream.is_deleted !== true
    ))
    .slice(0, limit);

  if (candidates.length === 0) {
    return;
  }

  setStoredTimestamp(SNAPSHOT_STORAGE_KEY, now());
  snapshotPreloadInFlight = true;

  scheduleIdleTask(() => {
    let index = 0;
    const loadNext = () => {
      if (index >= candidates.length) {
        snapshotPreloadInFlight = false;
        return;
      }

      const stream = candidates[index++];
      const img = new Image();
      img.decoding = 'async';
      img.onload = loadNext;
      img.onerror = loadNext;
      img.src = buildGo2rtcSnapshotUrl(stream.name);
    };

    loadNext();
  });
}
