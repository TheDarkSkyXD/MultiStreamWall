import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseProvider } from '../base'
import type {
  ProviderCapabilities,
  ProviderResult,
  RateLimitConfig,
} from '../types'

class TestProvider extends BaseProvider {
  readonly platform = 'test'
  readonly capabilities: ProviderCapabilities = {
    requiresCredentials: false,
    supportsLanguageFilter: false,
    isExperimental: false,
  }
  protected readonly rateLimit: RateLimitConfig = {
    maxRequests: 2,
    windowMs: 60000,
  }

  onInitCalled = false
  onDestroyCalled = false
  searchResult: ProviderResult = { streams: [] }
  shouldThrow = false

  protected async onInit(): Promise<void> {
    this.onInitCalled = true
  }

  protected async onSearch(): Promise<ProviderResult> {
    if (this.shouldThrow) {
      throw new Error('search exploded')
    }
    return this.searchResult
  }

  protected async onDestroy(): Promise<void> {
    this.onDestroyCalled = true
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider

  beforeEach(() => {
    provider = new TestProvider()
  })

  it('init() calls onInit()', async () => {
    await provider.init({})
    expect(provider.onInitCalled).toBe(true)
  })

  it('init() creates rate limiter so search works', async () => {
    await provider.init({})
    const result = await provider.search('test')
    expect(result.streams).toEqual([])
  })

  it('search() returns rate_limited error when tokens exhausted', async () => {
    await provider.init({})
    // Consume all 2 tokens
    await provider.search('q')
    await provider.search('q')
    // Third should be rate limited
    const result = await provider.search('q')
    expect(result.error).toBeDefined()
    expect(result.error!.type).toBe('rate_limited')
    expect(result.streams).toEqual([])
  })

  it('search() catches onSearch errors and returns network_error', async () => {
    await provider.init({})
    provider.shouldThrow = true
    const result = await provider.search('q')
    expect(result.error).toBeDefined()
    expect(result.error!.type).toBe('network_error')
    expect(result.error!.message).toBe('search exploded')
    expect(result.streams).toEqual([])
  })

  it('destroy() calls onDestroy()', async () => {
    await provider.init({})
    await provider.destroy()
    expect(provider.onDestroyCalled).toBe(true)
  })
})
