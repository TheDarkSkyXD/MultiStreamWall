/**
 * YouTube dual-mode provider: Innertube (no API key) + Data API v3 (with key).
 *
 * Automatically switches between modes based on whether an API key is
 * configured in discovery settings. Innertube uses youtubei.js for
 * unauthenticated search; Data API provides higher rate limits.
 */
import fetch from 'node-fetch'
import { Innertube } from 'youtubei.js'

import { BaseProvider } from '../base'
import type {
  DiscoveredStream,
  ProviderCapabilities,
  ProviderResult,
  RateLimitConfig,
} from '../types'

const MAX_RESULTS = 500

export class YouTubeProvider extends BaseProvider {
  readonly platform = 'youtube'
  readonly capabilities: ProviderCapabilities = {
    requiresCredentials: false,
    supportsLanguageFilter: true,
    isExperimental: false,
  }
  protected readonly rateLimit: RateLimitConfig = {
    maxRequests: 5,
    windowMs: 60_000,
  }

  private innertube: Innertube | null = null
  private apiKey: string | undefined

  async onInit(config: Record<string, unknown>): Promise<void> {
    this.apiKey = config.apiKey as string | undefined
    try {
      this.innertube = await Innertube.create()
      console.log('[YouTube] Innertube client initialized')
    } catch (err) {
      console.error('[YouTube] Failed to initialize Innertube:', err)
      this.innertube = null
    }
  }

  async onSearch(query: string): Promise<ProviderResult> {
    const apiKey = this.apiKey
    const keywords = query
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)

    if (keywords.length === 0) {
      return { streams: [] }
    }

    const seenUrls = new Set<string>()
    const allStreams: DiscoveredStream[] = []

    for (const keyword of keywords) {
      if (allStreams.length >= MAX_RESULTS) break

      const result = apiKey
        ? await this.searchViaDataApi(keyword, apiKey)
        : await this.searchViaInnertube(keyword)

      if (result.error) {
        return result
      }

      for (const stream of result.streams) {
        if (allStreams.length >= MAX_RESULTS) break
        if (!seenUrls.has(stream.url)) {
          seenUrls.add(stream.url)
          allStreams.push(stream)
        }
      }
    }

    allStreams.sort((a, b) => b.viewerCount - a.viewerCount)

    return { streams: allStreams }
  }

  async searchViaInnertube(query: string): Promise<ProviderResult> {
    if (!this.innertube) {
      return {
        streams: [],
        error: {
          type: 'unavailable',
          message: '[YouTube] Innertube client not initialized',
        },
      }
    }

    const streams: DiscoveredStream[] = []

    try {
      let search = await this.innertube.search(query, {
        features: ['live'],
      })

      const mapResults = (results: typeof search.results) => {
        if (!results) return
        for (const item of results) {
          if (streams.length >= MAX_RESULTS) break
          // Videos have type 'Video' and an id property
          if (!('id' in item) || !item.id) continue
          const video = item as {
            id: string
            title?: { text?: string } | string
            author?: { name?: string } | string
            short_view_count?: { text?: string } | string
            view_count?: { text?: string } | string
            thumbnails?: Array<{ url: string }>
            badges?: Array<{ label?: string }>
          }

          const title =
            typeof video.title === 'object' && video.title
              ? (video.title.text ?? '')
              : String(video.title ?? '')

          const channelName =
            typeof video.author === 'object' && video.author
              ? ((video.author as { name?: string }).name ?? '')
              : String(video.author ?? '')

          // Parse viewer count from short_view_count or view_count text
          let viewerCount = 0
          const viewText =
            typeof video.short_view_count === 'object' &&
            video.short_view_count
              ? video.short_view_count.text
              : typeof video.view_count === 'object' && video.view_count
                ? video.view_count.text
                : undefined
          if (viewText) {
            const cleaned = viewText.replace(/[^0-9.kKmM]/g, '')
            const num = parseFloat(cleaned)
            if (!isNaN(num)) {
              if (/[kK]/.test(cleaned)) viewerCount = Math.round(num * 1000)
              else if (/[mM]/.test(cleaned))
                viewerCount = Math.round(num * 1_000_000)
              else viewerCount = Math.round(num)
            }
          }

          const thumbnailUrl = video.thumbnails?.[0]?.url ?? ''

          streams.push({
            platform: 'youtube',
            title,
            channelName,
            url: `https://youtube.com/watch?v=${video.id}`,
            thumbnailUrl,
            viewerCount,
            language: '',
            tags: [],
            startedAt: '',
          })
        }
      }

      mapResults(search.results)

      // Paginate while under cap
      while (search.has_continuation && streams.length < MAX_RESULTS) {
        search = await search.getContinuation()
        mapResults(search.results)
      }

      console.log(
        `[YouTube] Innertube search for "${query}": ${streams.length} results`,
      )
    } catch (err) {
      console.error(`[YouTube] Innertube search error for "${query}":`, err)
      return {
        streams,
        error: {
          type: 'network_error',
          message: `Innertube search failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      }
    }

    return { streams }
  }

  async searchViaDataApi(
    query: string,
    apiKey: string,
  ): Promise<ProviderResult> {
    const streams: DiscoveredStream[] = []
    let pageToken: string | undefined

    try {
      do {
        const params = new URLSearchParams({
          part: 'snippet',
          type: 'video',
          eventType: 'live',
          q: query,
          key: apiKey,
          maxResults: '50',
          order: 'viewCount',
        })
        if (pageToken) params.set('pageToken', pageToken)

        const url = `https://www.googleapis.com/youtube/v3/search?${params}`
        const res = await fetch(url)

        if (res.status === 403) {
          console.warn('[YouTube] Data API quota exceeded')
          return {
            streams,
            error: {
              type: 'rate_limited',
              message: '[YouTube] Data API quota exceeded',
            },
          }
        }

        if (!res.ok) {
          throw new Error(`Data API returned ${res.status}: ${res.statusText}`)
        }

        const data = (await res.json()) as {
          items?: Array<{
            id: { videoId?: string }
            snippet: {
              title: string
              channelTitle: string
              thumbnails?: {
                medium?: { url: string }
                default?: { url: string }
              }
            }
          }>
          nextPageToken?: string
        }

        if (data.items) {
          for (const item of data.items) {
            if (streams.length >= MAX_RESULTS) break
            if (!item.id.videoId) continue

            streams.push({
              platform: 'youtube',
              title: item.snippet.title,
              channelName: item.snippet.channelTitle,
              url: `https://youtube.com/watch?v=${item.id.videoId}`,
              thumbnailUrl:
                item.snippet.thumbnails?.medium?.url ??
                item.snippet.thumbnails?.default?.url ??
                '',
              viewerCount: 0,
              language: '',
              tags: [],
              startedAt: '',
            })
          }
        }

        pageToken = data.nextPageToken
      } while (pageToken && streams.length < MAX_RESULTS)

      console.log(
        `[YouTube] Data API search for "${query}": ${streams.length} results`,
      )
    } catch (err) {
      console.error(`[YouTube] Data API search error for "${query}":`, err)
      return {
        streams,
        error: {
          type: 'network_error',
          message: `Data API search failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      }
    }

    return { streams }
  }

  async onDestroy(): Promise<void> {
    this.innertube = null
  }
}
