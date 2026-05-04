import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  STREAM_QUALITY,
  getStoredStreamQuality,
  getStreamQualitySource,
  hasLowQualityStream,
  normalizeStreamQuality,
  persistStreamQuality,
} from '../../utils/stream-quality-utils.js';

export function useStreamQuality(stream) {
  const [streamQuality, setStreamQualityState] = useState(() => getStoredStreamQuality(stream));
  const hasLowQuality = hasLowQualityStream(stream);

  useEffect(() => {
    setStreamQualityState(getStoredStreamQuality(stream));
  }, [stream?.name, stream?.secondary_url, stream?.secondaryUrl, stream?.recording_quality, stream?.recordingQuality]);

  const setStreamQuality = useCallback((quality) => {
    const normalizedQuality = normalizeStreamQuality(quality, stream);

    setStreamQualityState(normalizedQuality);
    persistStreamQuality(stream?.name, normalizedQuality);
  }, [stream, stream?.name]);

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
