# Deploying Oneberry on Proxmox Ubuntu Server

This guide covers the deployment of Oneberry (LightNVR) on an Ubuntu server running as a Virtual Machine (VM) or Linux Container (LXC) on Proxmox VE.

## Recommended Tech Stack

To run Oneberry, you will install and configure the following technologies:

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 22.04 / 24.04 LTS | Base OS for the deployment |
| **Build Tools** | GCC, CMake, pkg-config | Compiling the C backend |
| **Backend Libraries** | FFmpeg, SQLite3, libuv, libcurl | Video processing, database, and networking |
| **Frontend Platform** | Node.js (18+) & npm | Building the Preact web interface |
| **Streaming Engine** | go2rtc (Optional) | High-performance WebRTC and HLS streaming |
| **Process Control** | Systemd | Managing the background service |

---

## 1. Proxmox Setup

### LXC vs. VM
- **LXC**: Lower overhead, easier hardware passthrough for Intel QuickSync (VA-API). Recommended for most users.
- **VM**: Better isolation, slightly more overhead. Use if you need specific kernel features or have plenty of resources.

### Resource Allocation (Minimum)
- **CPU**: 2 Cores (4+ recommended for multiple 4K cameras).
- **RAM**: 2GB (4GB+ recommended).
- **Storage**: 
    - OS: 10GB.
    - Recordings: Allocate based on your retention needs (100GB+ recommended). Use a separate disk mount for recordings if possible.

---

## 2. Server Preparation

Once your Ubuntu instance is running, open the terminal and install the core dependencies:

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
  wget \
  software-properties-common
```

### Install Node.js (for the Web UI)
Use the NodeSource repository for a modern version:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 3. Deployment Steps

### Clone the Repository
```bash
git clone https://github.com/nexstacksg/OneBerry.git
cd OneBerry
git submodule update --init --recursive
```

### Build the Web UI
The web interface is built using Vite and Preact.
```bash
bash scripts/build_web_vite.sh
```

### Build the Backend
Compile the C engine with release optimizations.
```bash
bash scripts/build.sh --release
```

### Install the System Service
This script moves binaries to `/usr/local/bin`, installs a default config to `/etc/lightnvr`, and sets up Systemd.
```bash
sudo bash scripts/install.sh
```

---

## 4. Hardware Acceleration (Optional but Recommended)

If you are using an Intel CPU on Proxmox, you can pass through the iGPU to the Ubuntu server for FFmpeg hardware decoding (VA-API).

1.  **On Proxmox Host**: Ensure `intel-media-va-driver-non-free` is active.
2.  **LXC Passthrough**: Add the following to your LXC config (`/etc/pve/lxc/XXX.conf`):
    ```text
    lxc.cgroup2.devices.allow: c 226:0 rwm
    lxc.cgroup2.devices.allow: c 226:128 rwm
    lxc.mount.entry: /dev/dri dev/dri none bind,optional,create=dir
    ```
3.  **Inside Ubuntu**: Install drivers:
    ```bash
    sudo apt install -y intel-media-va-driver-non-free libva-drm2 libva2
    ```

---

## 5. Network and Access

Oneberry uses the following default ports. Ensure they are open in your Proxmox/Ubuntu firewall:

- **8080**: Web UI & API (Standard access)
- **8554**: RTSP Server
- **8555**: WebRTC (UDP/TCP)
- **1984**: go2rtc API (if installed)

### Start the Service
```bash
sudo systemctl enable --now lightnvr
```

Access the dashboard at `http://your-server-ip:8080`.

---

## Summary of Directories
- **Config**: `/etc/lightnvr/lightnvr.ini`
- **Data (Recordings/DB)**: `/var/lib/lightnvr/`
- **Logs**: `/var/log/lightnvr/lightnvr.log`
- **Binary**: `/usr/local/bin/lightnvr`
