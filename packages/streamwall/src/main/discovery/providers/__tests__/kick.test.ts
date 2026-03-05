/**
 * Kick provider tests.
 *
 * Unit tests run always. Integration tests hit real Kick endpoints
 * which are frequently blocked by Cloudflare -- the test handles
 * both success (valid streams) and graceful degradation (error status).
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'

import { KickProvider } from '../kick'

describe('KickProvider', () => {
  describe('metadata', () => {
    it('has platform set to kick', () => {
      const provider = new KickProvider()
      expect(provider.platform).toBe('kick')
    })

    it('has correct capabilities', () => {
      const provider = new KickProvider()
      expect(provider.capabilities).toEqual({
        requiresCredentials: false,
        supportsLanguageFilter: true,
        isExperimental: false,
      })
    })
  })

  describe('integration', { timeout: 30000 }, () => {
    let provider: KickProvider

    beforeAll(async () => {
      provider = new KickProvider()
      await provider.init({})
    })

    afterAll(async () => {
      await provider.destroy()
    })

    it('search returns valid streams or gracefully degrades', async () => {
      const result = await provider.search('gaming')

      if (result.streams.length > 0) {
        // Success path: verify stream shape
        for (const stream of result.streams) {
          expect(stream.platform).toBe('kick')
          expect(stream.url).toMatch(/^https:\/\/kick\.com\//)
          expect(stream.viewerCount).toBeGreaterThanOrEqual(0)
        }
      } else {
        // Degraded path: both endpoints blocked, error returned
        expect(result.error).toBeDefined()
        expect(result.error!.type).toBe('unavailable')
      }
    })

    it('results are sorted by viewerCount descending when available', async () => {
      const result = await provider.search('gaming')

      if (result.streams.length > 1) {
        for (let i = 1; i < result.streams.length; i++) {
          expect(result.streams[i - 1].viewerCount).toBeGreaterThanOrEqual(
            result.streams[i].viewerCount,
          )
        }
      }
    })

    it('results are capped at 500', async () => {
      const result = await provider.search('gaming')
      expect(result.streams.length).toBeLessThanOrEqual(500)
    })
  })
})
