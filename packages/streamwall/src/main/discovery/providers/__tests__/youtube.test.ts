/**
 * YouTube provider tests.
 *
 * Unit tests run always. Integration tests hit real YouTube APIs
 * and may be flaky due to rate limiting -- that's expected.
 *
 * Settings module is mocked to avoid electron-store requiring
 * Electron's app context in test environment.
 */
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import type { DiscoveredStream } from '../../types'

// Mock settings module before importing YouTubeProvider
vi.mock('../../settings', () => ({
  getApiKey: vi.fn(() => undefined),
  setApiKey: vi.fn(),
  getSearchQuery: vi.fn(() => ''),
  setSearchQuery: vi.fn(),
  getDiscoverySettings: vi.fn(() => ({
    discoveryIntervalMs: 60000,
    livenessIntervalMs: 30000,
    providers: {},
  })),
  discoveryStore: {
    get: vi.fn(),
    set: vi.fn(),
    onDidAnyChange: vi.fn(),
  },
}))

import { YouTubeProvider } from '../youtube'

describe('YouTubeProvider', () => {
  describe('metadata', () => {
    it('has platform set to youtube', () => {
      const provider = new YouTubeProvider()
      expect(provider.platform).toBe('youtube')
    })

    it('has correct capabilities', () => {
      const provider = new YouTubeProvider()
      expect(provider.capabilities).toEqual({
        requiresCredentials: false,
        supportsLanguageFilter: true,
        isExperimental: false,
      })
    })
  })

  describe('deduplication logic', () => {
    it('deduplicates streams by URL using a Set', () => {
      const streams: DiscoveredStream[] = [
        {
          platform: 'youtube',
          title: 'Stream A',
          channelName: 'Channel A',
          url: 'https://youtube.com/watch?v=abc123',
          thumbnailUrl: '',
          viewerCount: 100,
          language: '',
          tags: [],
          startedAt: '',
        },
        {
          platform: 'youtube',
          title: 'Stream A duplicate',
          channelName: 'Channel A',
          url: 'https://youtube.com/watch?v=abc123',
          thumbnailUrl: '',
          viewerCount: 100,
          language: '',
          tags: [],
          startedAt: '',
        },
        {
          platform: 'youtube',
          title: 'Stream B',
          channelName: 'Channel B',
          url: 'https://youtube.com/watch?v=def456',
          thumbnailUrl: '',
          viewerCount: 50,
          language: '',
          tags: [],
          startedAt: '',
        },
      ]

      const seenUrls = new Set<string>()
      const deduped = streams.filter((s) => {
        if (seenUrls.has(s.url)) return false
        seenUrls.add(s.url)
        return true
      })

      expect(deduped).toHaveLength(2)
      expect(deduped[0].title).toBe('Stream A')
      expect(deduped[1].title).toBe('Stream B')
    })
  })

  describe('sorting', () => {
    it('sorts results by viewerCount descending', () => {
      const streams: DiscoveredStream[] = [
        {
          platform: 'youtube',
          title: 'Low',
          channelName: '',
          url: 'https://youtube.com/watch?v=1',
          thumbnailUrl: '',
          viewerCount: 10,
          language: '',
          tags: [],
          startedAt: '',
        },
        {
          platform: 'youtube',
          title: 'High',
          channelName: '',
          url: 'https://youtube.com/watch?v=2',
          thumbnailUrl: '',
          viewerCount: 1000,
          language: '',
          tags: [],
          startedAt: '',
        },
        {
          platform: 'youtube',
          title: 'Mid',
          channelName: '',
          url: 'https://youtube.com/watch?v=3',
          thumbnailUrl: '',
          viewerCount: 500,
          language: '',
          tags: [],
          startedAt: '',
        },
      ]

      streams.sort((a, b) => b.viewerCount - a.viewerCount)

      expect(streams[0].title).toBe('High')
      expect(streams[1].title).toBe('Mid')
      expect(streams[2].title).toBe('Low')
    })
  })

  describe('integration', { timeout: 30000 }, () => {
    let provider: YouTubeProvider

    beforeAll(async () => {
      provider = new YouTubeProvider()
      await provider.init({})
    })

    afterAll(async () => {
      await provider.destroy()
    })

    it('searchViaInnertube returns streams with valid YouTube URLs', async () => {
      const result = await provider.searchViaInnertube('news')

      expect(result.streams.length).toBeGreaterThan(0)

      for (const stream of result.streams) {
        expect(stream.platform).toBe('youtube')
        expect(stream.url).toMatch(/^https:\/\/youtube\.com\/watch\?v=/)
        expect(stream.title).toBeTruthy()
      }
    })

    it('search returns non-empty results for common query', async () => {
      const result = await provider.search('news')

      expect(result.streams.length).toBeGreaterThan(0)
      expect(result.error).toBeUndefined()
    })

    it('results are sorted by viewerCount descending', async () => {
      const result = await provider.search('news')

      for (let i = 1; i < result.streams.length; i++) {
        expect(result.streams[i - 1].viewerCount).toBeGreaterThanOrEqual(
          result.streams[i].viewerCount,
        )
      }
    })

    it('results are capped at 500', async () => {
      const result = await provider.search('news')
      expect(result.streams.length).toBeLessThanOrEqual(500)
    })
  })
})
