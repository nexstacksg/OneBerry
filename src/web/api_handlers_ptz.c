#define _XOPEN_SOURCE
#define _GNU_SOURCE

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "web/api_handlers_ptz.h"
#include "web/api_handlers.h"
#include "web/request_response.h"
#include "web/httpd_utils.h"
#define LOG_COMPONENT "PTZAPI"
#include "core/logger.h"
#include "core/config.h"
#include "core/url_utils.h"
#include "database/db_streams.h"
#include "video/onvif_ptz.h"
#include <cjson/cJSON.h>

/**
 * Helper to get stream config and validate PTZ is enabled
 */
static int get_ptz_stream_config(const char *stream_name, stream_config_t *config) {
    if (!stream_name || !config) {
        return -1;
    }
    
    if (get_stream_config_by_name(stream_name, config) != 0) {
        log_error("Stream not found: %s", stream_name);
        return -1;
    }
    
    if (!config->ptz_enabled) {
        log_error("PTZ not enabled for stream: %s", stream_name);
        return -2;
    }
    
    return 0;
}

/**
 * Helper to build PTZ URL from stream config.
 *
 * Delegates to url_build_onvif_service_url() which handles:
 *   - Scheme mapping: rtsps → https, rtsp/onvif/… → http
 *   - Port mapping: 554 → 80, 322 → 443 (when onvif_port not explicitly set)
 *   - Credential stripping
 */
static int build_onvif_service_url(const stream_config_t *config, const char *service_path,
                                   char *ptz_url, size_t url_size) {
    // codeql[cpp/non-https-url] - Local ONVIF cameras use HTTP; HTTPS only when rtsps:// detected
    return url_build_onvif_service_url(config->url, config->onvif_port,
                                       service_path, ptz_url, url_size);
}

/**
 * Helper to get profile token.
 */
static const char* get_profile_token(const stream_config_t *config) {
    if (config && config->onvif_profile[0] != '\0') {
        return config->onvif_profile;
    }

    return "Profile_1";
}

typedef int (*ptz_url_command_fn)(const char *ptz_url, const char *profile_token,
                                  const stream_config_t *config, void *ctx);

static int execute_ptz_with_service_fallback(const stream_config_t *config,
                                             const char *operation,
                                             ptz_url_command_fn command,
                                             void *ctx) {
    static const char *service_paths[] = {
        "/onvif/ptz_service",
        "/onvif/device_service",
        "/onvif/services",
        "/onvif/service",
        "/onvif/device",
        "/device_service",
        NULL
    };
    const char *profile_token = get_profile_token(config);

    for (int i = 0; service_paths[i]; i++) {
        char ptz_url[512];
        if (build_onvif_service_url(config, service_paths[i], ptz_url, sizeof(ptz_url)) != 0) {
            continue;
        }

        char safe_ptz_url[512];
        if (url_redact_for_logging(ptz_url, safe_ptz_url, sizeof(safe_ptz_url)) != 0) {
            strncpy(safe_ptz_url, "[invalid-url]", sizeof(safe_ptz_url) - 1);
            safe_ptz_url[sizeof(safe_ptz_url) - 1] = '\0';
        }

        log_info("Trying PTZ %s via %s (profile=%s)", operation, safe_ptz_url, profile_token);
        if (command(ptz_url, profile_token, config, ctx) == 0) {
            return 0;
        }
    }

    return -1;
}

typedef struct {
    float pan;
    float tilt;
    float zoom;
} ptz_move_ctx_t;

static int execute_continuous_move_at_url(const char *ptz_url, const char *profile_token,
                                          const stream_config_t *config, void *ctx) {
    const ptz_move_ctx_t *move = (const ptz_move_ctx_t *)ctx;
    return onvif_ptz_continuous_move(ptz_url, profile_token,
                                     config->onvif_username, config->onvif_password,
                                     move->pan, move->tilt, move->zoom);
}

static int execute_stop_at_url(const char *ptz_url, const char *profile_token,
                               const stream_config_t *config, void *ctx) {
    (void)ctx;
    return onvif_ptz_stop(ptz_url, profile_token,
                          config->onvif_username, config->onvif_password,
                          true, true);
}

static int execute_absolute_move_at_url(const char *ptz_url, const char *profile_token,
                                        const stream_config_t *config, void *ctx) {
    const ptz_move_ctx_t *move = (const ptz_move_ctx_t *)ctx;
    return onvif_ptz_absolute_move(ptz_url, profile_token,
                                   config->onvif_username, config->onvif_password,
                                   move->pan, move->tilt, move->zoom);
}

static int execute_relative_move_at_url(const char *ptz_url, const char *profile_token,
                                        const stream_config_t *config, void *ctx) {
    const ptz_move_ctx_t *move = (const ptz_move_ctx_t *)ctx;
    return onvif_ptz_relative_move(ptz_url, profile_token,
                                   config->onvif_username, config->onvif_password,
                                   move->pan, move->tilt, move->zoom);
}

static int execute_goto_home_at_url(const char *ptz_url, const char *profile_token,
                                    const stream_config_t *config, void *ctx) {
    (void)ctx;
    return onvif_ptz_goto_home(ptz_url, profile_token,
                               config->onvif_username, config->onvif_password);
}

static int execute_set_home_at_url(const char *ptz_url, const char *profile_token,
                                   const stream_config_t *config, void *ctx) {
    (void)ctx;
    return onvif_ptz_set_home(ptz_url, profile_token,
                              config->onvif_username, config->onvif_password);
}

typedef struct {
    onvif_ptz_preset_t *presets;
    int max_presets;
    int count;
} ptz_get_presets_ctx_t;

static int execute_get_presets_at_url(const char *ptz_url, const char *profile_token,
                                      const stream_config_t *config, void *ctx) {
    ptz_get_presets_ctx_t *presets_ctx = (ptz_get_presets_ctx_t *)ctx;
    int count = onvif_ptz_get_presets(ptz_url, profile_token,
                                      config->onvif_username, config->onvif_password,
                                      presets_ctx->presets, presets_ctx->max_presets);
    if (count < 0) {
        return -1;
    }
    presets_ctx->count = count;
    return 0;
}

typedef struct {
    const char *preset_token;
} ptz_goto_preset_ctx_t;

static int execute_goto_preset_at_url(const char *ptz_url, const char *profile_token,
                                      const stream_config_t *config, void *ctx) {
    const ptz_goto_preset_ctx_t *preset = (const ptz_goto_preset_ctx_t *)ctx;
    return onvif_ptz_goto_preset(ptz_url, profile_token,
                                 config->onvif_username, config->onvif_password,
                                 preset->preset_token);
}

typedef struct {
    const char *preset_name;
    char *preset_token;
    size_t token_size;
} ptz_set_preset_ctx_t;

static int execute_set_preset_at_url(const char *ptz_url, const char *profile_token,
                                     const stream_config_t *config, void *ctx) {
    ptz_set_preset_ctx_t *preset = (ptz_set_preset_ctx_t *)ctx;
    return onvif_ptz_set_preset(ptz_url, profile_token,
                                config->onvif_username, config->onvif_password,
                                preset->preset_name, preset->preset_token,
                                preset->token_size);
}

typedef struct {
    onvif_ptz_capabilities_t *capabilities;
} ptz_capabilities_ctx_t;

static int execute_get_capabilities_at_url(const char *ptz_url, const char *profile_token,
                                           const stream_config_t *config, void *ctx) {
    ptz_capabilities_ctx_t *caps = (ptz_capabilities_ctx_t *)ctx;
    return onvif_ptz_get_capabilities(ptz_url, profile_token,
                                      config->onvif_username, config->onvif_password,
                                      caps->capabilities);
}

/**
 * Helper to extract stream name from PTZ URL path
 * URL format: /api/streams/{stream_name}/ptz/{action}
 */
static int extract_ptz_stream_name(const http_request_t *req, char *stream_name, size_t name_size) {
    // Extract stream name from URL
    if (http_request_extract_path_param(req, "/api/streams/", stream_name, name_size) != 0) {
        return -1;
    }

    // Remove "/ptz..." suffix from stream_name
    char *ptz_suffix = strstr(stream_name, "/ptz");
    if (ptz_suffix) {
        *ptz_suffix = '\0';
    }

    return 0;
}

void handle_ptz_move(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling POST /api/streams/%s/ptz/move", stream_name);
    
    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }
    
    // Parse request body
    cJSON *body = httpd_parse_json_body(req);
    if (!body) {
        http_response_set_json_error(res, 400, "Invalid JSON body");
        return;
    }
    
    float pan = 0.0f, tilt = 0.0f, zoom = 0.0f;
    cJSON *pan_json = cJSON_GetObjectItem(body, "pan");
    cJSON *tilt_json = cJSON_GetObjectItem(body, "tilt");
    cJSON *zoom_json = cJSON_GetObjectItem(body, "zoom");
    
    if (pan_json && cJSON_IsNumber(pan_json)) pan = (float)pan_json->valuedouble;
    if (tilt_json && cJSON_IsNumber(tilt_json)) tilt = (float)tilt_json->valuedouble;
    if (zoom_json && cJSON_IsNumber(zoom_json)) zoom = (float)zoom_json->valuedouble;
    
    cJSON_Delete(body);
    
    ptz_move_ctx_t move = { pan, tilt, zoom };
    rc = execute_ptz_with_service_fallback(&config, "move",
                                           execute_continuous_move_at_url,
                                           &move);
    
    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ move failed");
        return;
    }
    
    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ move started");

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_stop(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling POST /api/streams/%s/ptz/stop", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    rc = execute_ptz_with_service_fallback(&config, "stop",
                                           execute_stop_at_url,
                                           NULL);

    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ stop failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ stopped");

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_absolute(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling POST /api/streams/%s/ptz/absolute", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    cJSON *body = httpd_parse_json_body(req);
    if (!body) {
        http_response_set_json_error(res, 400, "Invalid JSON body");
        return;
    }

    float pan = 0.0f, tilt = 0.0f, zoom = 0.0f;
    cJSON *pan_json = cJSON_GetObjectItem(body, "pan");
    cJSON *tilt_json = cJSON_GetObjectItem(body, "tilt");
    cJSON *zoom_json = cJSON_GetObjectItem(body, "zoom");

    if (pan_json && cJSON_IsNumber(pan_json)) pan = (float)pan_json->valuedouble;
    if (tilt_json && cJSON_IsNumber(tilt_json)) tilt = (float)tilt_json->valuedouble;
    if (zoom_json && cJSON_IsNumber(zoom_json)) zoom = (float)zoom_json->valuedouble;

    cJSON_Delete(body);

    ptz_move_ctx_t move = { pan, tilt, zoom };
    rc = execute_ptz_with_service_fallback(&config, "absolute move",
                                           execute_absolute_move_at_url, &move);

    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ absolute move failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ absolute move completed");

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_relative(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling POST /api/streams/%s/ptz/relative", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    cJSON *body = httpd_parse_json_body(req);
    if (!body) {
        http_response_set_json_error(res, 400, "Invalid JSON body");
        return;
    }

    float pan = 0.0f, tilt = 0.0f, zoom = 0.0f;
    cJSON *pan_json = cJSON_GetObjectItem(body, "pan");
    cJSON *tilt_json = cJSON_GetObjectItem(body, "tilt");
    cJSON *zoom_json = cJSON_GetObjectItem(body, "zoom");

    if (pan_json && cJSON_IsNumber(pan_json)) pan = (float)pan_json->valuedouble;
    if (tilt_json && cJSON_IsNumber(tilt_json)) tilt = (float)tilt_json->valuedouble;
    if (zoom_json && cJSON_IsNumber(zoom_json)) zoom = (float)zoom_json->valuedouble;

    cJSON_Delete(body);

    ptz_move_ctx_t move = { pan, tilt, zoom };
    rc = execute_ptz_with_service_fallback(&config, "relative move",
                                           execute_relative_move_at_url, &move);

    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ relative move failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ relative move completed");

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_home(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling POST /api/streams/%s/ptz/home", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    rc = execute_ptz_with_service_fallback(&config, "go to home",
                                           execute_goto_home_at_url, NULL);

    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ go to home failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ moved to home position");

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_set_home(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling POST /api/streams/%s/ptz/sethome", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    rc = execute_ptz_with_service_fallback(&config, "set home",
                                           execute_set_home_at_url, NULL);

    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ set home failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ home position set");

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_get_presets(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling GET /api/streams/%s/ptz/presets", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    onvif_ptz_preset_t presets[32];
    ptz_get_presets_ctx_t presets_ctx = { presets, 32, 0 };
    rc = execute_ptz_with_service_fallback(&config, "get presets",
                                           execute_get_presets_at_url, &presets_ctx);
    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ get presets failed");
        return;
    }
    int count = presets_ctx.count;

    cJSON *response = cJSON_CreateObject();
    cJSON *presets_array = cJSON_CreateArray();

    for (int i = 0; i < count; i++) {
        cJSON *preset = cJSON_CreateObject();
        cJSON_AddStringToObject(preset, "token", presets[i].token);
        cJSON_AddStringToObject(preset, "name", presets[i].name);
        cJSON_AddItemToArray(presets_array, preset);
    }

    cJSON_AddItemToObject(response, "presets", presets_array);
    cJSON_AddNumberToObject(response, "count", count);

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_goto_preset(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    // Get preset token from request body
    cJSON *body = httpd_parse_json_body(req);
    if (!body) {
        http_response_set_json_error(res, 400, "Invalid JSON body");
        return;
    }

    cJSON *token_json = cJSON_GetObjectItem(body, "token");
    if (!token_json || !cJSON_IsString(token_json)) {
        cJSON_Delete(body);
        http_response_set_json_error(res, 400, "Missing preset token");
        return;
    }

    char preset_token[64];
    strncpy(preset_token, token_json->valuestring, sizeof(preset_token) - 1);
    preset_token[sizeof(preset_token) - 1] = '\0';
    cJSON_Delete(body);

    log_info("Handling POST /api/streams/%s/ptz/preset (goto %s)", stream_name, preset_token);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    ptz_goto_preset_ctx_t preset_ctx = { preset_token };
    rc = execute_ptz_with_service_fallback(&config, "go to preset",
                                           execute_goto_preset_at_url, &preset_ctx);

    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ go to preset failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ moved to preset");

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_set_preset(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling PUT /api/streams/%s/ptz/preset", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    cJSON *body = httpd_parse_json_body(req);
    if (!body) {
        http_response_set_json_error(res, 400, "Invalid JSON body");
        return;
    }

    const char *preset_name = NULL;
    cJSON *name_json = cJSON_GetObjectItem(body, "name");
    if (name_json && cJSON_IsString(name_json)) {
        preset_name = name_json->valuestring;
    }

    char new_token[64] = {0};
    ptz_set_preset_ctx_t preset_ctx = { preset_name, new_token, sizeof(new_token) };
    rc = execute_ptz_with_service_fallback(&config, "set preset",
                                           execute_set_preset_at_url, &preset_ctx);

    cJSON_Delete(body);

    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ set preset failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "success", true);
    cJSON_AddStringToObject(response, "message", "PTZ preset created");
    cJSON_AddStringToObject(response, "token", new_token);

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}

void handle_ptz_capabilities(const http_request_t *req, http_response_t *res) {
    char stream_name[MAX_STREAM_NAME];
    if (extract_ptz_stream_name(req, stream_name, sizeof(stream_name)) != 0) {
        http_response_set_json_error(res, 400, "Invalid stream name");
        return;
    }

    log_info("Handling GET /api/streams/%s/ptz/capabilities", stream_name);

    stream_config_t config;
    int rc = get_ptz_stream_config(stream_name, &config);
    if (rc == -1) {
        http_response_set_json_error(res, 404, "Stream not found");
        return;
    } else if (rc == -2) {
        http_response_set_json_error(res, 400, "PTZ not enabled for this stream");
        return;
    }

    onvif_ptz_capabilities_t caps = {0};
    ptz_capabilities_ctx_t caps_ctx = { &caps };
    rc = execute_ptz_with_service_fallback(&config, "get capabilities",
                                           execute_get_capabilities_at_url, &caps_ctx);
    if (rc != 0) {
        http_response_set_json_error(res, 500, "PTZ capabilities request failed");
        return;
    }

    cJSON *response = cJSON_CreateObject();
    cJSON_AddBoolToObject(response, "ptz_enabled", config.ptz_enabled);
    cJSON_AddBoolToObject(response, "has_continuous_move", caps.has_continuous_move);
    cJSON_AddBoolToObject(response, "has_absolute_move", caps.has_absolute_move);
    cJSON_AddBoolToObject(response, "has_relative_move", caps.has_relative_move);
    cJSON_AddBoolToObject(response, "has_home_position", caps.has_home_position);
    cJSON_AddBoolToObject(response, "has_presets", caps.has_presets);
    cJSON_AddNumberToObject(response, "max_presets", caps.max_presets);

    cJSON *pan_range = cJSON_CreateObject();
    cJSON_AddNumberToObject(pan_range, "min", caps.pan_min);
    cJSON_AddNumberToObject(pan_range, "max", caps.pan_max);
    cJSON_AddItemToObject(response, "pan_range", pan_range);

    cJSON *tilt_range = cJSON_CreateObject();
    cJSON_AddNumberToObject(tilt_range, "min", caps.tilt_min);
    cJSON_AddNumberToObject(tilt_range, "max", caps.tilt_max);
    cJSON_AddItemToObject(response, "tilt_range", tilt_range);

    cJSON *zoom_range = cJSON_CreateObject();
    cJSON_AddNumberToObject(zoom_range, "min", caps.zoom_min);
    cJSON_AddNumberToObject(zoom_range, "max", caps.zoom_max);
    cJSON_AddItemToObject(response, "zoom_range", zoom_range);

    // Add stream-specific PTZ limits from config
    cJSON_AddNumberToObject(response, "max_x", config.ptz_max_x);
    cJSON_AddNumberToObject(response, "max_y", config.ptz_max_y);
    cJSON_AddNumberToObject(response, "max_z", config.ptz_max_z);
    cJSON_AddBoolToObject(response, "has_home", config.ptz_has_home);

    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);

    http_response_set_json(res, 200, json_str);
    free(json_str);
}
