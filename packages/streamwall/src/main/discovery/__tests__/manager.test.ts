import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiscoveryManager } from '../manager'
import { BaseProvider } from '../base'
import type {
  ProviderCapabilities,
  ProviderResult,
  RateLimitConfig,
} from '../types'

class MockProvider extends BaseProvider {
  readonly platform: string
  readonly capabilities: ProviderCapabilities = {
    requiresCredentials: false,
    supportsLanguageFilter: false,
    isExperimental: false,
  }
  protected readonly rateLimit: RateLimitConfig = {
    maxRequests: 100,
    windowMs: 60000,
  }

  initShouldThrow = false
  searchShouldThrow = false
  destroyShouldThrow = false
  searchResult: ProviderResult = { streams: [] }

  constructor(platform: string) {
    super()
    this.platform = platform
  }

  protected async onInit(): Promise<void> {
    if (this.initShouldThrow) throw new Error(`${this.platform} init failed`)
  }

  protected async onSearch(): Promise<ProviderResult> {
    if (this.searchShouldThrow)
      throw new Error(`${this.platform} search failed`)
    return this.searchResult
  }

  protected async onDestroy(): Promise<void> {
    if (this.destroyShouldThrow)
      throw new Error(`${this.platform} destroy failed`)
  }
}

describe('DiscoveryManager', () => {
  let providerA: MockProvider
  let providerB: MockProvider
  let providerC: MockProvider
  let manager: DiscoveryManager

  beforeEach(() => {
    providerA = new MockProvider('twitch')
    providerB = new MockProvider('youtube')
    providerC = new MockProvider('kick')
    manager = new DiscoveryManager([providerA, providerB, providerC])
  })

  describe('initAll', () => {
    it('initializes all providers', async () => {
      await manager.initAll({})
      const statuses = manager.getProviderStatuses()
      expect(statuses.get('twitch')).toBe('running')
      expect(statuses.get('youtube')).toBe('running')
      expect(statuses.get('kick')).toBe('running')
    })

    it('handles one failing provider without affecting others (DISC-09)', async () => {
      providerB.initShouldThrow = true
      await manager.initAll({})
      const statuses = manager.getProviderStatuses()
      expect(statuses.get('twitch')).toBe('running')
      expect(statuses.get('youtube')).toBe('error')
      expect(statuses.get('kick')).toBe('running')
    })
  })

  describe('searchAll', () => {
    it('returns results from all providers', async () => {
      providerA.searchResult = {
        streams: [
          {
            platform: 'twitch',
            title: 'Stream A',
            channelName: 'ch_a',
            url: 'https://twitch.tv/a',
            thumbnailUrl: '',
            viewerCount: 100,
            language: 'en',
            tags: [],
            startedAt: '',
          },
        ],
      }
      await manager.initAll({})
      const results = await manager.searchAll('test')
      expect(results).toHaveLength(3)
      expect(results[0].platform).toBe('twitch')
      expect(results[0].result.streams).toHaveLength(1)
    })

    it('returns results from working providers when one throws (DISC-09)', async () => {
      providerB.searchShouldThrow = true
      await manager.initAll({})
      const results = await manager.searchAll('test')
      // All 3 providers return results (provider B returns error result)
      expect(results).toHaveLength(3)
      const youtubeResult = results.find((r) => r.platform === 'youtube')!
      expect(youtubeResult.result.error).toBeDefined()
      expect(youtubeResult.result.error!.type).toBe('network_error')
      // Other providers still return normally
      const twitchResult = results.find((r) => r.platform === 'twitch')!
      expect(twitchResult.result.error).toBeUndefined()
    })
  })

  describe('destroyAll', () => {
    it('is resilient to individual failures', async () => {
      providerB.destroyShouldThrow = true
      await manager.initAll({})
      // Should not throw even though providerB.destroy throws
      await expect(manager.destroyAll()).resolves.not.toThrow()
      const statuses = manager.getProviderStatuses()
      expect(statuses.get('twitch')).toBe('stopped')
      expect(statuses.get('kick')).toBe('stopped')
    })
  })

  describe('getProviderStatuses', () => {
    it('returns stopped for all providers before init', () => {
      const statuses = manager.getProviderStatuses()
      expect(statuses.get('twitch')).toBe('stopped')
      expect(statuses.get('youtube')).toBe('stopped')
    })
  })
})
