import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenBucket } from '../rate-limiter'

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts full (maxTokens available)', () => {
    const bucket = new TokenBucket(5, 1000)
    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume()).toBe(true)
    }
  })

  it('returns false when tokens exhausted', () => {
    const bucket = new TokenBucket(3, 1000)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)
  })

  it('replenishes tokens after refill interval', () => {
    const bucket = new TokenBucket(2, 1000)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)

    vi.advanceTimersByTime(1000)

    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)
  })

  it('does not replenish before interval passes', () => {
    const bucket = new TokenBucket(1, 1000)
    expect(bucket.tryConsume()).toBe(true)
    expect(bucket.tryConsume()).toBe(false)

    vi.advanceTimersByTime(500)

    expect(bucket.tryConsume()).toBe(false)
  })

  it('msUntilRefill returns positive value when tokens exhausted', () => {
    const bucket = new TokenBucket(1, 1000)
    bucket.tryConsume()
    bucket.tryConsume() // exhausted

    vi.advanceTimersByTime(300)

    const ms = bucket.msUntilRefill()
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(700)
  })

  it('msUntilRefill returns 0 when tokens available', () => {
    const bucket = new TokenBucket(5, 1000)
    expect(bucket.msUntilRefill()).toBe(0)
  })
})
