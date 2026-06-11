/**
 * LightNVR Web Interface Live View Page
 * Entry point for the live view page with WebRTC/HLS support
 */

import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { LiveView } from '../components/preact/LiveView.jsx';
import { ToastContainer } from "../components/preact/ToastContainer.jsx";
import { QueryClientProvider, queryClient } from '../query-client.js';
import { Header } from "../components/preact/Header.jsx";
import { setupSessionValidation } from '../utils/auth-utils.js';
import { startLiveWarmup } from '../utils/live-warmup.js';
import { initI18n } from '../i18n.js';

/**
 * Main App component that conditionally renders WebRTCView or LiveView
 * based on whether WebRTC is disabled in settings
 */
function App() {
    const [isWebRTCDisabled, setIsWebRTCDisabled] = useState(false);

    useEffect(() => {
        // Check WebRTC status in the background — do not block initial render
        async function checkWebRTCStatus() {
            try {
                const response = await fetch('/api/settings');
                if (!response.ok) return;
                const settings = await response.json();
                if (settings.webrtc_disabled || settings.go2rtc_enabled === false) {
                    setIsWebRTCDisabled(true);
                }
            } catch {
                // Ignore; default (WebRTC enabled) is kept
            }
        }

        checkWebRTCStatus();
    }, []);

    return (
        <>
            <Header />
            <ToastContainer />
            <LiveView isWebRTCDisabled={isWebRTCDisabled} />
        </>
    );
}

// Render the App component when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    startLiveWarmup({ force: true });
    await initI18n();
    // Setup session validation (checks every 5 minutes)
    setupSessionValidation();

    // Get the container element
    const container = document.getElementById('main-content');

    if (container) {
        render(
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>,
            container
        );
    }
});
