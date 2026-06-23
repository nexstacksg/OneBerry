#define _GNU_SOURCE
#define _POSIX_C_SOURCE 200112L

#include "web/api_handlers_discovery.h"
#include "web/httpd_utils.h"
#include "web/request_response.h"
#include "core/config.h"
#include "core/url_utils.h"
#include "video/onvif_discovery.h"
#include "video/onvif_discovery_network.h"

#define LOG_COMPONENT "DiscoveryAPI"
#include "core/logger.h"

#include <arpa/inet.h>
#include <cjson/cJSON.h>
#include <errno.h>
#include <fcntl.h>
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <inttypes.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#define MAX_UNIVERSAL_DEVICES 128
#define MAX_SCAN_HOSTS 1024
#define MAX_RTSP_PORTS 3
#define RTSP_DISCOVERY_CONNECT_TIMEOUT_MS 45

typedef struct {
    char ip_address[64];
    char device_type[32];
    char manufacturer[64];
    char model[64];
    char status[64];
    char action[32];
    char onvif_service_url[MAX_URL_LENGTH];
    int rtsp_ports[MAX_RTSP_PORTS];
    int rtsp_port_count;
    bool onvif;
    bool rtsp;
} discovered_camera_t;

typedef struct {
    int width;
    int height;
    double fps;
    char codec[64];
} rtsp_stream_info_t;

typedef struct {
    pthread_mutex_t mutex;
    bool running;
    bool completed;
    unsigned int scan_id;
    char network[64];
    char error[128];
    discovered_camera_t devices[MAX_UNIVERSAL_DEVICES];
    int count;
} discovery_scan_state_t;

typedef struct {
    char network[64];
    bool include_onvif;
    bool include_rtsp;
    unsigned int scan_id;
} discovery_scan_job_t;

static const int RTSP_PORTS[] = {554, 8554, 10554};
static discovery_scan_state_t g_camera_discovery = {
    .mutex = PTHREAD_MUTEX_INITIALIZER
};

static const char *COMMON_RTSP_PATHS[] = {
    "/stream1",
    "/live",
    "/ch0_0.h264",
    "/cam/realmonitor?channel=1&subtype=0",
    "/Streaming/Channels/101",
    "/h264Preview_01_main",
    NULL
};

static int is_port_open(const char *ip_addr, int port, int timeout_ms) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        return 0;
    }

    long flags = fcntl(sock, F_GETFL, 0);
    if (flags >= 0) {
        fcntl(sock, F_SETFL, flags | O_NONBLOCK);
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    if (inet_aton(ip_addr, &addr.sin_addr) == 0) {
        close(sock);
        return 0;
    }

    int res = connect(sock, (struct sockaddr *)&addr, sizeof(addr));
    if (res == 0) {
        close(sock);
        return 1;
    }

    if (errno != EINPROGRESS) {
        close(sock);
        return 0;
    }

    fd_set writefds;
    FD_ZERO(&writefds);
    FD_SET(sock, &writefds);

    struct timeval tv;
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (long)(timeout_ms % 1000) * 1000;

    res = select(sock + 1, NULL, &writefds, NULL, &tv);
    if (res > 0) {
        int so_error = 0;
        socklen_t len = sizeof(so_error);
        getsockopt(sock, SOL_SOCKET, SO_ERROR, &so_error, &len);
        close(sock);
        return so_error == 0;
    }

    close(sock);
    return 0;
}

static int resolve_scan_network(const char *requested_network, char *network, size_t network_size) {
    if (requested_network && requested_network[0] != '\0' && strcmp(requested_network, "auto") != 0) {
        snprintf(network, network_size, "%s", requested_network);
        return 0;
    }

    if (g_config.onvif_discovery_network[0] != '\0' &&
        strcmp(g_config.onvif_discovery_network, "auto") != 0) {
        snprintf(network, network_size, "%s", g_config.onvif_discovery_network);
        return 0;
    }

    char detected_networks[10][64];
    int count = detect_local_networks(detected_networks, 10);
    if (count <= 0) {
        return -1;
    }

    snprintf(network, network_size, "%s", detected_networks[0]);
    return 0;
}

static int find_device_by_ip(discovered_camera_t *devices, int count, const char *ip) {
    for (int i = 0; i < count; i++) {
        if (strcmp(devices[i].ip_address, ip) == 0) {
            return i;
        }
    }
    return -1;
}

static void add_rtsp_port(discovered_camera_t *device, int port) {
    for (int i = 0; i < device->rtsp_port_count; i++) {
        if (device->rtsp_ports[i] == port) {
            return;
        }
    }
    if (device->rtsp_port_count < MAX_RTSP_PORTS) {
        device->rtsp_ports[device->rtsp_port_count++] = port;
    }
}

static void set_unknown(char *dst, size_t size) {
    snprintf(dst, size, "%s", "Unknown");
}

static void append_onvif_device(discovered_camera_t *devices, int *count, const onvif_device_info_t *onvif) {
    if (!onvif || onvif->ip_address[0] == '\0') {
        return;
    }

    int index = find_device_by_ip(devices, *count, onvif->ip_address);
    if (index < 0) {
        if (*count >= MAX_UNIVERSAL_DEVICES) {
            return;
        }
        index = (*count)++;
        memset(&devices[index], 0, sizeof(devices[index]));
        snprintf(devices[index].ip_address, sizeof(devices[index].ip_address), "%s", onvif->ip_address);
    }

    discovered_camera_t *device = &devices[index];
    device->onvif = true;
    snprintf(device->device_type, sizeof(device->device_type), "%s",
             device->rtsp ? "ONVIF + RTSP Camera" : "ONVIF Camera");
    snprintf(device->manufacturer, sizeof(device->manufacturer), "%s",
             onvif->manufacturer[0] ? onvif->manufacturer : "Unknown");
    snprintf(device->model, sizeof(device->model), "%s",
             onvif->model[0] ? onvif->model : "Unknown");
    snprintf(device->status, sizeof(device->status), "%s", "Discovered");
    snprintf(device->action, sizeof(device->action), "%s", "Connect");
    snprintf(device->onvif_service_url, sizeof(device->onvif_service_url), "%s",
             onvif->device_service[0] ? onvif->device_service : onvif->endpoint);
}

static void append_rtsp_device(discovered_camera_t *devices, int *count, const char *ip, int port) {
    int index = find_device_by_ip(devices, *count, ip);
    if (index < 0) {
        if (*count >= MAX_UNIVERSAL_DEVICES) {
            return;
        }
        index = (*count)++;
        memset(&devices[index], 0, sizeof(devices[index]));
        snprintf(devices[index].ip_address, sizeof(devices[index].ip_address), "%s", ip);
        set_unknown(devices[index].manufacturer, sizeof(devices[index].manufacturer));
        set_unknown(devices[index].model, sizeof(devices[index].model));
    }

    discovered_camera_t *device = &devices[index];
    device->rtsp = true;
    add_rtsp_port(device, port);
    snprintf(device->device_type, sizeof(device->device_type), "%s",
             device->onvif ? "ONVIF + RTSP Camera" : "RTSP Device");
    if (!device->status[0] || strcmp(device->status, "Discovered") != 0) {
        snprintf(device->status, sizeof(device->status), "%s", "RTSP Found");
    }
    snprintf(device->action, sizeof(device->action), "%s", "Connect");
}

static void publish_discovery_device(unsigned int scan_id, const discovered_camera_t *device) {
    if (!device || device->ip_address[0] == '\0') {
        return;
    }

    pthread_mutex_lock(&g_camera_discovery.mutex);
    if (g_camera_discovery.scan_id == scan_id) {
        int index = find_device_by_ip(g_camera_discovery.devices, g_camera_discovery.count, device->ip_address);
        if (index < 0 && g_camera_discovery.count < MAX_UNIVERSAL_DEVICES) {
            index = g_camera_discovery.count++;
            memset(&g_camera_discovery.devices[index], 0, sizeof(g_camera_discovery.devices[index]));
        }
        if (index >= 0) {
            g_camera_discovery.devices[index] = *device;
        }
    }
    pthread_mutex_unlock(&g_camera_discovery.mutex);
}

static cJSON *device_to_json(const discovered_camera_t *device) {
    cJSON *item = cJSON_CreateObject();
    if (!item) {
        return NULL;
    }

    cJSON_AddStringToObject(item, "ip_address", device->ip_address);
    cJSON_AddStringToObject(item, "device_type", device->device_type[0] ? device->device_type : "RTSP Device");
    cJSON_AddStringToObject(item, "manufacturer", device->manufacturer[0] ? device->manufacturer : "Unknown");
    cJSON_AddStringToObject(item, "model", device->model[0] ? device->model : "Unknown");
    cJSON_AddStringToObject(item, "status", device->status[0] ? device->status : "RTSP Found");
    cJSON_AddStringToObject(item, "action", device->action[0] ? device->action : "Connect");
    cJSON_AddBoolToObject(item, "onvif", device->onvif);
    cJSON_AddBoolToObject(item, "rtsp", device->rtsp);
    cJSON_AddStringToObject(item, "device_service", device->onvif_service_url);
    cJSON_AddStringToObject(item, "endpoint", device->onvif_service_url);

    cJSON *ports = cJSON_AddArrayToObject(item, "rtsp_ports");
    if (ports) {
        for (int i = 0; i < device->rtsp_port_count; i++) {
            cJSON_AddItemToArray(ports, cJSON_CreateNumber(device->rtsp_ports[i]));
        }
    }

    return item;
}

static int scan_rtsp_devices(const char *network, discovered_camera_t *devices, int *count, unsigned int scan_id) {
    uint32_t base_addr = 0;
    uint32_t subnet_mask = 0;

    if (parse_network(network, &base_addr, &subnet_mask) != 0) {
        return -1;
    }

    uint32_t network_addr = base_addr & subnet_mask;
    uint32_t broadcast = network_addr | ~subnet_mask;
    uint64_t host_count = broadcast > network_addr ? (uint64_t)(broadcast - network_addr - 1) : 0;
    if (host_count > MAX_SCAN_HOSTS) {
        log_warn("RTSP discovery scan for %s has %" PRIu64 " hosts; limiting to %d", network, host_count, MAX_SCAN_HOSTS);
        host_count = MAX_SCAN_HOSTS;
    }

    for (uint64_t offset = 1; offset <= host_count && *count < MAX_UNIVERSAL_DEVICES; offset++) {
        struct in_addr addr;
        addr.s_addr = htonl(network_addr + (uint32_t)offset);
        const char *ip = inet_ntoa(addr);
        if (!ip) {
            continue;
        }

        char ip_copy[64];
        snprintf(ip_copy, sizeof(ip_copy), "%s", ip);

        for (size_t p = 0; p < sizeof(RTSP_PORTS) / sizeof(RTSP_PORTS[0]); p++) {
            if (is_port_open(ip_copy, RTSP_PORTS[p], RTSP_DISCOVERY_CONNECT_TIMEOUT_MS)) {
                append_rtsp_device(devices, count, ip_copy, RTSP_PORTS[p]);
                int index = find_device_by_ip(devices, *count, ip_copy);
                if (index >= 0) {
                    publish_discovery_device(scan_id, &devices[index]);
                }
            }
        }
    }

    return 0;
}

static int validate_rtsp_stream(const char *url, rtsp_stream_info_t *info, char *error_msg, size_t error_size) {
    AVFormatContext *format_ctx = NULL;
    AVDictionary *options = NULL;
    int video_stream_index = -1;
    int ret = -1;

    av_dict_set(&options, "rtsp_transport", "tcp", 0);
    av_dict_set(&options, "timeout", "5000000", 0);

    ret = avformat_open_input(&format_ctx, url, NULL, &options);
    if (ret < 0) {
        av_strerror(ret, error_msg, error_size);
        goto cleanup;
    }

    ret = avformat_find_stream_info(format_ctx, NULL);
    if (ret < 0) {
        av_strerror(ret, error_msg, error_size);
        goto cleanup;
    }

    for (unsigned int i = 0; i < format_ctx->nb_streams; i++) {
        if (format_ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            video_stream_index = (int)i;
            break;
        }
    }

    if (video_stream_index < 0) {
        snprintf(error_msg, error_size, "%s", "No video stream found");
        ret = -1;
        goto cleanup;
    }

    AVStream *video_stream = format_ctx->streams[video_stream_index];
    AVCodecParameters *codec_params = video_stream->codecpar;
    const AVCodec *codec = avcodec_find_decoder(codec_params->codec_id);

    info->width = codec_params->width;
    info->height = codec_params->height;
    info->fps = 0.0;
    if (video_stream->avg_frame_rate.den && video_stream->avg_frame_rate.num) {
        info->fps = (double)video_stream->avg_frame_rate.num / (double)video_stream->avg_frame_rate.den;
    }
    snprintf(info->codec, sizeof(info->codec), "%s", codec ? codec->name : "unknown");
    ret = 0;

cleanup:
    if (options) {
        av_dict_free(&options);
    }
    if (format_ctx) {
        avformat_close_input(&format_ctx);
    }
    return ret;
}

static void build_rtsp_url(char *dst, size_t size, const char *ip, int port, const char *path) {
    const char *normalized_path = path && path[0] == '/' ? path : "/";
    snprintf(dst, size, "rtsp://%s:%d%s", ip, port, normalized_path);
}

static char *build_discovery_status_json_locked(void) {
    cJSON *root = cJSON_CreateObject();
    cJSON *array = root ? cJSON_AddArrayToObject(root, "devices") : NULL;
    if (!root || !array) {
        cJSON_Delete(root);
        return NULL;
    }

    cJSON_AddBoolToObject(root, "running", g_camera_discovery.running);
    cJSON_AddBoolToObject(root, "completed", g_camera_discovery.completed);
    cJSON_AddNumberToObject(root, "scan_id", (double)g_camera_discovery.scan_id);
    cJSON_AddStringToObject(root, "network", g_camera_discovery.network);
    cJSON_AddStringToObject(root, "error", g_camera_discovery.error);
    cJSON_AddNumberToObject(root, "count", g_camera_discovery.count);

    for (int i = 0; i < g_camera_discovery.count; i++) {
        cJSON *item = device_to_json(&g_camera_discovery.devices[i]);
        if (item) {
            cJSON_AddItemToArray(array, item);
        }
    }

    char *json = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    return json;
}

static void *discovery_scan_worker(void *arg) {
    discovery_scan_job_t *job = (discovery_scan_job_t *)arg;
    if (!job) {
        return NULL;
    }

    discovered_camera_t devices[MAX_UNIVERSAL_DEVICES];
    memset(devices, 0, sizeof(devices));
    int count = 0;

    if (job->include_onvif) {
        onvif_device_info_t onvif_devices[32];
        int onvif_count = discover_onvif_devices(job->network, onvif_devices, 32);
        if (onvif_count > 0) {
            for (int i = 0; i < onvif_count; i++) {
                append_onvif_device(devices, &count, &onvif_devices[i]);
                int index = find_device_by_ip(devices, count, onvif_devices[i].ip_address);
                if (index >= 0) {
                    publish_discovery_device(job->scan_id, &devices[index]);
                }
            }
        }
    }

    if (job->include_rtsp) {
        scan_rtsp_devices(job->network, devices, &count, job->scan_id);
    }

    pthread_mutex_lock(&g_camera_discovery.mutex);
    if (g_camera_discovery.scan_id == job->scan_id) {
        g_camera_discovery.running = false;
        g_camera_discovery.completed = true;
    }
    pthread_mutex_unlock(&g_camera_discovery.mutex);

    free(job);
    return NULL;
}

void handle_post_discover_cameras(const http_request_t *req, http_response_t *res) {
    cJSON *body = httpd_parse_json_body(req);
    if (!body) {
        http_response_set_json_error(res, 400, "Invalid JSON request");
        return;
    }

    const cJSON *network_json = cJSON_GetObjectItem(body, "network");
    const cJSON *include_onvif_json = cJSON_GetObjectItem(body, "include_onvif");
    const cJSON *include_rtsp_json = cJSON_GetObjectItem(body, "include_rtsp");

    const char *requested_network = cJSON_IsString(network_json) ? network_json->valuestring : "auto";
    bool include_onvif = !cJSON_IsBool(include_onvif_json) || cJSON_IsTrue(include_onvif_json);
    bool include_rtsp = !cJSON_IsBool(include_rtsp_json) || cJSON_IsTrue(include_rtsp_json);

    char scan_network[64];
    if (resolve_scan_network(requested_network, scan_network, sizeof(scan_network)) != 0) {
        cJSON_Delete(body);
        http_response_set_json_error(res, 400, "Unable to determine discovery network");
        return;
    }

    discovery_scan_job_t *job = calloc(1, sizeof(*job));
    if (!job) {
        cJSON_Delete(body);
        http_response_set_json_error(res, 500, "Failed to start discovery");
        return;
    }

    pthread_mutex_lock(&g_camera_discovery.mutex);
    unsigned int scan_id = ++g_camera_discovery.scan_id;
    memset(g_camera_discovery.devices, 0, sizeof(g_camera_discovery.devices));
    g_camera_discovery.count = 0;
    g_camera_discovery.running = true;
    g_camera_discovery.completed = false;
    g_camera_discovery.error[0] = '\0';
    snprintf(g_camera_discovery.network, sizeof(g_camera_discovery.network), "%s", scan_network);
    pthread_mutex_unlock(&g_camera_discovery.mutex);

    snprintf(job->network, sizeof(job->network), "%s", scan_network);
    job->include_onvif = include_onvif;
    job->include_rtsp = include_rtsp;
    job->scan_id = scan_id;

    pthread_t thread;
    int thread_result = pthread_create(&thread, NULL, discovery_scan_worker, job);
    if (thread_result != 0) {
        pthread_mutex_lock(&g_camera_discovery.mutex);
        g_camera_discovery.running = false;
        g_camera_discovery.completed = true;
        snprintf(g_camera_discovery.error, sizeof(g_camera_discovery.error), "%s", "Failed to create discovery thread");
        pthread_mutex_unlock(&g_camera_discovery.mutex);
        free(job);
        cJSON_Delete(body);
        http_response_set_json_error(res, 500, "Failed to start discovery");
        return;
    }
    pthread_detach(thread);

    pthread_mutex_lock(&g_camera_discovery.mutex);
    char *json = build_discovery_status_json_locked();
    pthread_mutex_unlock(&g_camera_discovery.mutex);
    cJSON_Delete(body);
    if (!json) {
        http_response_set_json_error(res, 500, "Failed to serialize discovery response");
        return;
    }

    http_response_set_json(res, 200, json);
    free(json);
}

void handle_get_discover_cameras_status(const http_request_t *req, http_response_t *res) {
    (void)req;

    pthread_mutex_lock(&g_camera_discovery.mutex);
    char *json = build_discovery_status_json_locked();
    pthread_mutex_unlock(&g_camera_discovery.mutex);

    if (!json) {
        http_response_set_json_error(res, 500, "Failed to serialize discovery response");
        return;
    }

    http_response_set_json(res, 200, json);
    free(json);
}

void handle_post_validate_rtsp_device(const http_request_t *req, http_response_t *res) {
    cJSON *body = httpd_parse_json_body(req);
    if (!body) {
        http_response_set_json_error(res, 400, "Invalid JSON request");
        return;
    }

    const cJSON *ip_json = cJSON_GetObjectItem(body, "ip_address");
    const cJSON *port_json = cJSON_GetObjectItem(body, "port");
    const cJSON *username_json = cJSON_GetObjectItem(body, "username");
    const cJSON *password_json = cJSON_GetObjectItem(body, "password");

    if (!cJSON_IsString(ip_json) || ip_json->valuestring[0] == '\0') {
        cJSON_Delete(body);
        http_response_set_json_error(res, 400, "Missing ip_address");
        return;
    }

    const char *ip = ip_json->valuestring;
    int port = cJSON_IsNumber(port_json) ? port_json->valueint : 554;
    const char *username = cJSON_IsString(username_json) ? username_json->valuestring : NULL;
    const char *password = cJSON_IsString(password_json) ? password_json->valuestring : NULL;

    cJSON *root = cJSON_CreateObject();
    cJSON *attempts = root ? cJSON_AddArrayToObject(root, "attempts") : NULL;
    if (!root || !attempts) {
        cJSON_Delete(body);
        cJSON_Delete(root);
        http_response_set_json_error(res, 500, "Failed to create RTSP validation response");
        return;
    }

    bool success = false;
    char selected_url[MAX_URL_LENGTH] = {0};
    rtsp_stream_info_t selected_info;
    memset(&selected_info, 0, sizeof(selected_info));
    char last_error[256] = {0};

    for (int i = 0; COMMON_RTSP_PATHS[i] != NULL && !success; i++) {
        char raw_url[MAX_URL_LENGTH];
        char credentialed_url[MAX_URL_LENGTH];
        char safe_url[MAX_URL_LENGTH];
        char error_msg[256] = {0};
        rtsp_stream_info_t info;
        memset(&info, 0, sizeof(info));

        build_rtsp_url(raw_url, sizeof(raw_url), ip, port, COMMON_RTSP_PATHS[i]);
        if (url_apply_credentials(raw_url, username, password, credentialed_url, sizeof(credentialed_url)) != 0) {
            snprintf(credentialed_url, sizeof(credentialed_url), "%s", raw_url);
        }
        if (url_redact_for_logging(credentialed_url, safe_url, sizeof(safe_url)) != 0) {
            snprintf(safe_url, sizeof(safe_url), "%s", "rtsp://[invalid]");
        }

        int result = validate_rtsp_stream(credentialed_url, &info, error_msg, sizeof(error_msg));
        cJSON *attempt = cJSON_CreateObject();
        if (attempt) {
            cJSON_AddStringToObject(attempt, "url", safe_url);
            cJSON_AddBoolToObject(attempt, "success", result == 0);
            if (result != 0) {
                cJSON_AddStringToObject(attempt, "message", error_msg);
            }
            cJSON_AddItemToArray(attempts, attempt);
        }

        if (result == 0) {
            success = true;
            snprintf(selected_url, sizeof(selected_url), "%s", credentialed_url);
            selected_info = info;
        } else {
            snprintf(last_error, sizeof(last_error), "%s", error_msg);
        }
    }

    cJSON_AddBoolToObject(root, "success", success);
    if (success) {
        char safe_selected_url[MAX_URL_LENGTH];
        if (url_redact_for_logging(selected_url, safe_selected_url, sizeof(safe_selected_url)) != 0) {
            snprintf(safe_selected_url, sizeof(safe_selected_url), "%s", "rtsp://[invalid]");
        }

        cJSON_AddStringToObject(root, "url", selected_url);
        cJSON_AddStringToObject(root, "safe_url", safe_selected_url);
        cJSON_AddStringToObject(root, "status", "Valid RTSP Stream");

        cJSON *info = cJSON_AddObjectToObject(root, "info");
        if (info) {
            cJSON_AddNumberToObject(info, "width", selected_info.width);
            cJSON_AddNumberToObject(info, "height", selected_info.height);
            cJSON_AddNumberToObject(info, "fps", (int)selected_info.fps);
            cJSON_AddStringToObject(info, "codec", selected_info.codec);
        }
    } else {
        cJSON_AddStringToObject(root, "status", "Validation Failed");
        cJSON_AddStringToObject(root, "message", last_error[0] ? last_error : "No common RTSP path opened successfully");
    }

    char *json = cJSON_PrintUnformatted(root);
    cJSON_Delete(body);
    cJSON_Delete(root);
    if (!json) {
        http_response_set_json_error(res, 500, "Failed to serialize RTSP validation response");
        return;
    }

    http_response_set_json(res, 200, json);
    free(json);
}
