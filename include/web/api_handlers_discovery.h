#ifndef API_HANDLERS_DISCOVERY_H
#define API_HANDLERS_DISCOVERY_H

#include "web/request_response.h"

/**
 * @brief Discover ONVIF and RTSP-capable cameras on a local network.
 *
 * POST /api/discovery/cameras
 */
void handle_post_discover_cameras(const http_request_t *req, http_response_t *res);

/**
 * @brief Validate common RTSP stream paths for one discovered host.
 *
 * POST /api/discovery/rtsp/validate
 */
void handle_post_validate_rtsp_device(const http_request_t *req, http_response_t *res);

#endif /* API_HANDLERS_DISCOVERY_H */
