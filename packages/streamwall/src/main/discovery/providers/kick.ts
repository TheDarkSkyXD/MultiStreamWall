/**
 * Kick provider for live stream discovery.
 *
 * Uses a dual-approach strategy:
 * 1. Primary: unofficial search endpoint (may be blocked by Cloudflare)
 * 2. Fallback: official browse API (requires auth, returns top streams without keyword filter)
 *
 * Per CONTEXT.md: "Best effort: implement with whatever endpoints work;
 * if they break, return empty results with error status."
 */
import { BaseProvider } from '../base'
import type {
  DiscoveredStream,
  ProviderCapabilities,
  ProviderResult,
  RateLimitConfig,
} from '../types'

const KICK_SEARCH_URL = 'https://kick.com/api/search'
const KICK_BROWSE_URL = 'https://api.kick.com/public/v1/livestreams'
const MAX_RESULTS = 500

/**
 * Kick search API response shape (unofficial endpoint).
 * Structure may vary; fields are accessed defensively.
 */
interface KickSearchResponse {
  channels?: Array<{
    id?: number
    username?: string
    slug?: string
    is_live?: boolean
    user?: {
      username?: string
    }
    livestream?: {
      id?: number
      session_title?: string
      viewers?: number
      thumbnail?: { url?: string } | string | null
      created_at?: string
      language?: string
      tags?: string[]
    } | null
  }>
}

/**
 * Kick official browse API response shape.
 */
interface KickBrowseResponse {
  data?: Array<{
    id?: number
    slug?: string
    channel_slug?: string
    livestream_title?: string
    viewer_count?: number
    thumbnail_url?: string
    language?: string
    started_at?: string
    channel?: {
      username?: string
      slug?: string
    }
  }>
}

export class KickProvider extends BaseProvider {
  readonly platform = 'kick'
  readonly capabilities: ProviderCapabilities = {
    requiresCredentials: false,
    supportsLanguageFilter: true,
    isExperimental: false,
  }
  protected readonly rateLimit: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60_000,
  }

  async onInit(_config: Record<string, unknown>): Promise<void> {
    // No initialization needed
  }

  async onSearch(query: string): Promise<ProviderResult> {
    const keywords = query
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)

    if (keywords.length === 0) {
      return { streams: [] }
    }

    const seenUrls = new Set<string>()
    const allStreams: DiscoveredStream[] = []
    let lastError: string | undefined

    for (const keyword of keywords) {
      if (allStreams.length >= MAX_RESULTS) break

      // Try unofficial search first
      let streams = await this.searchViaUnofficial(keyword)

      if (streams === null) {
        // Unofficial endpoint failed, try official browse API (no keyword filter)
        console.log(
          '[Kick] Search endpoint unavailable, falling back to browse API (no keyword filtering)',
        )
        streams = await this.searchViaBrowse()

        if (streams === null) {
          lastError = '[Kick] All endpoints failed'
          continue
        }
      }

      for (const stream of streams) {
        if (allStreams.length >= MAX_RESULTS) break
        if (!seenUrls.has(stream.url)) {
          seenUrls.add(stream.url)
          allStreams.push(stream)
        }
      }
    }

    allStreams.sort((a, b) => b.viewerCount - a.viewerCount)

    if (allStreams.length === 0 && lastError) {
      return {
        streams: [],
        error: {
          type: 'unavailable',
          message: lastError,
        },
      }
    }

    return { streams: allStreams }
  }

  /**
   * Search via the unofficial kick.com/api/search endpoint.
   * Returns null if the endpoint is blocked (Cloudflare, 403, etc.).
   */
  private async searchViaUnofficial(
    keyword: string,
  ): Promise<DiscoveredStream[] | null> {
    try {
      const url = `${KICK_SEARCH_URL}?searched_word=${encodeURIComponent(keyword)}`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      })

      if (res.status === 403 || res.status === 503) {
        return null
      }

      if (!res.ok) {
        console.error(`[Kick] Search returned ${res.status}: ${res.statusText}`)
        return null
      }

      const data = (await res.json()) as KickSearchResponse
      const streams: DiscoveredStream[] = []

      if (data.channels) {
        for (const ch of data.channels) {
          if (streams.length >= MAX_RESULTS) break
          if (!ch.is_live || !ch.livestream) continue

          const slug = ch.slug ?? ch.username ?? ch.user?.username ?? ''
          if (!slug) continue

          const thumbnailUrl =
            typeof ch.livestream.thumbnail === 'string'
              ? ch.livestream.thumbnail
              : ch.livestream.thumbnail?.url ?? ''

          streams.push({
            platform: 'kick',
            title: ch.livestream.session_title ?? '',
            channelName: ch.username ?? ch.user?.username ?? slug,
            url: `https://kick.com/${slug}`,
            thumbnailUrl,
            viewerCount: ch.livestream.viewers ?? 0,
            language: ch.livestream.language ?? '',
            tags: ch.livestream.tags ?? [],
            startedAt: ch.livestream.created_at ?? '',
          })
        }
      }

      console.log(
        `[Kick] Search for "${keyword}": ${streams.length} results`,
      )
      return streams
    } catch (err) {
      console.error(
        `[Kick] Search error for "${keyword}":`,
        err instanceof Error ? err.message : String(err),
      )
      return null
    }
  }

  /**
   * Fallback: browse top livestreams via the official API.
   * Does NOT support keyword filtering -- returns top streams by viewer count.
   * Returns null if the endpoint is unavailable.
   */
  private async searchViaBrowse(): Promise<DiscoveredStream[] | null> {
    try {
      const url = `${KICK_BROWSE_URL}?sort=viewer_count&limit=100`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      })

      if (!res.ok) {
        console.error(
          `[Kick] Browse API returned ${res.status}: ${res.statusText}`,
        )
        return null
      }

      const data = (await res.json()) as KickBrowseResponse
      const streams: DiscoveredStream[] = []

      if (Array.isArray(data.data)) {
        for (const item of data.data) {
          if (streams.length >= MAX_RESULTS) break

          const slug =
            item.channel_slug ?? item.channel?.slug ?? item.slug ?? ''
          if (!slug) continue

          streams.push({
            platform: 'kick',
            title: item.livestream_title ?? '',
            channelName: item.channel?.username ?? slug,
            url: `https://kick.com/${slug}`,
            thumbnailUrl: item.thumbnail_url ?? '',
            viewerCount: item.viewer_count ?? 0,
            language: item.language ?? '',
            tags: [],
            startedAt: item.started_at ?? '',
          })
        }
      }

      console.log(`[Kick] Browse API: ${streams.length} results`)
      return streams
    } catch (err) {
      console.error(
        '[Kick] Browse API error:',
        err instanceof Error ? err.message : String(err),
      )
      return null
    }
  }

  async onDestroy(): Promise<void> {
    // No cleanup needed
  }
}
