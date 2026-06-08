import { useEffect, useMemo, useState } from 'preact/hooks';

function buildSnapshotUrl(streamSource) {
  if (!streamSource) {
    return '';
  }

  const params = new URLSearchParams({
    src: streamSource,
    cache: '30s',
  });

  return `/go2rtc/api/frame.jpeg?${params.toString()}`;
}

export function LivePreviewPoster({
  streamSource,
  visible = true,
  enabled = true,
  delay = 0,
}) {
  const [shouldLoad, setShouldLoad] = useState(() => enabled && visible && delay <= 0);
  const [loaded, setLoaded] = useState(false);
  const src = useMemo(() => buildSnapshotUrl(streamSource), [streamSource]);

  useEffect(() => {
    setLoaded(false);

    if (!enabled || !visible || !src) {
      setShouldLoad(false);
      return undefined;
    }

    if (delay <= 0) {
      setShouldLoad(true);
      return undefined;
    }

    setShouldLoad(false);
    const timeout = setTimeout(() => setShouldLoad(true), delay);
    return () => clearTimeout(timeout);
  }, [delay, enabled, src, visible]);

  if (!enabled || !visible || !shouldLoad || !src) {
    return null;
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      decoding="async"
      loading="eager"
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(false)}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: '#000',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 160ms ease',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}
