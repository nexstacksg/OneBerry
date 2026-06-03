const STREAM_STATUS_STYLE_MAP = {
  Running: 'rgba(34, 197, 94, 0.9)',
  Starting: 'rgba(234, 179, 8, 0.9)',
  Reconnecting: 'rgba(234, 179, 8, 0.9)',
  Error: 'rgba(239, 68, 68, 0.9)',
  Stopping: 'rgba(234, 179, 8, 0.9)',
  default: 'rgba(148, 163, 184, 0.9)'
};

function getStreamStatusColor(status) {
  return STREAM_STATUS_STYLE_MAP[status] || STREAM_STATUS_STYLE_MAP.default;
}

function getStreamStatusText(t, status) {
  return status === 'Running' ? t('streams.running')
    : status === 'Starting' ? t('streams.starting')
    : status === 'Reconnecting' ? t('streams.reconnecting')
    : status === 'Error' ? t('streams.error')
    : status === 'Stopping' ? t('streams.stopping')
    : status === 'Stopped' ? t('streams.stopped')
    : (status || t('common.unknown'));
}

export function StreamStatusBadge({
  stream,
  t,
  show = true,
  className = 'stream-name-overlay',
  style = {},
  isPlaying = false,
  connectionQuality,
  showConnectionQuality = false,
  children,
  childrenPosition = 'end'
}) {
  if (!show) {
    return null;
  }

  const status = stream?.status;
  const statusColor = getStreamStatusColor(status);
  const statusText = getStreamStatusText(t, status);

  const connectionColor =
    connectionQuality === 'good' ? '#10B981' :
    connectionQuality === 'fair' ? '#FBBF24' :
    connectionQuality === 'poor' ? '#F97316' :
    connectionQuality === 'bad' ? '#EF4444' : '#6B7280';

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        padding: '5px 10px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        borderRadius: '4px',
        fontSize: '14px',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        ...style,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: statusColor,
        }}
        title={`${t('streams.streamStatus')}: ${statusText}`}
      />
      {childrenPosition === 'start' && children}
      {stream?.name}
      {childrenPosition === 'end' && children}

      {showConnectionQuality && isPlaying && connectionQuality && connectionQuality !== 'unknown' && (
        <div
          className={`connection-quality-indicator quality-${connectionQuality}`}
          title={t('live.connectionQuality', { quality: t(`live.connectionQuality.${connectionQuality}`) })}
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: connectionColor,
            boxShadow: '0 0 4px rgba(0, 0, 0, 0.3)'
          }}
        />
      )}
    </div>
  );
}

export function PrivacyModeOverlays({
  showPrivacyConfirm,
  privacyActive,
  isTogglingEnabled,
  onPauseForPrivacy,
  onResumeFromPrivacy,
  onCancelPause,
  t,
}) {
  return (
    <>
      {showPrivacyConfirm && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 20,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px',
          padding: '16px', textAlign: 'center'
        }}>
          <p style={{ color: 'white', fontSize: '14px', maxWidth: '240px', lineHeight: '1.4' }}>
            {t('live.pauseForPrivacyConfirm')}
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onPauseForPrivacy}
              disabled={isTogglingEnabled}
              style={{
                padding: '6px 16px', backgroundColor: '#7c3aed', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
              }}
            >
              {t('live.pauseForPrivacy')}
            </button>
            <button
              onClick={onCancelPause}
              style={{
                padding: '6px 16px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white',
                border: '1px solid rgba(255,255,255,0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '13px'
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {privacyActive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 15,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px'
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>{t('live.streamPausedForPrivacy')}</p>
          <button
            onClick={onResumeFromPrivacy}
            disabled={isTogglingEnabled}
            style={{
              padding: '6px 16px', backgroundColor: '#16a34a', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
            }}
          >
            {t('live.resumeStream')}
          </button>
        </div>
      )}
    </>
  );
}
