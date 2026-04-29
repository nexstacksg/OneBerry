import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Priority, queueThumbnailLoad } from '../../../request-queue.js';

export function TimelineThumbnailTile({
  thumbUrl,
  alt = 'Timeline preview',
  priority = Priority.NORMAL,
  className = '',
  imgClassName = ''
}) {
  const [loadState, setLoadState] = useState(thumbUrl ? 'loading' : 'empty');
  const imgErrorCountRef = useRef(0);

  const loadThumbnail = useCallback(() => {
    if (!thumbUrl) {
      setLoadState('empty');
      return;
    }

    setLoadState('loading');
    imgErrorCountRef.current = 0;

    queueThumbnailLoad(thumbUrl, priority)
      .then(() => setLoadState('loaded'))
      .catch(() => setLoadState('error'));
  }, [priority, thumbUrl]);

  useEffect(() => {
    loadThumbnail();
  }, [loadThumbnail]);

  const handleImageError = useCallback(() => {
    imgErrorCountRef.current += 1;
    if (imgErrorCountRef.current <= 1) {
      loadThumbnail();
      return;
    }

    setLoadState('error');
  }, [loadThumbnail]);

  if (loadState === 'loaded' && thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt={alt}
        className={imgClassName || className}
        loading="lazy"
        decoding="async"
        onError={handleImageError}
      />
    );
  }

  if (loadState === 'loading') {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-[9px] text-white/35 ${className}`}>
        Loading...
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-[9px] text-white/45 ${className}`}>
        Preview unavailable
      </div>
    );
  }

  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-[9px] text-white/35 ${className}`}>
      No preview
    </div>
  );
}
