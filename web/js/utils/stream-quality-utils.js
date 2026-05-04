export const STREAM_QUALITY = {
  HIGH: 'high',
  LOW: 'low',
};

export const LOW_QUALITY_STREAM_SUFFIX = '__low';

const STORAGE_PREFIX = 'oneberry-stream-quality:';

export function normalizeStreamQuality(quality, stream) {
  if (quality === STREAM_QUALITY.LOW && hasLowQualityStream(stream)) {
    return STREAM_QUALITY.LOW;
  }

  return STREAM_QUALITY.HIGH;
}

export function hasLowQualityStream(stream) {
  const secondaryUrl = stream?.secondary_url || stream?.secondaryUrl || '';
  return typeof secondaryUrl === 'string' && secondaryUrl.trim().length > 0;
}

export function getConfiguredStreamQuality(stream) {
  return normalizeStreamQuality(stream?.recording_quality || stream?.recordingQuality, stream);
}

export function getStoredStreamQuality(stream) {
  const configuredQuality = getConfiguredStreamQuality(stream);

  if (!stream?.name || !hasLowQualityStream(stream)) {
    return configuredQuality;
  }

  if (stream?.recording_quality || stream?.recordingQuality) {
    return configuredQuality;
  }

  try {
    const storedQuality = localStorage.getItem(`${STORAGE_PREFIX}${stream.name}`);
    return normalizeStreamQuality(storedQuality, stream);
  } catch {
    return configuredQuality;
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

  if (normalizeStreamQuality(quality, stream) === STREAM_QUALITY.LOW) {
    return `${stream.name}${LOW_QUALITY_STREAM_SUFFIX}`;
  }

  return stream.name;
}

export async function updateStreamRecordingQuality(stream, quality) {
  if (!stream?.name) {
    throw new Error('Stream name is required');
  }

  const normalizedQuality = normalizeStreamQuality(quality, stream);
  const response = await fetch(`/api/streams/${encodeURIComponent(stream.name)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recording_quality: normalizedQuality,
    }),
  });

  if (!response.ok) {
    let message = `Failed to update recording quality (${response.status})`;
    try {
      const payload = await response.json();
      message = payload?.error || payload?.message || message;
    } catch {
      // Ignore JSON parse failures for non-JSON errors.
    }
    throw new Error(message);
  }

  return normalizedQuality;
}
