#ifndef API_HANDLERS_SETTINGS_H
#define API_HANDLERS_SETTINGS_H

#include "web/web_server.h"

/**
 * Handle GET request for settings
 */
void handle_get_settings(const http_request_t *request, http_response_t *response);

/**
 * Handle POST request for settings
 */
void handle_post_settings(const http_request_t *request, http_response_t *response);

/**
 * Handle GET request for the manual building/area catalog
 */
void handle_get_locations(const http_request_t *request, http_response_t *response);

/**
 * Handle PUT request for the manual building/area catalog
 */
void handle_put_locations(const http_request_t *request, http_response_t *response);

/**
 * Handle GET request for Live View sidebar layouts
 */
void handle_get_live_layouts(const http_request_t *request, http_response_t *response);

/**
 * Handle PUT request for Live View sidebar layouts
 */
void handle_put_live_layouts(const http_request_t *request, http_response_t *response);

#endif /* API_HANDLERS_SETTINGS_H */
