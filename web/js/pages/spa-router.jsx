/**
 * Oneberry SPA shell.
 * Keeps existing page URLs working while allowing sidebar navigation to swap
 * Preact views without forcing a full document reload.
 */

import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { BatchDeleteModal } from '../components/preact/BatchDeleteModal.jsx';
import { CameraAccessView } from '../components/preact/CameraAccessView.jsx';
import { Footer } from '../components/preact/Footer.jsx';
import { Header } from '../components/preact/Header.jsx';
import { LiveView } from '../components/preact/LiveView.jsx';
import { ModalProvider } from '../components/preact/UI.jsx';
import { RecordingsView } from '../components/preact/RecordingsView.jsx';
import { SettingsView } from '../components/preact/SettingsView.jsx';
import { SetupWizard } from '../components/preact/SetupWizard.jsx';
import { StreamsView } from '../components/preact/StreamsView.jsx';
import { SystemView } from '../components/preact/SystemView.jsx';
import { TimelinePage } from '../components/preact/timeline/TimelinePage.jsx';
import { ToastContainer } from '../components/preact/ToastContainer.jsx';
import { UsersView } from '../components/preact/UsersView.jsx';
import { WebRTCView } from '../components/preact/WebRTCView.jsx';
import { QueryClientProvider, queryClient, prefetchQuery } from '../query-client.js';
import { initI18n } from '../i18n.js';
import { setupSessionValidation } from '../utils/auth-utils.js';
import { getSettings } from '../utils/settings-utils.js';
import { startLiveWarmup } from '../utils/live-warmup.js';

const PAGE_CONFIG = {
  'index.html': {
    activeNav: 'nav-live',
    title: 'WebRTC View - Oneberry',
    bodyClass: 'live-page-body',
    before: () => startLiveWarmup({ force: true }),
    render: () => <LiveRoute />,
  },
  'hls.html': {
    activeNav: 'nav-live',
    title: 'HLS View - Oneberry',
    bodyClass: 'live-page-body',
    before: () => startLiveWarmup({ force: true }),
    render: () => <HlsRoute />,
  },
  'recordings.html': {
    activeNav: 'nav-recordings',
    title: 'Recordings - Oneberry',
    before: () => startLiveWarmup(),
    render: () => (
      <>
        <BatchDeleteModal />
        <RecordingsView />
        <Footer />
      </>
    ),
  },
  'timeline.html': {
    activeNav: 'nav-recordings',
    title: 'Timeline - Oneberry',
    before: () => startLiveWarmup(),
    render: () => (
      <>
        <TimelinePage />
        <Footer />
      </>
    ),
  },
  'streams.html': {
    activeNav: 'nav-streams',
    title: 'Cameras - Oneberry',
    before: () => startLiveWarmup(),
    render: () => (
      <>
        <StreamsView />
        <Footer />
      </>
    ),
  },
  'settings.html': {
    activeNav: 'nav-settings',
    title: 'Settings - Oneberry',
    before: () => startLiveWarmup(),
    render: () => (
      <>
        <SettingsView />
        <Footer />
      </>
    ),
  },
  'camera-access.html': {
    activeNav: 'nav-camera-access',
    title: 'Camera Access - Oneberry',
    before: () => startLiveWarmup(),
    render: () => (
      <>
        <CameraAccessView />
        <Footer />
      </>
    ),
  },
  'users.html': {
    activeNav: 'nav-users',
    title: 'Users - Oneberry',
    before: () => startLiveWarmup(),
    render: () => (
      <>
        <UsersView />
        <Footer />
      </>
    ),
  },
  'system.html': {
    activeNav: 'nav-system',
    title: 'System - Oneberry',
    before: () => startLiveWarmup(),
    render: () => (
      <>
        <SystemView />
        <Footer />
      </>
    ),
  },
};

function getCurrentPageKey() {
  if (typeof window === 'undefined') {
    return 'index.html';
  }

  const fileName = window.location.pathname.split('/').pop() || 'index.html';
  return PAGE_CONFIG[fileName] ? fileName : 'index.html';
}

function prefetchLiveViewData() {
  void getSettings();
  void fetch('/api/ice-servers').catch((error) => {
    console.warn('Failed to prefetch ICE servers:', error);
  });
  void prefetchQuery('streams', '/api/streams', {
    timeout: 15000,
    retries: 2,
    retryDelay: 1000,
  });
  void prefetchQuery(['locations'], '/api/locations', {
    timeout: 10000,
    retries: 1,
    retryDelay: 1000,
  });
}

function LiveRoute() {
  const [isWebRTCDisabled, setIsWebRTCDisabled] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const settingsPromise = getSettings()
        .then((settings) => {
          if (cancelled) return;
          if (settings.webrtc_disabled || settings.go2rtc_enabled === false) {
            setIsWebRTCDisabled(true);
            document.title = 'HLS View - Oneberry';
          } else {
            setIsWebRTCDisabled(false);
          }
        })
        .catch((error) => {
          console.error('Failed to load settings:', error);
        });

      const setupPromise = fetch('/api/setup/status')
        .then(async (setupRes) => {
          if (!cancelled && setupRes.ok) {
            const setupData = await setupRes.json();
            if (!setupData.complete) {
              setShowWizard(true);
            }
          }
        })
        .catch((error) => {
          console.error('Failed to load setup status:', error);
        });

      await Promise.allSettled([settingsPromise, setupPromise]);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {showWizard && <SetupWizard onClose={() => setShowWizard(false)} />}
      {isWebRTCDisabled ? <LiveView isWebRTCDisabled={true} /> : <WebRTCView />}
    </>
  );
}

function HlsRoute() {
  const [isWebRTCDisabled, setIsWebRTCDisabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkWebRTCStatus() {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) return;
        const settings = await response.json();
        if (!cancelled && (settings.webrtc_disabled || settings.go2rtc_enabled === false)) {
          setIsWebRTCDisabled(true);
        }
      } catch {
        // Keep the default if settings cannot be loaded.
      }
    }

    checkWebRTCStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  return <LiveView isWebRTCDisabled={isWebRTCDisabled} />;
}

function SpaApp() {
  const [pageKey, setPageKey] = useState(getCurrentPageKey);
  const page = PAGE_CONFIG[pageKey] || PAGE_CONFIG['index.html'];

  useEffect(() => {
    const handleNavigation = () => setPageKey(getCurrentPageKey());
    window.addEventListener('oneberry:navigate', handleNavigation);
    window.addEventListener('popstate', handleNavigation);
    return () => {
      window.removeEventListener('oneberry:navigate', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
    };
  }, []);

  useEffect(() => {
    document.title = page.title;
    document.body.classList.toggle('live-page-body', page.bodyClass === 'live-page-body');
    document.getElementById('header-container')?.setAttribute('data-active-nav', page.activeNav);
    page.before?.();
  }, [page, pageKey]);

  const routeView = useMemo(() => page.render(), [page, pageKey]);

  return (
    <QueryClientProvider client={queryClient}>
      <ModalProvider>
        <Header activeNav={page.activeNav} />
        <ToastContainer />
        <div className="spa-route-view" key={pageKey}>
          {routeView}
        </div>
      </ModalProvider>
    </QueryClientProvider>
  );
}

export function mountSpaApp() {
  const container = document.getElementById('main-content');
  if (!container) {
    return;
  }

  window.__oneberrySpaMounted = true;
  prefetchLiveViewData();
  setupSessionValidation();
  render(<SpaApp />, container);
}

document.addEventListener('DOMContentLoaded', async () => {
  await initI18n();
  mountSpaApp();
});
