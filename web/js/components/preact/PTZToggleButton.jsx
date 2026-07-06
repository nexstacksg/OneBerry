export function PTZToggleButton({ active, onToggle, t }) {
  return (
    <button
      className={`ptz-toggle-btn ${active ? 'active' : ''}`}
      title={active ? t('live.hidePtzControls') : t('live.showPtzControls')}
      onClick={onToggle}
      style={{
        backgroundColor: active ? 'rgba(59, 130, 246, 0.8)' : 'transparent',
        border: 'none',
        padding: '5px',
        borderRadius: '4px',
        color: 'white',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
      }}
      onMouseOver={(event) => {
        if (!active) event.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
      }}
      onMouseOut={(event) => {
        if (!active) event.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        <path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    </button>
  );
}
