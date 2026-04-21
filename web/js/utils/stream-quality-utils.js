export const STREAM_QUALITY = {
  HIGH: 'high',
  LOW: 'low',
};

export const LOW_QUALITY_STREAM_SUFFIX = '__low';

const STORAGE_PREFIX = 'oneberry-stream-quality:';

export function hasLowQualityStream(stream) {
  const secondaryUrl = stream?.secondary_url || stream?.secondaryUrl || '';
  return typeof secondaryUrl === 'string' && secondaryUrl.trim().length > 0;
}

export function getStoredStreamQuality(stream) {
  if (!stream?.name || !hasLowQualityStream(stream)) {
    return STREAM_QUALITY.HIGH;
  }

  try {
    const storedQuality = localStorage.getItem(`${STORAGE_PREFIX}${stream.name}`);
    return storedQuality === STREAM_QUALITY.LOW ? STREAM_QUALITY.LOW : STREAM_QUALITY.HIGH;
  } catch {
    return STREAM_QUALITY.HIGH;
  }
}

export function persistStreamQuality(streamName, quality) {
  if (!streamName) {
    return;
  }

  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${streamName}`,
      quality === STREAM_QUALITY.LOW ? STREAM_QUALITY.LOW : STREAM_QUALITY.HIGH
    );
  } catch {
    // Ignore storage failures; the selected quality still applies in memory.
  }
}

export function getStreamQualitySource(stream, quality) {
  if (!stream?.name) {
    return '';
  }

  if (quality === STREAM_QUALITY.LOW && hasLowQualityStream(stream)) {
    return `${stream.name}${LOW_QUALITY_STREAM_SUFFIX}`;
  }

  return stream.name;
}
