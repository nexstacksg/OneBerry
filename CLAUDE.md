# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

LightNVR is a lightweight, memory-optimized Network Video Recorder written in C. It targets resource-constrained Linux devices (256MB RAM minimum) and pairs a C backend with a Preact/Tailwind web UI. The streaming backbone is **go2rtc** (embedded submodule), which handles RTSP ingest, WebRTC, and HLS endpoints. Object detection is offloaded to an external HTTP API (`light-object-detect`).

## Build Commands

### C Backend

```bash
# Debug build with ASan/UBSan, tests enabled
bash scripts/build.sh --debug

# Optimized release build
bash scripts/build.sh --release

# Clean before building
bash scripts/build.sh --release --clean

# Build without SOD object detection (faster, smaller)
bash scripts/build.sh --release --without-sod

# Output binary: build/bin/lightnvr (and symlink ./lightnvr)
```

Build uses CMake; a `build/` directory is created automatically. `CMAKE_EXPORT_COMPILE_COMMANDS=ON` is always set, so `build/compile_commands.json` is always available for tooling.

### Web Frontend

```bash
# Install deps and build into web/dist/
bash scripts/build_web_vite.sh

# Dev server (hot reload, proxies API to running backend)
cd web && npm run start     # serves on :8080

# Production build with source maps
cd web && npm run build:maps
```

### Static Analysis

```bash
# clang-tidy over C sources (requires a completed cmake build)
clang-tidy -p build/compile_commands.json src/**/*.c

# Duplicate code / audit check (from repo root)
npm run fallow:audit
npm run fallow:dupes
```

## Testing

### C Unit Tests (CTest)

```bash
# Run all CTest tests after a build
ctest --test-dir build

# Run a single test binary directly
./build/bin/test_stream_state
```

Test sources are in `tests/unit/`. Name new test files `test_<feature>.c` and register them in `tests/CMakeLists.txt`.

### Playwright Integration Tests

Requires a running LightNVR instance (default `http://localhost:8080`):

```bash
# All integration tests
npm test

# By category
npm run test:api       # @api-tagged tests
npm run test:ui        # @ui-tagged tests
npm run test:go2rtc    # @go2rtc-tagged tests

# Target a non-default server
LIGHTNVR_URL=http://host:port npm test
```

Spec files live in `tests/integration/specs/`. Name them `*.api.spec.ts`, `*.ui.spec.ts`, or `*.go2rtc.spec.ts` — Playwright projects select tests by these suffixes.

### Web Frontend Unit Tests

```bash
cd web && npm test          # Jest unit tests
cd web && npm run test:e2e  # Selenium e2e tests (requires browser drivers)
```

## Architecture

### C Backend (`src/`)

| Directory | Role |
|-----------|------|
| `src/core/` | Main entry point, config, logger, MQTT, daemon, URL utils |
| `src/video/` | Stream manager, MP4/HLS writers, ONVIF, detection, go2rtc integration, FFmpeg wrappers |
| `src/storage/` | Storage manager, retention, disk-pressure |
| `src/web/` | libuv HTTP server, all REST API handlers (one file per domain), WebSocket |
| `src/database/` | SQLite wrapper, query builder, migrations runner |
| `src/utils/` | Shared utilities |

Headers mirror `src/` layout under `include/<domain>/`.

**HTTP server**: libuv + llhttp (migrated from Mongoose in v0.20.0). Server entry is `src/web/libuv_server.c`; each API domain has its own `api_handlers_<domain>.c`.

**Database migrations**: SQL files in `db/migrations/` numbered `NNNN_description.sql`. The migrations runner applies them in order on startup.

**go2rtc**: Compiled as a submodule (`external/go2rtc/`). LightNVR spawns it as a child process and talks to its HTTP API (default port 1984) for stream forwarding, WebRTC signaling, and frame snapshots. Config is generated at `GO2RTC_CONFIG_DIR` (default `/etc/lightnvr/go2rtc/`).

### Web Frontend (`web/`)

Multi-page Preact app built with Vite. Each HTML file is an entry point (`index.html`, `streams.html`, `recordings.html`, etc.) mounting a page component.

| Path | Role |
|------|------|
| `web/js/pages/` | Top-level page components (one per HTML entry point) |
| `web/js/components/preact/` | Feature components (LiveView, StreamConfigModal, ZoneEditor, ThemeCustomizer, …) |
| `web/js/utils/` | Auth, date, URL, theme, settings, telemetry helpers |
| `web/js/fetch-utils.js` | Centralized API fetch wrapper |
| `web/js/query-client.js` | `@preact-signals/query` client setup |
| `web/css/` | Tailwind CSS source files (copied to `dist/css/` at build time) |

React→Preact aliases are configured in `vite.config.js` so React-compatible libraries work transparently.

**Streaming components**: `WebRTCVideoCell.jsx`, `HLSVideoCell.jsx`, `MSEVideoCell.jsx` handle their respective protocols. `LiveView.jsx` orchestrates the grid layout and protocol selection. `LivePreviewPoster.jsx` handles snapshot preloading.

**Theme system**: 7 color themes defined in `web/js/utils/theme-init.js`. The `vite-plugin-theme-inject.js` custom plugin injects theme CSS variables into each HTML page at build time. `ThemeCustomizer.jsx` provides the UI for runtime switching.

## Coding Conventions

- **C**: 4-space indentation, `snake_case` for all names, domain-focused small modules. Headers go in `include/<domain>/`.
- **JavaScript**: 2-space indentation, kebab-case filenames for utilities, PascalCase for JSX components.
- **Commit messages**: Use conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`) with imperative present-tense subjects.
- **PRs**: Include verification commands, screenshots/recordings for UI changes, and note any migration or config impacts.

## Key Configuration Files

- `config/lightnvr-test.ini` — test configuration (use this, not production config, for test setups)
- `config/go2rtc/go2rtc-test.yaml` — go2rtc test configuration
- `/etc/lightnvr/lightnvr.ini` — runtime config (created by install script)

## Docker

```bash
# Initialize submodules first (required for go2rtc)
git submodule update --init --recursive

# Start (builds image on first run)
docker compose up -d

# Ports: 8080 (web UI), 8554 (RTSP), 8555 (WebRTC TCP/UDP), 1984 (go2rtc API)
# ⚠️ Mount /var/lib/lightnvr/data NOT /var/lib/lightnvr (the latter overwrites web assets)
```
