#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/lightnvr/go2rtc"
VERSION="latest"
LIGHTNVR_SERVICE="lightnvr"
CHECK_ONLY=false
FORCE_INSTALL=false
RESTART_SERVICE=true
GO2RTC_LEGACY_BIN="/bin/go2rtc"

log_info() {
    echo "[go2rtc-fix] $1"
}

log_error() {
    echo "[go2rtc-fix][error] $1" >&2
}

usage() {
    cat << 'EOF'
Usage: scripts/fix_go2rtc_production.sh [options]

Options:
  -d, --install-dir DIR    install go2rtc binary here (default: /usr/local/bin)
  -c, --config-dir DIR     go2rtc config directory (default: /etc/lightnvr/go2rtc)
  -v, --version VERSION    go2rtc release version to install (default: latest)
  -s, --service NAME       lightnvr service name (default: lightnvr)
      --no-restart         install only, do not restart lightnvr service
      --force              force re-install even if go2rtc binary already exists
      --check-only         only verify go2rtc and API availability
  -h, --help               show this help
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -d|--install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        -c|--config-dir)
            CONFIG_DIR="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -s|--service)
            LIGHTNVR_SERVICE="$2"
            shift 2
            ;;
        --no-restart)
            RESTART_SERVICE=false
            shift
            ;;
        --force)
            FORCE_INSTALL=true
            shift
            ;;
        --check-only)
            CHECK_ONLY=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    log_error "This script must be run as root (or with sudo)."
    exit 1
fi

if ! command -v ss >/dev/null 2>&1; then
    log_error "Missing dependency: ss (iproute2 package)"
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    log_error "Missing dependency: curl"
    exit 1
fi

GO2RTC_BIN="${INSTALL_DIR%/}/go2rtc"

if [[ "$CHECK_ONLY" == "true" ]]; then
    log_info "Check-only mode enabled"
    if [[ -x "$GO2RTC_BIN" ]]; then
        log_info "Found go2rtc binary: $GO2RTC_BIN"
    elif [[ -x "$GO2RTC_LEGACY_BIN" ]]; then
        log_info "Found go2rtc binary (legacy path): $GO2RTC_LEGACY_BIN"
    else
        log_error "go2rtc binary not found."
    fi
else
    if [[ ! -x "$GO2RTC_BIN" || "$FORCE_INSTALL" == "true" ]]; then
        if [[ "$VERSION" == "latest" ]]; then
            log_info "Installing go2rtc to ${GO2RTC_BIN}..."
            bash "$SCRIPT_DIR/install_go2rtc.sh" -d "$INSTALL_DIR" -c "$CONFIG_DIR"
        else
            log_info "Installing go2rtc ${VERSION} to ${GO2RTC_BIN}..."
            bash "$SCRIPT_DIR/install_go2rtc.sh" -d "$INSTALL_DIR" -c "$CONFIG_DIR" -v "$VERSION"
        fi
    else
        log_info "go2rtc already present at ${GO2RTC_BIN}."
    fi
fi

if [[ -x "$GO2RTC_BIN" ]]; then
    log_info "go2rtc command path: $(command -v go2rtc || true)"
    if ln -sf "$GO2RTC_BIN" "$GO2RTC_LEGACY_BIN"; then
        log_info "Ensured legacy path: $GO2RTC_LEGACY_BIN -> $GO2RTC_BIN"
    fi
elif [[ "$CHECK_ONLY" == "true" ]]; then
    log_error "go2rtc binary still missing."
    exit 1
else
    log_error "go2rtc binary missing after install. check /var/log/lightnvr/lightnvr.log for details."
    exit 1
fi

if [[ ! -f "$CONFIG_DIR/go2rtc.yaml" ]]; then
    log_error "go2rtc config is missing at $CONFIG_DIR/go2rtc.yaml"
    if ! "$SCRIPT_DIR/install_go2rtc.sh" -d "$INSTALL_DIR" -c "$CONFIG_DIR" > /dev/null; then
        log_error "Could not create default go2rtc config."
        exit 1
    fi
    log_info "Created default go2rtc config at $CONFIG_DIR/go2rtc.yaml"
fi

if [[ "$RESTART_SERVICE" == "true" ]]; then
    if systemctl show "$LIGHTNVR_SERVICE.service" >/dev/null 2>&1; then
        if systemctl is-active --quiet "$LIGHTNVR_SERVICE"; then
            log_info "Restarting ${LIGHTNVR_SERVICE}.service..."
            systemctl restart "$LIGHTNVR_SERVICE"
        else
            log_info "Starting ${LIGHTNVR_SERVICE}.service..."
            systemctl start "$LIGHTNVR_SERVICE"
        fi
    else
        log_error "Service $LIGHTNVR_SERVICE.service not found. Set --service with the correct unit name or run restart manually."
        exit 1
    fi
fi

if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '(^|[:.])1984$'; then
    log_info "Port 1984 is now listening."
else
    log_error "Port 1984 is not listening on the host."
    log_info "Checking recent lightnvr startup logs..."
    journalctl -u "$LIGHTNVR_SERVICE" -n 120 --no-pager || true
    exit 1
fi

if curl -fsS --max-time 5 http://127.0.0.1:1984/api/streams >/dev/null; then
    log_info "go2rtc API is reachable: http://127.0.0.1:1984/api/streams"
    log_info "Verification complete. Next: access http://<server-ip>:8080 for LightNVR and use WebRTC/HLS features."
    exit 0
fi

log_error "Could not reach go2rtc API at /api/streams"
log_info "Recent lightnvr logs:"
journalctl -u "$LIGHTNVR_SERVICE" -n 180 --no-pager || true
exit 1
