import {
  CircuitBreaker,
  DEFAULT_INTEGRATION_TIMEOUT_MS,
  getProviderCircuitBreaker,
  IntegrationTimeoutError,
  resolveIntegrationTimeoutMs,
  withTimeout,
} from './resilience';

describe('withTimeout', () => {
  it('resolves when the operation settles before the timeout', async () => {
    await expect(
      withTimeout(() => Promise.resolve('ok'), 1000, 'fast op'),
    ).resolves.toBe('ok');
  });

  it('rejects with IntegrationTimeoutError when the operation is too slow', async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 50));
    await expect(withTimeout(slow, 5, 'slow op')).rejects.toBeInstanceOf(
      IntegrationTimeoutError,
    );
  });

  it('skips the timeout race when timeoutMs is not positive', async () => {
    await expect(
      withTimeout(() => Promise.resolve('ok'), 0, 'no timeout'),
    ).resolves.toBe('ok');
  });
});

describe('resolveIntegrationTimeoutMs', () => {
  const original = process.env.INTEGRATION_HTTP_TIMEOUT_MS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.INTEGRATION_HTTP_TIMEOUT_MS;
    } else {
      process.env.INTEGRATION_HTTP_TIMEOUT_MS = original;
    }
  });

  it('falls back to the default when unset', () => {
    delete process.env.INTEGRATION_HTTP_TIMEOUT_MS;
    expect(resolveIntegrationTimeoutMs()).toBe(DEFAULT_INTEGRATION_TIMEOUT_MS);
  });

  it('uses a valid configured value', () => {
    process.env.INTEGRATION_HTTP_TIMEOUT_MS = '2500';
    expect(resolveIntegrationTimeoutMs()).toBe(2500);
  });

  it('ignores invalid configured values', () => {
    process.env.INTEGRATION_HTTP_TIMEOUT_MS = 'not-a-number';
    expect(resolveIntegrationTimeoutMs()).toBe(DEFAULT_INTEGRATION_TIMEOUT_MS);
  });
});

describe('CircuitBreaker', () => {
  const onOpen = () => new Error('circuit-open');

  it('opens after reaching the failure threshold and fails fast', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      openDurationMs: 1000,
      now: () => 0,
    });
    const failing = () => Promise.reject(new Error('boom'));

    await expect(breaker.execute(failing, { onOpen })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('closed');

    await expect(breaker.execute(failing, { onOpen })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('open');

    // Circuit is open: the operation is never invoked, onOpen error is thrown.
    const operation = jest.fn(() => Promise.resolve('value'));
    await expect(breaker.execute(operation, { onOpen })).rejects.toThrow(
      'circuit-open',
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it('recovers automatically after the cool-down with a successful trial', async () => {
    let clock = 0;
    const breaker = new CircuitBreaker('recover', {
      failureThreshold: 1,
      openDurationMs: 1000,
      now: () => clock,
    });

    await expect(
      breaker.execute(() => Promise.reject(new Error('down')), { onOpen }),
    ).rejects.toThrow('down');
    expect(breaker.getState()).toBe('open');

    // Advance past the cool-down window.
    clock = 1000;
    expect(breaker.getState()).toBe('half-open');

    await expect(
      breaker.execute(() => Promise.resolve('healthy'), { onOpen }),
    ).resolves.toBe('healthy');
    expect(breaker.getState()).toBe('closed');
  });

  it('does not count ignored failures towards opening the circuit', async () => {
    const breaker = new CircuitBreaker('ignore', {
      failureThreshold: 1,
      now: () => 0,
    });

    await expect(
      breaker.execute(() => Promise.reject(new Error('user-specific')), {
        onOpen,
        isFailure: () => false,
      }),
    ).rejects.toThrow('user-specific');
    expect(breaker.getState()).toBe('closed');
  });
});

describe('getProviderCircuitBreaker', () => {
  it('returns the same shared instance per provider', () => {
    const a = getProviderCircuitBreaker('GOOGLE');
    const b = getProviderCircuitBreaker('google');
    expect(a).toBe(b);
  });
});
