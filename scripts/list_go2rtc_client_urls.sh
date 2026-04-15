#!/usr/bin/env bash
# List ready-to-use go2rtc client URLs via LightNVR proxy on 8080.
set -euo pipefail

usage() {
    cat <<'USAGE'
Usage:
  list_go2rtc_client_urls.sh [options]

Options:
  -H, --host HOST     LightNVR host (default: 127.0.0.1)
  -p, --port PORT     LightNVR HTTP port exposing /go2rtc proxy (default: 8080)
  -s, --scheme SCHEME Protocol scheme (default: http)
  -h, --help          Show this help

Examples:
  list_go2rtc_client_urls.sh --host 172.16.200.108
  list_go2rtc_client_urls.sh -H 172.16.200.108 -p 8080 --scheme https
USAGE
}

HOST="127.0.0.1"
PORT="8080"
SCHEME="http"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -H|--host)
            HOST="$2"
            shift 2
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -s|--scheme)
            SCHEME="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required. Install with: sudo apt-get install -y jq" >&2
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required." >&2
    exit 1
fi

BASE_URL="${SCHEME}://${HOST}:${PORT}"
STREAMS_URL="${BASE_URL}/go2rtc/api/streams"

urlencode() {
    local s="$1"
    local out=""
    local c
    local i
    local o
    for ((i = 0; i < ${#s}; i++)); do
        c=${s:i:1}
        case "$c" in
            [A-Za-z0-9.~_-])
                out+="$c"
                ;;
            *)
                printf -v o '%%%02X' "'"$c"
                out+="$o"
                ;;
        esac
    done
    echo "$out"
}

echo "Checking $STREAMS_URL"
RESPONSE=$(curl -fsS "$STREAMS_URL")

STREAM_NAMES=$(echo "$RESPONSE" | jq -r 'keys[]' | sort)

if [[ -z "$STREAM_NAMES" ]]; then
    echo "No streams found via $STREAMS_URL"
    exit 0
fi

echo
for NAME in $STREAM_NAMES; do
    ENCODED_NAME="$(urlencode "$NAME")"
    echo "Camera: $NAME"
    echo "  stream list:   ${BASE_URL}/go2rtc/api/streams"
    echo "  hls url:      ${BASE_URL}/go2rtc/api/stream.m3u8?src=${ENCODED_NAME}"
    echo "  snapshot url:  ${BASE_URL}/go2rtc/api/frame.jpeg?src=${ENCODED_NAME}"
    echo
 done
