export const DEFAULT_API_DETECTION_BACKEND = 'onnx';

export const API_DETECTION_BACKENDS = Object.freeze({
  onnx: {
    value: 'onnx',
    implemented: true
  },
  opencv: {
    value: 'opencv',
    implemented: true
  },
  tflite: {
    value: 'tflite',
    implemented: false
  }
});

export function isApiDetectionBackendImplemented(value) {
  return API_DETECTION_BACKENDS[value]?.implemented === true;
}

export function normalizeApiDetectionBackend(value) {
  return isApiDetectionBackendImplemented(value) ? value : DEFAULT_API_DETECTION_BACKEND;
}
