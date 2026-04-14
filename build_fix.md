# Fixing Build Errors on Ubuntu Server

If you encounter errors related to `llhttp` or `libmosquitto` during the build process, follow these steps to resolve them.

## 1. Install Missing System Dependencies

The build requires several development libraries. Run the following command to ensure everything is installed:

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  cmake \
  pkg-config \
  libsqlite3-dev \
  libavcodec-dev \
  libavformat-dev \
  libavutil-dev \
  libswscale-dev \
  libcurl4-openssl-dev \
  libmbedtls-dev \
  libuv1-dev \
  libcjson-dev \
  libmosquitto-dev \
  curl \
  wget
```

## 2. Manually Setup llhttp (Offline Fix)

If CMake fails to download `llhttp` from GitHub, use the included archive to set it up manually:

```bash
# Navigate to the project root
cd /home/oneberry-vms/_work/OneBerry/OneBerry

# Create the external directory if it doesn't exist
mkdir -p external/llhttp

# Extract the llhttp archive into the expected directory
# --strip-components=1 removes the top-level folder from the archive
tar -xzf llhttp.tar.gz -C external/llhttp --strip-components=1

# Verify the files are in place
ls -l external/llhttp/src/api.c
```

## 3. Clean and Rebuild

After setting up the dependencies, clean your build directory and try again:

```bash
# Remove old build files
rm -rf build/Release

# Run the build script
bash scripts/build.sh --release
```

## 4. Why did this happen?
- **libmosquitto**: This is needed for MQTT support. If missing, the build will continue but MQTT will be disabled.
- **llhttp**: This is the HTTP parser for the libuv server. The build script tries to download it from GitHub. If the server has restricted internet access or DNS issues, the download fails, leaving the `external/llhttp` directory empty.
