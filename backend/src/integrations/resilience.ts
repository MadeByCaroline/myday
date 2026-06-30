import { Logger } from '@nestjs/common';

/**
 * Default strict timeout applied to outgoing third-party requests so that a
 * slow Google/Microsoft/AI dependency can never block the NestJS event loop.
 */
export const DEFAULT_INTEGRATION_TIMEOUT_MS = 10_000;

/**
 * Resolve the configured outgoing-request timeout. Reading the value lazily
 * keeps the helpers dependency-free so they can be reused from any service or
 * client without extra DI wiring.
 */
export function resolveIntegrationTimeoutMs(): number {
  const raw = process.env.INTEGRATION_HTTP_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_INTEGRATION_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_INTEGRATION_TIMEOUT_MS;
  }

  return parsed;
}

export class IntegrationTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'IntegrationTimeoutError';
  }
}

/**
 * Race an asynchronous operation against a strict timeout. The returned promise
 * rejects with an {@link IntegrationTimeoutError} if the operation does not
 * settle in time, ensuring no outbound call can hang indefinitely.
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation();
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new IntegrationTimeoutError(label, timeoutMs));
        }, timeoutMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive failures required before the circuit opens. */
  failureThreshold?: number;
  /** How long the circuit stays open before allowing a trial request. */
  openDurationMs?: number;
  /** Injectable clock, primarily for deterministic tests. */
  now?: () => number;
}

export interface CircuitBreakerExecuteOptions {
  /** Error to throw immediately while the circuit is open. */
  onOpen: () => Error;
  /**
   * Predicate deciding whether a thrown error should count towards opening the
   * circuit. Errors that are caller/user specific (e.g. expired credentials)
   * should not trip the breaker for every other user.
   */
  isFailure?: (error: unknown) => boolean;
}

/**
 * Minimal circuit breaker. Once a dependency fails repeatedly the circuit
 * "opens" and subsequent calls fail fast (via {@link CircuitBreakerExecuteOptions.onOpen})
 * instead of piling up against an unhealthy service. After a cool-down period a
 * single trial request is allowed; success closes the circuit again, enabling
 * automatic recovery once the third-party service is healthy.
 */
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private readonly now: () => number;

  private failureCount = 0;
  private state: CircuitState = 'closed';
  private nextAttemptAt = 0;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.openDurationMs = options.openDurationMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  getState(): CircuitState {
    if (this.state === 'open' && this.now() >= this.nextAttemptAt) {
      this.state = 'half-open';
    }
    return this.state;
  }

  async execute<T>(
    operation: () => Promise<T>,
    options: CircuitBreakerExecuteOptions,
  ): Promise<T> {
    if (this.getState() === 'open') {
      throw options.onOpen();
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      const isFailure = options.isFailure ?? (() => true);
      if (isFailure(error)) {
        this.recordFailure();
      }
      throw error;
    }
  }

  private recordSuccess(): void {
    if (this.state !== 'closed' || this.failureCount > 0) {
      this.logger.log(`Circuit "${this.name}" closed (dependency recovered).`);
    }
    this.failureCount = 0;
    this.state = 'closed';
  }

  private recordFailure(): void {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttemptAt = this.now() + this.openDurationMs;
      this.logger.warn(
        `Circuit "${this.name}" opened after ${this.failureCount} consecutive failures; ` +
          `pausing calls for ${this.openDurationMs}ms.`,
      );
    }
  }
}

const breakerRegistry = new Map<string, CircuitBreaker>();

/**
 * Return a process-wide circuit breaker keyed by provider so that every service
 * instance shares the same health view of a third-party dependency.
 */
export function getProviderCircuitBreaker(
  provider: string,
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  const key = provider.toUpperCase();
  let breaker = breakerRegistry.get(key);
  if (!breaker) {
    breaker = new CircuitBreaker(key, options);
    breakerRegistry.set(key, breaker);
  }
  return breaker;
}
