# LightNVR Scripts

Scripts for building, installing, testing, and maintaining LightNVR.

## Build Scripts

### `build.sh`
Main build script for LightNVR (C backend).

```bash
bash scripts/build.sh [options]
```

**Options:** `--release`, `--debug`, `--clean`, `--no-sod`, `--sod-dynamic`, `--no-go2rtc`, `--no-tests`

### `build_web_vite.sh`
Builds web frontend assets using Vite.

```bash
bash scripts/build_web_vite.sh [-m|--with-maps]
```

Extracts version from CMakeLists.txt, installs npm deps, and runs Vite build to `web/dist/`.

## Installation Scripts

### `install.sh`
Main installation script. Installs binary, config, web assets, and systemd service.

```bash
sudo bash scripts/install.sh [--prefix=DIR] [--config-dir=DIR] [--data-dir=DIR]
```

### `install_go2rtc.sh`
Downloads and installs go2rtc binary (opensensor fork with memory leak fixes).

```bash
sudo bash scripts/install_go2rtc.sh [-d DIR] [-c DIR] [-v VERSION]
```

### `fix_go2rtc_production.sh`
Production helper that installs go2rtc if missing, creates a compatibility binary symlink, restarts LightNVR, and verifies the API.

```bash
sudo bash scripts/fix_go2rtc_production.sh [--version VERSION] [--service lightnvr]
```

### `list_go2rtc_client_urls.sh`
Lists live camera stream names from the LightNVR proxy endpoint and prints ready-to-open `/go2rtc/...` URLs (for port-8080-only access).

```bash
sudo bash scripts/list_go2rtc_client_urls.sh [--host HOST] [--port PORT]
```

Examples:

```bash
scripts/list_go2rtc_client_urls.sh --host 172.16.200.108 --port 8080
scripts/list_go2rtc_client_urls.sh --host 172.16.200.108 --scheme https --port 8443
```

### `install_web_assets.sh`
Builds (if needed) and installs web interface files to the web root.

```bash
sudo bash scripts/install_web_assets.sh [-m|--with-maps]
```

## Version & Release Scripts

### `extract_version.sh` / `extract_version.js`
Extracts version from CMakeLists.txt and generates `web/js/version.js`. The shell version is used by CMake; the JS version is used by `build_web_vite.sh`.

### `bump-version.sh`
Bumps version number across all project files.

```bash
bash scripts/bump-version.sh <new_version>   # e.g. 0.13.0
```

### `release.sh`
Automates the release process (bump, build, tag, push).

```bash
bash scripts/release.sh <new_version> [--no-push]
```

## Screenshot & Demo Capture

Playwright-based automation for capturing documentation media. See each script's `--help` for options.

| Script | Purpose |
|--------|---------|
| `capture-screenshots.js` | Captures screenshots of all major UI pages |
| `capture-demos.js` | Records video demonstrations of key features |
| `capture-detection-demos.js` | Captures detection-focused screenshots (zones, overlays) |
| `setup-demo-streams.js` | Configures demo camera streams from `demo-cameras.json` |
| `update-documentation-media.sh` | Orchestrates the full capture pipeline |
| `test-screenshot-capture.sh` | Quick test wrapper for screenshot capture |
| `demo-cameras.json` | Demo camera configuration data |

**Quick start:**
```bash
npm install --save-dev playwright && npx playwright install chromium
node scripts/capture-screenshots.js --url http://localhost:8080
```

## Testing Scripts

| Script | Purpose |
|--------|---------|
| `run-integration-tests.sh` | Runs integration tests with go2rtc test streams |
| `run-playwright.sh` | Runs Playwright UI tests |
| `start-test-lightnvr.sh` | Starts lightNVR with test configuration |
| `test-streams.sh` | Manages test RTSP streams via go2rtc |

## Common Workflows

### Fresh Installation

```bash
bash scripts/build.sh --release
bash scripts/build_web_vite.sh
sudo bash scripts/install.sh
sudo bash scripts/install_go2rtc.sh
sudo systemctl start lightnvr
sudo systemctl enable lightnvr
```

### Updating Web Interface Only

```bash
bash scripts/build_web_vite.sh
sudo bash scripts/install_web_assets.sh
sudo systemctl restart lightnvr
```

### Recover go2rtc on existing production host

```bash
sudo bash scripts/fix_go2rtc_production.sh
```

### Generate 8080-Only Camera URLs for Clients

```bash
scripts/list_go2rtc_client_urls.sh --host 172.16.200.108 --port 8080
```

### Updating Application Only

```bash
bash scripts/build.sh --release
sudo systemctl stop lightnvr
sudo cp build/bin/lightnvr /usr/local/bin/
sudo systemctl start lightnvr
```

## Dependencies

**Building C backend:** GCC/Clang, CMake, libsqlite3-dev, libuv1-dev

**Building web frontend:** Node.js (v14+), npm (v6+)

**Screenshot capture:** Node.js, Playwright, Chromium

**Installation:** Root/sudo access, systemd
