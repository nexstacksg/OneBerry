/**
 * LightNVR Web Interface Navigation Utilities
 * Helper functions for reliable navigation from Preact event handlers.
 */

const APP_PAGE_PATTERN = /^(?:\/|\.\/)?(?:index|hls|recordings|timeline|streams|settings|camera-access|users|system)\.html(?:[?#].*)?$/;

function normalizeAppPath(href) {
  if (typeof window === 'undefined' || !href) {
    return null;
  }

  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) {
    return null;
  }

  const fileName = url.pathname.split('/').pop() || 'index.html';
  if (!APP_PAGE_PATTERN.test(`${fileName}${url.search}${url.hash}`)) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Navigate to an internal application page without a document reload when the
 * SPA shell is mounted. Falls back to normal navigation for non-SPA contexts.
 *
 * @param {string} href Destination URL
 * @param {Event} [event] Event that triggered the navigation
 * @returns {boolean} Always false to simplify onClick usage
 */
export function navigateToAppPage(href, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (!href) {
    return false;
  }

  const appPath = normalizeAppPath(href);
  if (appPath && typeof window !== 'undefined' && window.__oneberrySpaMounted === true) {
    window.history.pushState({}, '', appPath);
    window.dispatchEvent(new CustomEvent('oneberry:navigate', { detail: { href: appPath } }));
    return false;
  }

  setTimeout(() => {
    window.location.href = href;
  }, 0);

  return false;
}

/**
 * Force navigation after the current event queue drains.
 *
 * @param {string} href Destination URL
 * @param {Event} [event] Event that triggered the navigation
 * @returns {boolean} Always false to simplify onClick usage
 */
export function forceNavigation(href, event) {
  return navigateToAppPage(href, event);
}
