/**
 * LightNVR Web Interface Live View Page
 * Entry point for the live view page with WebRTC/HLS support
 */

import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { LiveView } from '../components/preact/LiveView.jsx';
import { WebRTCView } from '../components/preact/WebRTCView.jsx';
import { QueryClientProvider, queryClient, prefetchQuery } from '../query-client.js';
import { Header } from "../components/preact/Header.jsx";
import { ToastContainer } from "../components/preact/ToastContainer.jsx";
import { setupSessionValidation } from '../utils/auth-utils.js';
import { getSettings } from '../utils/settings-utils.js';
import { startLiveWarmup } from '../utils/live-warmup.js';
import { SetupWizard } from '../components/preact/SetupWizard.jsx';
import { initI18n } from '../i18n.js';

const prefetchLiveViewData = () => {
    void getSettings();
    void fetch('/api/ice-servers').catch((error) => {
        console.warn('Failed to prefetch ICE servers:', error);
    });
    void prefetchQuery(
        'streams',
        '/api/streams',
        {
            timeout: 15000,
            retries: 2,
            retryDelay: 1000
        }
    );
    void prefetchQuery(
        ['locations'],
        '/api/locations',
        {
            timeout: 10000,
            retries: 1,
            retryDelay: 1000
        }
    );
};

/**
 * Main App component that conditionally renders WebRTCView or LiveView
 * based on whether WebRTC is disabled in settings
 */
function App() {
    const [isWebRTCDisabled, setIsWebRTCDisabled] = useState(false);
    const [showWizard, setShowWizard] = useState(false);

    useEffect(() => {
        // Check setup wizard status and WebRTC settings in parallel, but do
        // not block the live grid mount. The cameras should start connecting
        // immediately on reload; settings only switch the transport if needed.
        async function init() {
            const settingsPromise = getSettings()
                .then((settings) => {
                    if (settings.webrtc_disabled || settings.go2rtc_enabled === false) {
                        console.log('WebRTC is disabled' + (settings.go2rtc_enabled === false ? ' (go2rtc disabled)' : '') + ', using HLS view');
                        setIsWebRTCDisabled(true);
                        document.title = 'HLS View - Oneberry';
                    } else {
                        console.log('WebRTC is enabled, using WebRTC view');
                        setIsWebRTCDisabled(false);
                    }
                })
                .catch((error) => {
                    console.error('Failed to load settings:', error);
                });

            const setupPromise = fetch('/api/setup/status')
                .then(async (setupRes) => {
                if (setupRes.ok) {
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
    }, []);

    return (
        <>
            {showWizard && <SetupWizard onClose={() => setShowWizard(false)} />}
            {isWebRTCDisabled ? <LiveView isWebRTCDisabled={true} /> : <WebRTCView />}
        </>
    );
}

// Render the App component when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('live-page-body');
    startLiveWarmup({ force: true });
    prefetchLiveViewData();
    void initI18n();
    // Setup session validation (checks every 5 minutes)
    setupSessionValidation();

    // Get the container element
    const container = document.getElementById('main-content');

    if (container) {
        render(
            <QueryClientProvider client={queryClient}>
                <Header />
                <ToastContainer />
                <App />
            </QueryClientProvider>,
            container
        );
    }
});
