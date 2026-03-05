/**
 * Abstract base class for platform stream discovery providers.
 *
 * Subclasses implement onInit/onSearch/onDestroy. The base class
 * handles rate limiting and error wrapping automatically.
 */
import { TokenBucket } from './rate-limiter'
import type {
  ProviderCapabilities,
  ProviderResult,
  RateLimitConfig,
} from './types'

export abstract class BaseProvider {
  abstract readonly platform: string
  abstract readonly capabilities: ProviderCapabilities
  protected abstract readonly rateLimit: RateLimitConfig

  private rateLimiter: TokenBucket | null = null

  async init(config: Record<string, unknown>): Promise<void> {
    this.rateLimiter = new TokenBucket(
      this.rateLimit.maxRequests,
      this.rateLimit.windowMs,
    )
    await this.onInit(config)
  }

  async search(query: string): Promise<ProviderResult> {
    if (!this.rateLimiter || !this.rateLimiter.tryConsume()) {
      return {
        streams: [],
        error: {
          type: 'rate_limited',
          message: `Rate limit exceeded for ${this.platform}`,
          retryAfter: this.rateLimiter?.msUntilRefill(),
        },
      }
    }

    try {
      return await this.onSearch(query)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        streams: [],
        error: {
          type: 'network_error',
          message,
        },
      }
    }
  }

  async destroy(): Promise<void> {
    await this.onDestroy()
  }

  protected abstract onInit(config: Record<string, unknown>): Promise<void>
  protected abstract onSearch(query: string): Promise<ProviderResult>
  protected abstract onDestroy(): Promise<void>
}
