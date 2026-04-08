# Oneberry Quickstart

This guide gets the project running from source on a server and makes it accessible from another device. It also enables built-in motion detection recording.

## What You Need

- Linux host or server
- A separate client device with a browser
- Git
- Node.js and npm for the web build
- Build tools and libraries required by the backend
- FFmpeg libraries, SQLite, libuv, libcurl, mbedTLS, and cJSON

For Debian / Ubuntu, the project build doc lists:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  cmake \
  pkg-config \
  git \
  libsqlite3-dev \
  libavcodec-dev \
  libavformat-dev \
  libavutil-dev \
  libswscale-dev \
  libcurl4-openssl-dev \
  libmbedtls-dev \
  libuv1-dev \
  libcjson-dev \
  curl \
  wget
```

If you are connecting from another device, make sure the server can accept inbound traffic on the ports you plan to use:

- `8080` for the web UI and API
- `8554` for RTSP
- `8555` for WebRTC
- `1984` for go2rtc, if installed

## Build and Install

```bash
git clone https://github.com/opensensor/lightnvr.git
cd lightnvr
git submodule update --init --recursive

# Build the web UI
bash scripts/build_web_vite.sh

# Build the backend
bash scripts/build.sh --release

# Install the service and config
sudo bash scripts/install.sh

# Optional: install go2rtc for WebRTC/HLS restreaming
sudo bash scripts/install_go2rtc.sh
```

The main install script installs the service, config, and any built web assets found in `web/dist/`. If you rebuild the web UI later, rerun `bash scripts/build_web_vite.sh` before reinstalling.

If you are using the packaged install, the service name remains `lightnvr`.

## Start the Service

```bash
sudo systemctl enable --now lightnvr
sudo systemctl status lightnvr
```

Open the web UI in your browser:

- `http://<server-ip>:8080`

If you changed the web port in the config, use that port instead.
If you are on the server itself, `localhost` will work too. From another device, always use the server IP or hostname.

If you use a firewall, allow the same ports on the server.

## Motion Detection Setup

For built-in motion recording, configure each camera stream in the web UI:

1. Open `Streams`
2. Add a stream or edit an existing one
3. Enable `Detection Recording`
4. Set `Detection Model` to `Built-in Motion Detection`
5. Adjust the motion sensitivity if needed
6. Save the stream

Important:

- `Built-in Motion Detection` uses the local frame-based motion detector.
- You do not need ONVIF motion events for this mode.
- If you want motion-triggered clips only, disable continuous recording.
- If you want continuous recording plus motion annotations, keep continuous recording enabled.

## Verify It Works

1. Open the live view for the camera.
2. Move an object in the scene.
3. Confirm the motion grid / overlay appears.
4. Check `Recordings` for a detection recording or event marker.

If motion does not trigger:

- Confirm the stream is running.
- Confirm `Detection Recording` is enabled.
- Confirm the model is exactly `motion` / `Built-in Motion Detection`.
- Lower the sensitivity if the scene is too static.
- Make sure the camera feed has normal keyframes and decoded video.

## Optional Docker Path

If you prefer Docker, follow `docs/INSTALLATION.md` and the repository's Docker instructions instead of the source build path above. Keep the config and data directories mounted as persistent volumes so recordings and the database survive container restarts.

## Notes

- The backend service, config paths, and package names still use `lightnvr`.
- The web UI branding has been updated to `Oneberry`.
- Internal storage keys and config identifiers were left unchanged.
