/**
 * Lightweight structured logger for frontend modules.
 *
 * Default behavior keeps production logs quiet while allowing verbose logs in
 * development. Set VITE_LOG_LEVEL or localStorage.lightnvr_log_level to one of:
 * debug, info, warn, error, silent.
 */

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

const SENSITIVE_FIELD_NAME = /pass|password|token|secret|api[_-]?key|session|credential|authorization|(^|[_-])key($|[_-])/i;
const CREDENTIAL_IN_URL = /^([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/i;

function getEnv() {
  try {
    return import.meta.env || {};
  } catch {
    return {};
  }
}

function getLocalLogLevel() {
  try {
    return window.localStorage.getItem('lightnvr_log_level');
  } catch {
    return null;
  }
}

function normalizeLevel(level) {
  const normalized = String(level || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, normalized) ? normalized : null;
}

function getConfiguredLevel() {
  const env = getEnv();
  const explicitLevel = normalizeLevel(env.VITE_LOG_LEVEL) || normalizeLevel(getLocalLogLevel());

  if (explicitLevel) {
    return explicitLevel;
  }

  if (env.DEV || env.VITE_DEBUG_LOGS === 'true') {
    return 'debug';
  }

  return 'warn';
}

function redactUrlString(value) {
  let redacted = value.replace(CREDENTIAL_IN_URL, '$1redacted@');
  const shouldParseAsUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(redacted) || redacted.startsWith('/');

  if (!shouldParseAsUrl) {
    return redacted;
  }

  try {
    const url = new URL(redacted, window.location.origin);
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_FIELD_NAME.test(key)) {
        url.searchParams.set(key, 'redacted');
      }
    }

    redacted = value.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch {
    // Not a URL; still return credential-redacted string.
  }

  return redacted;
}

export function sanitizeLogValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return redactUrlString(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogValue(value.message, seen),
      status: value.status
    };
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => sanitizeLogValue(item, seen));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_FIELD_NAME.test(key) ? '[redacted]' : sanitizeLogValue(item, seen);
  }
  return result;
}

export function createLogger(scope) {
  const prefix = scope ? `[${scope}]` : '[app]';

  function isEnabled(level) {
    return LEVELS[level] >= LEVELS[getConfiguredLevel()];
  }

  function write(level, args) {
    if (!isEnabled(level)) {
      return;
    }

    const method = level === 'debug' ? 'debug' : level === 'info' ? 'log' : level;
    console[method](prefix, ...args.map(arg => sanitizeLogValue(arg)));
  }

  return {
    debug: (...args) => write('debug', args),
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
    isLevelEnabled: isEnabled
  };
}
