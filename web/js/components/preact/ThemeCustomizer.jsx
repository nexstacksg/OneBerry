/**
 * LightNVR Theme Customizer Component
 * Allows users to customize color themes and intensity
 * Based on the accounting app's theme customization system
 */

import { useState, useEffect } from 'preact/hooks';
import { COLOR_THEMES, applyThemeColors } from '../../utils/theme-init.js';
import { useI18n } from '../../i18n.js';

/**
 * ThemeCustomizer component
 * @returns {JSX.Element} ThemeCustomizer component
 */
export function ThemeCustomizer() {
  const VISIBLE_THEME_IDS = new Set(['default', 'oneberry']);
  const visibleThemes = Object.entries(COLOR_THEMES).filter(([themeId]) => VISIBLE_THEME_IDS.has(themeId));

  const [mounted, setMounted] = useState(false);
  const [colorIntensity, setColorIntensity] = useState(50);
  const [colorTheme, setColorTheme] = useState('default');
  const { t } = useI18n();

  const getThemeDisplayName = (themeConfig) => themeConfig.nameKey ? t(themeConfig.nameKey) : themeConfig.name;

  // Load saved preferences from localStorage
  useEffect(() => {
    setMounted(true);
    const savedIntensity = localStorage.getItem('lightnvr-color-intensity');
    const savedColorTheme = localStorage.getItem('lightnvr-color-theme');

    document.documentElement.classList.remove('dark');
    localStorage.setItem('lightnvr-theme', 'light');

    // Load intensity
    if (savedIntensity) {
      setColorIntensity(parseInt(savedIntensity));
    }

    // Load color theme
    if (savedColorTheme && COLOR_THEMES[savedColorTheme] && VISIBLE_THEME_IDS.has(savedColorTheme)) {
      setColorTheme(savedColorTheme);
    } else {
      setColorTheme('default');
    }
  }, []);

  // Apply theme changes
  useEffect(() => {
    if (!mounted) return;

    document.documentElement.classList.remove('dark');

    // Apply color theme and intensity
    applyThemeColors(false, colorTheme, colorIntensity);

    // Save to localStorage
    localStorage.setItem('lightnvr-theme', 'light');
    localStorage.setItem('lightnvr-color-intensity', colorIntensity.toString());
    localStorage.setItem('lightnvr-color-theme', colorTheme);
  }, [mounted, colorIntensity, colorTheme]);

  const handleIntensityChange = (e) => {
    setColorIntensity(parseInt(e.target.value));
  };

  const handleThemeChange = (themeId) => {
    setColorTheme(themeId);
  };

  const handlePresetIntensity = (value) => {
    setColorIntensity(value);
  };

  if (!mounted) {
    return (
      <div class="animate-pulse">
        <div class="h-8 bg-muted rounded mb-4"></div>
        <div class="h-32 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      {/* Color Theme Selection */}
      <div class="p-4 bg-card rounded-lg border border-border">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🎨</span>
          <h3 class="font-semibold text-card-foreground">{t('appearance.colorTheme')}</h3>
        </div>
        
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {visibleThemes.map(([themeId, themeConfig]) => (
            <button
              key={themeId}
              onClick={() => handleThemeChange(themeId)}
              class={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                colorTheme === themeId
                  ? 'border-primary bg-primary/10 shadow-md'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-accent'
              }`}
            >
              <span class="text-2xl">{themeConfig.icon}</span>
              <span class="text-xs font-medium text-center text-card-foreground">
                {getThemeDisplayName(themeConfig)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Intensity Control */}
      <div class="p-4 bg-card rounded-lg border border-border">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🎚️</span>
          <h3 class="font-semibold text-card-foreground">{t('appearance.colorIntensity')}</h3>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t('appearance.lighter')}</span>
            <span class="font-semibold text-card-foreground">{colorIntensity}%</span>
            <span>{t('appearance.higherContrast')}</span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={colorIntensity}
            onChange={handleIntensityChange}
            class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />

          <div class="flex gap-2">
            <button
              onClick={() => handlePresetIntensity(25)}
              class={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                colorIntensity === 25
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {t('appearance.subtle')}
            </button>
            <button
              onClick={() => handlePresetIntensity(50)}
              class={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                colorIntensity === 50
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {t('appearance.balanced')}
            </button>
            <button
              onClick={() => handlePresetIntensity(75)}
              class={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                colorIntensity === 75
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {t('appearance.bold')}
            </button>
          </div>
        </div>
      </div>

      {/* Current Theme Info */}
      <div class="p-4 bg-accent/50 rounded-lg border border-border">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-accent-foreground">
            {COLOR_THEMES[colorTheme].icon} {getThemeDisplayName(COLOR_THEMES[colorTheme])}
          </span>
        </div>
      </div>

      {/* Preview Section */}
      <div class="p-4 bg-card rounded-lg border border-border">
        <h3 class="font-semibold text-card-foreground mb-3">{t('appearance.preview')}</h3>
        <div class="space-y-2">
          <div class="flex gap-2">
            <div class="flex-1 h-12 rounded bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
              {t('appearance.previewPrimary')}
            </div>
            <div class="flex-1 h-12 rounded bg-secondary flex items-center justify-center text-secondary-foreground text-xs font-medium">
              {t('appearance.previewSecondary')}
            </div>
          </div>
          <div class="flex gap-2">
            <div class="flex-1 h-12 rounded bg-accent flex items-center justify-center text-accent-foreground text-xs font-medium">
              {t('appearance.previewAccent')}
            </div>
            <div class="flex-1 h-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs font-medium">
              {t('appearance.previewMuted')}
            </div>
          </div>
          <div class="p-3 rounded border border-border bg-background">
            <p class="text-sm text-foreground">
              {t('appearance.previewText')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
