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
      role="group"
      aria-label={t('live.streamQuality')}
      title={t('live.streamQuality')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '30px',
        padding: '2px',
        borderRadius: '4px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
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
              minWidth: '42px',
              height: '24px',
              padding: '0 8px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: active ? '#2563eb' : 'transparent',
              color: 'white',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: active ? '700' : '600',
              lineHeight: '24px',
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
