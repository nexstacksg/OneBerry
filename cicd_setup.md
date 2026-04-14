# CI/CD Setup for Self-Hosted Proxmox Runner

This guide explains how to set up a GitHub Actions self-hosted runner on your Proxmox Ubuntu VM to enable automatic deployment of OneBerry.

## 1. Install the GitHub Actions Runner

1.  Navigate to your GitHub repository: **Settings > Actions > Runners**.
2.  Click **New self-hosted runner**.
3.  Select **Linux** and follow the download/configuration instructions provided by GitHub.
4.  When configuring the runner, you can use the default name or give it a custom one. Add a label like `proxmox` if you have multiple runners.

## 2. Configure Runner Permissions (Sudo)

Since the deployment script (`scripts/install.sh`) and `systemctl` require root privileges, the runner user must be able to execute them via `sudo` without a password.

Assuming your runner user is named `runner`:

1.  Open the sudoers file:
    ```bash
    sudo visudo
    ```
2.  Add the following line at the end of the file (replace `runner` with your actual username):
    ```text
    runner ALL=(ALL) NOPASSWD: /usr/bin/bash /home/runner/actions-runner/_work/OneBerry/OneBerry/scripts/install.sh, /usr/bin/systemctl restart lightnvr, /usr/bin/systemctl status lightnvr
    ```
    *Note: Adjust the path to `install.sh` based on where your runner is installed.*

Alternatively, for simplicity (but less security), you can allow the runner to run all sudo commands without a password:
```text
runner ALL=(ALL) NOPASSWD:ALL
```

## 3. Install Build Prerequisites

Ensure the runner environment has all necessary tools:

```bash
sudo apt-get update
sudo apt-get install -y build-essential cmake pkg-config libsqlite3-dev \
    libavcodec-dev libavformat-dev libavutil-dev libswscale-dev \
    libcurl4-openssl-dev libmbedtls-dev libuv1-dev libcjson-dev curl wget

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 4. How it Works

1.  Every time you **push** to the `main` branch, the workflow [deploy-self-hosted.yml](.github/workflows/deploy-self-hosted.yml) triggers.
2.  The runner pulls the latest code, including submodules.
3.  It builds the Web UI assets (`web/dist/`).
4.  It compiles the C backend (`build/Release/bin/lightnvr`).
5.  It runs the installation script to update `/usr/local/bin` and `/var/lib/lightnvr/www`.
6.  Finally, it restarts the `lightnvr` service to apply changes.

## Troubleshooting

- **Permissions Error**: If the workflow fails on the `sudo` step, double-check your `/etc/sudoers` entry.
- **Node.js missing**: Ensure `node` and `npm` are in the PATH of the runner service. You may need to restart the runner after installing Node.js.
- **Service Name**: The workflow assumes the service is named `lightnvr`. If you customized this, update the workflow file accordingly.
