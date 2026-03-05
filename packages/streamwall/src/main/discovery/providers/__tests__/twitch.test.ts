/**
 * Twitch provider tests.
 *
 * Unit tests run always. Integration tests hit the real Twitch GQL
 * endpoint and may be flaky due to rate limiting.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

import { TwitchProvider } from '../twitch'

describe('TwitchProvider', () => {
  describe('metadata', () => {
    it('has platform set to twitch', () => {
      const provider = new TwitchProvider()
      expect(provider.platform).toBe('twitch')
    })

    it('has correct capabilities', () => {
      const provider = new TwitchProvider()
      expect(provider.capabilities).toEqual({
        requiresCredentials: false,
        supportsLanguageFilter: false,
        isExperimental: false,
      })
    })
  })

  describe('integration', { timeout: 30000 }, () => {
    let provider: TwitchProvider

    beforeAll(async () => {
      provider = new TwitchProvider()
      await provider.init({})
    })

    afterAll(async () => {
      await provider.destroy()
    })

    it('search returns live streams with valid Twitch URLs', async () => {
      const result = await provider.search('news')

      expect(result.streams.length).toBeGreaterThan(0)

      for (const stream of result.streams) {
        expect(stream.platform).toBe('twitch')
        expect(stream.url).toMatch(/^https:\/\/twitch\.tv\//)
        expect(stream.title).toBeTruthy()
        expect(stream.viewerCount).toBeGreaterThanOrEqual(0)
      }
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
