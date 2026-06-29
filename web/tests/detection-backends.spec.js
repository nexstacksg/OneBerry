import {
  DEFAULT_API_DETECTION_BACKEND,
  isApiDetectionBackendImplemented,
  normalizeApiDetectionBackend
} from '../js/utils/detection-backends.js';

describe('detection backend policy', () => {
  test('keeps implemented external API backend values', () => {
    expect(normalizeApiDetectionBackend('onnx')).toBe('onnx');
    expect(normalizeApiDetectionBackend('opencv')).toBe('opencv');
  });

  test('falls back when backend is missing or incomplete', () => {
    expect(normalizeApiDetectionBackend('tflite')).toBe(DEFAULT_API_DETECTION_BACKEND);
    expect(normalizeApiDetectionBackend('unknown')).toBe(DEFAULT_API_DETECTION_BACKEND);
    expect(normalizeApiDetectionBackend(undefined)).toBe(DEFAULT_API_DETECTION_BACKEND);
  });

  test('marks TensorFlow Lite as not implemented', () => {
    expect(isApiDetectionBackendImplemented('tflite')).toBe(false);
  });
});
