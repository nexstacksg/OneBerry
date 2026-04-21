import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  STREAM_QUALITY,
  getStoredStreamQuality,
  getStreamQualitySource,
  hasLowQualityStream,
  persistStreamQuality,
} from '../../utils/stream-quality-utils.js';

export function useStreamQuality(stream) {
  const [streamQuality, setStreamQualityState] = useState(() => getStoredStreamQuality(stream));
  const hasLowQuality = hasLowQualityStream(stream);

  useEffect(() => {
    setStreamQualityState(getStoredStreamQuality(stream));
  }, [stream?.name, stream?.secondary_url, stream?.secondaryUrl]);

  const setStreamQuality = useCallback((quality) => {
    const normalizedQuality = quality === STREAM_QUALITY.LOW && hasLowQuality
      ? STREAM_QUALITY.LOW
      : STREAM_QUALITY.HIGH;

    setStreamQualityState(normalizedQuality);
    persistStreamQuality(stream?.name, normalizedQuality);
  }, [hasLowQuality, stream?.name]);

  const selectedStreamSource = useMemo(
    () => getStreamQualitySource(stream, streamQuality),
    [stream?.name, stream?.secondary_url, stream?.secondaryUrl, streamQuality]
  );

  return {
    hasLowQuality,
    selectedStreamSource,
    setStreamQuality,
    streamQuality,
  };
}
