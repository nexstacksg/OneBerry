/**
 * LightNVR Web Interface Fetch Utilities
 * Enhanced fetch API with timeout, cancellation, and retry capabilities
 */

import { createLogger } from './utils/logger.js';

const log = createLogger('fetch');

/**
 * Clear authentication state and redirect to login
 * @param {string} reason - Reason for redirect (optional)
 */
function handleAuthenticationFailure(reason = 'Session expired') {
  log.warn(`Authentication failure: ${reason}`);

  // Clear all auth-related storage
  localStorage.removeItem('auth');

  // Clear auth cookies
  document.cookie = "auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
  document.cookie = "session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";

  // Only redirect if we're not already on the login page
  if (!window.location.pathname.includes('login.html')) {
    log.info('Redirecting to login page due to authentication failure');
    window.location.href = '/login.html?auth_required=true&reason=session_expired';
  }
}

/**
 * Check if an error is an authentication error that should trigger redirect
 * @param {Error} error - The error to check
 * @returns {boolean} - True if this is an auth error
 */
function isAuthenticationError(error) {
  // Check if error status is 401 or message contains 401
  return error.status === 401 || (error.message && error.message.includes('401'));
}

/**
 * Custom HTTP error class with status code
 */
class HTTPError extends Error {
  constructor(status, statusText, message) {
    super(message || `HTTP error ${status}: ${statusText}`);
    this.name = 'HTTPError';
    this.status = status;
    this.statusText = statusText;
  }
}

/**
 * Enhanced fetch function with timeout, retries and error handling
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export async function enhancedFetch(url, options = {}) {
  const {
    timeout = 30000,
    retries = 1,
    retryDelay = 1000,
    signal: externalSignal,
    skipAuthRedirect = false, // Allow callers to opt-out of auto-redirect (e.g., login page)
    ...fetchOptions
  } = options;
  const maxRetries = normalizeRetryCount(retries);
  const retryDelayMs = normalizeDelay(retryDelay);
  const timeoutMs = normalizeDelay(timeout);

  // Log the request details
  log.debug(`enhancedFetch: ${fetchOptions.method || 'GET'} ${url}`);
  log.debug('enhancedFetch options:', {
    timeout: timeoutMs,
    retries: maxRetries,
    retryDelay: retryDelayMs,
    skipAuthRedirect,
    ...fetchOptions
  });

  let lastError;
  let attempt = 0;

  while (attempt <= maxRetries) {
    let didTimeout = false;
    let timeoutId = null;
    const timeoutController = timeoutMs > 0 ? new AbortController() : null;
    const attemptSignal = createAttemptSignal(externalSignal, timeoutController?.signal);

    if (timeoutController) {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        log.warn(`enhancedFetch: Timeout reached for ${url}, aborting request`);
        timeoutController.abort();
      }, timeoutMs);
    }

    // Add the signal and credentials to fetch options
    const optionsWithSignal = {
      credentials: 'same-origin', // Include cookies in same-origin requests
      ...fetchOptions,
      signal: attemptSignal.signal
    };

    try {
      if (externalSignal?.aborted) {
        throw new Error('Request was cancelled');
      }

      log.debug(`enhancedFetch: Attempt ${attempt + 1}/${maxRetries + 1} for ${url}`);
      const response = await fetch(url, optionsWithSignal);

      // Clear the timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      attemptSignal.cleanup();

      // Log the response
      log.debug(`enhancedFetch response: ${response.status} ${response.statusText} for ${url}`);

      // Handle 401 Unauthorized - don't retry, just redirect
      // Skip redirect if auth is disabled or demo mode is enabled on the server
      if (response.status === 401) {
        if (!skipAuthRedirect && !window._authDisabled && !window._demoMode) {
          handleAuthenticationFailure('Received 401 Unauthorized response');
        }
        throw new HTTPError(401, 'Unauthorized', 'Authentication required');
      }

      // Handle 403 Forbidden - access denied, don't redirect but throw with status
      if (response.status === 403) {
        throw new HTTPError(403, 'Forbidden', 'Access denied - insufficient privileges');
      }

      // Check if the response is ok - try to get error message from response body
      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorBody = await response.json();
          if (errorBody && errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch (parseError) {
          // If we can't parse the response, just use the status text
          log.debug('Could not parse error response body:', parseError);
        }
        throw new HTTPError(response.status, response.statusText, errorMessage);
      }

      return response;
    } catch (error) {
      lastError = error;

      // Clear the timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      attemptSignal.cleanup();

      // Log the error
      log.error(`enhancedFetch error (attempt ${attempt + 1}/${maxRetries + 1}):`, error);

      // If this is an authentication error, don't retry - just fail immediately
      if (isAuthenticationError(error)) {
        log.warn('enhancedFetch: Authentication error detected, not retrying');
        throw error;
      }

      // If this is a client error (4xx), don't retry - it will fail the same way
      if (error.status && error.status >= 400 && error.status < 500) {
        log.warn(`enhancedFetch: Client error ${error.status} detected, not retrying`);
        throw error;
      }

      // If the request was aborted, don't retry
      if (error.name === 'AbortError' || externalSignal?.aborted || didTimeout) {
        if (externalSignal?.aborted) {
          log.warn(`enhancedFetch: Request was cancelled by external signal for ${url}`);
          throw new Error('Request was cancelled');
        } else if (didTimeout || timeoutController?.signal.aborted) {
          log.warn(`enhancedFetch: Request timed out for ${url}`);
          throw new Error('Request timed out');
        }
        throw error;
      }

      // If this was the last retry, throw the error
      if (attempt >= maxRetries) {
        log.error(`enhancedFetch: All ${maxRetries + 1} attempts failed for ${url}`);
        break;
      }

      // Wait before retrying
      log.debug(`enhancedFetch: Waiting ${retryDelayMs}ms before retry ${attempt + 1} for ${url}`);
      await delayWithCancellation(retryDelayMs, externalSignal);

      attempt++;
    }
  }

  throw lastError;
}

/**
 * Combine multiple AbortSignals into one and expose cleanup for listeners.
 * @param {...AbortSignal} signals - Signals to combine
 * @returns {{signal: AbortSignal|undefined, cleanup: Function}} - Combined signal and cleanup
 */
function createAttemptSignal(...signals) {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length === 0) {
    return { signal: undefined, cleanup: () => {} };
  }

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0], cleanup: () => {} };
  }

  const controller = new AbortController();
  const cleanup = () => {
    activeSignals.forEach(signal => {
      signal.removeEventListener('abort', onAbort);
    });
  };
  
  const onAbort = () => {
    controller.abort();
    cleanup();
  };
  
  activeSignals.forEach(signal => {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort);
    }
  });
  
  return { signal: controller.signal, cleanup };
}

function normalizeRetryCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeDelay(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function delayWithCancellation(delayMs, signal) {
  if (delayMs <= 0) {
    return signal?.aborted ? Promise.reject(new Error('Request was cancelled')) : Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request was cancelled'));
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error('Request was cancelled'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Create a request controller for managing fetch requests
 * @returns {Object} - Request controller object
 */
export function createRequestController() {
  const controller = new AbortController();
  
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    isAborted: () => controller.signal.aborted
  };
}

/**
 * Fetch JSON data with enhanced fetch
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} - Parsed JSON data
 */
export async function fetchJSON(url, options = {}) {
  try {
    const response = await enhancedFetch(url, options);
    log.debug('fetchJSON: Parsing JSON response from', url);
    const data = await response.json();
    return data;
  } catch (error) {
    log.error('fetchJSON: Error fetching or parsing JSON from', url, ':', error);
    throw error;
  }
}
