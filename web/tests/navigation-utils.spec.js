import { forceNavigation, navigateToAppPage } from '../js/utils/navigation-utils.js';

describe('navigation-utils', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    jest.useFakeTimers();
    global.window = {
      location: {
        href: 'http://localhost/index.html',
        origin: 'http://localhost',
      },
      history: {
        pushState: jest.fn(),
      },
      dispatchEvent: jest.fn(),
      __oneberrySpaMounted: false,
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    global.window = originalWindow;
  });

  test('defers navigation until the current event queue finishes', () => {
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    const result = forceNavigation('timeline.html?stream=front_door', event);

    expect(result).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe('http://localhost/index.html');

    jest.runAllTimers();

    expect(window.location.href).toBe('timeline.html?stream=front_door');
  });

  test('does nothing when no destination URL is provided', () => {
    forceNavigation('', null);

    jest.runAllTimers();

    expect(window.location.href).toBe('http://localhost/index.html');
  });

  test('uses history navigation when the SPA shell is mounted', () => {
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };
    window.__oneberrySpaMounted = true;

    const result = navigateToAppPage('recordings.html?stream=front_door', event);

    expect(result).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(window.history.pushState).toHaveBeenCalledWith({}, '', '/recordings.html?stream=front_door');
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent.mock.calls[0][0].type).toBe('oneberry:navigate');
    expect(window.location.href).toBe('http://localhost/index.html');
  });
});
