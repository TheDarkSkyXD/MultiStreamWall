/**
 * Token bucket rate limiter.
 *
 * Enforces a maximum number of requests within a time window.
 * Tokens are fully replenished after each refill interval.
 */
export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private maxTokens: number,
    private refillIntervalMs: number,
  ) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const intervals = Math.floor(elapsed / this.refillIntervalMs)
    if (intervals > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + intervals * this.maxTokens)
      this.lastRefill = this.lastRefill + intervals * this.refillIntervalMs
    }
  }

  tryConsume(): boolean {
    this.refill()
    if (this.tokens > 0) {
      this.tokens--
      return true
    }
    return false
  }

  msUntilRefill(): number {
    if (this.tokens > 0) {
      return 0
    }
    const elapsed = Date.now() - this.lastRefill
    return Math.max(0, this.refillIntervalMs - elapsed)
  }
}
