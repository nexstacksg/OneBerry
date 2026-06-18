import { setupDetectionCanvasLayout } from '../js/components/preact/detection-overlay-utils.js';

function createCanvas(width, height) {
  return {
    width: 0,
    height: 0,
    clientWidth: width,
    clientHeight: height,
    getContext: () => ({
      clearRect: jest.fn()
    })
  };
}

function createVideo({ width, height, videoWidth, videoHeight }) {
  return {
    clientWidth: width,
    clientHeight: height,
    videoWidth,
    videoHeight
  };
}

describe('detection overlay layout', () => {
  const originalWindow = global.window;

  afterEach(() => {
    global.window = originalWindow;
  });

  test('uses contain math by default', () => {
    const layout = setupDetectionCanvasLayout({
      canvas: createCanvas(1920, 780),
      videoElement: createVideo({
        width: 1920,
        height: 780,
        videoWidth: 1280,
        videoHeight: 960
      })
    });

    expect(layout.drawHeight).toBe(780);
    expect(layout.drawWidth).toBe(1040);
    expect(layout.offsetX).toBe(440);
    expect(layout.offsetY).toBe(0);
  });

  test('uses cover math when the video fills fullscreen width', () => {
    global.window = {
      getComputedStyle: () => ({ objectFit: 'cover' })
    };

    const layout = setupDetectionCanvasLayout({
      canvas: createCanvas(1920, 780),
      videoElement: createVideo({
        width: 1920,
        height: 780,
        videoWidth: 1280,
        videoHeight: 960
      })
    });

    expect(layout.drawWidth).toBe(1920);
    expect(layout.drawHeight).toBe(1440);
    expect(layout.offsetX).toBe(0);
    expect(layout.offsetY).toBe(-330);
  });
});
