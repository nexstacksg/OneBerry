jest.mock('../js/utils/logger.js', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

import { enhancedFetch } from '../js/fetch-utils.js';

describe('enhancedFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.window = {
      location: {
        pathname: '/index.html'
      },
      _authDisabled: false,
      _demoMode: false
    };
    global.localStorage = {
      removeItem: jest.fn()
    };
    global.document = {
      cookie: ''
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
    delete global.window;
    delete global.localStorage;
    delete global.document;
  });

  test('retries transient network failures with a fresh abort signal', async () => {
    const seenSignals = [];
    global.fetch
      .mockImplementationOnce((url, options) => {
        seenSignals.push(options.signal);
        throw new Error('temporary network failure');
      })
      .mockImplementationOnce((url, options) => {
        seenSignals.push(options.signal);
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK'
        });
      });

    const response = await enhancedFetch('/api/test', {
      retries: 1,
      retryDelay: 0,
      timeout: 1000
    });

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(seenSignals).toHaveLength(2);
    expect(seenSignals[0]).not.toBe(seenSignals[1]);
    expect(seenSignals[1].aborted).toBe(false);
  });

  test('does not retry client errors', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: jest.fn().mockResolvedValue({ error: 'missing' })
    });

    await expect(enhancedFetch('/api/missing', {
      retries: 2,
      retryDelay: 0,
      timeout: 1000
    })).rejects.toMatchObject({
      status: 404,
      message: 'missing'
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('fails immediately when the external signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(enhancedFetch('/api/cancelled', {
      signal: controller.signal,
      retries: 1,
      retryDelay: 0,
      timeout: 1000
    })).rejects.toThrow('Request was cancelled');

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
