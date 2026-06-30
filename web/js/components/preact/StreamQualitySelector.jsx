import { STREAM_QUALITY } from '../../utils/stream-quality-utils.js';
import { useI18n } from '../../i18n.js';

const qualities = [
  { value: STREAM_QUALITY.HIGH, labelKey: 'live.highQuality', titleKey: 'live.highQualityTitle' },
  { value: STREAM_QUALITY.LOW, labelKey: 'live.lowQuality', titleKey: 'live.lowQualityTitle' },
];

export function StreamQualitySelector({ value, onChange, disabled = false }) {
  const { t } = useI18n();

  return (
    <div
      className="stream-quality-selector"
      role="group"
      aria-label={t('live.streamQuality')}
      title={t('live.streamQuality')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '26px',
        padding: '1px',
        borderRadius: '5px',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {qualities.map((quality) => {
        const active = value === quality.value;

        return (
          <button
            key={quality.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange?.(quality.value)}
            title={t(quality.titleKey)}
            style={{
              minWidth: '32px',
              height: '22px',
              padding: '0 6px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: active ? '#2563eb' : 'transparent',
              color: 'white',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: active ? '700' : '500',
              lineHeight: '22px',
              opacity: disabled ? 0.6 : 1,
              transition: 'background-color 0.15s ease',
            }}
          >
            {t(quality.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
