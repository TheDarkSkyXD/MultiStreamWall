/**
 * Twitch GQL provider for live stream discovery.
 *
 * Uses the public GQL endpoint with the well-known Twitch web client ID.
 * No credentials or app registration required.
 */
import { BaseProvider } from '../base'
import type {
  DiscoveredStream,
  ProviderCapabilities,
  ProviderResult,
  RateLimitConfig,
} from '../types'

const TWITCH_GQL_URL = 'https://gql.twitch.tv/gql'
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const MAX_RESULTS = 500

const SEARCH_QUERY = `
  query SearchChannels($query: String!) {
    searchFor(userQuery: $query, platform: "web") {
      channels {
        items {
          id
          login
          displayName
          broadcastSettings {
            title
          }
          stream {
            id
            viewersCount
            game {
              name
            }
            previewImageURL(width: 440, height: 248)
            createdAt
            freeformTags {
              name
            }
          }
        }
      }
    }
  }
`

interface TwitchChannelItem {
  id: string
  login: string
  displayName: string
  broadcastSettings?: {
    title?: string
  }
  stream?: {
    id: string
    viewersCount: number
    game?: { name?: string }
    previewImageURL?: string
    createdAt?: string
    freeformTags?: Array<{ name: string }>
  } | null
}

interface TwitchGqlResponse {
  data?: {
    searchFor?: {
      channels?: {
        items?: TwitchChannelItem[]
      }
    }
  }
  errors?: Array<{ message: string }>
}

export class TwitchProvider extends BaseProvider {
  readonly platform = 'twitch'
  readonly capabilities: ProviderCapabilities = {
    requiresCredentials: false,
    supportsLanguageFilter: false,
    isExperimental: false,
  }
  protected readonly rateLimit: RateLimitConfig = {
    maxRequests: 10,
    windowMs: 60_000,
  }

  async onInit(_config: Record<string, unknown>): Promise<void> {
    // No initialization needed for raw fetch
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

    for (const keyword of keywords) {
      if (allStreams.length >= MAX_RESULTS) break

      try {
        const streams = await this.searchKeyword(keyword)

        for (const stream of streams) {
          if (allStreams.length >= MAX_RESULTS) break
          if (!seenUrls.has(stream.url)) {
            seenUrls.add(stream.url)
            allStreams.push(stream)
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        // Detect Client-ID rejection
        if (message.includes('401') || message.includes('403')) {
          console.error('[Twitch] GQL Client-ID rejected')
          return {
            streams: allStreams,
            error: {
              type: 'auth_failed',
              message: '[Twitch] GQL Client-ID rejected',
            },
          }
        }

        console.error(`[Twitch] GQL search error for "${keyword}":`, message)
        return {
          streams: allStreams,
          error: {
            type: 'network_error',
            message: `[Twitch] GQL search failed: ${message}`,
          },
        }
      }
    }

    allStreams.sort((a, b) => b.viewerCount - a.viewerCount)

    return { streams: allStreams }
  }

  private async searchKeyword(keyword: string): Promise<DiscoveredStream[]> {
    const streams: DiscoveredStream[] = []

    const res = await fetch(TWITCH_GQL_URL, {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { query: keyword },
      }),
    })

    if (res.status === 401 || res.status === 403) {
      throw new Error(`${res.status} ${res.statusText}`)
    }

    if (!res.ok) {
      throw new Error(`GQL returned ${res.status}: ${res.statusText}`)
    }

    const data = (await res.json()) as TwitchGqlResponse

    if (data.errors?.length) {
      throw new Error(data.errors.map((e) => e.message).join(', '))
    }

    const items = data.data?.searchFor?.channels?.items ?? []

    for (const item of items) {
      if (streams.length >= MAX_RESULTS) break

      // Only include live channels
      if (!item.stream) continue

      streams.push({
        platform: 'twitch',
        title: item.broadcastSettings?.title ?? '',
        channelName: item.displayName,
        url: `https://twitch.tv/${item.login}`,
        thumbnailUrl: item.stream.previewImageURL ?? '',
        viewerCount: item.stream.viewersCount ?? 0,
        language: '',
        tags: item.stream.freeformTags?.map((t) => t.name) ?? [],
        startedAt: item.stream.createdAt ?? '',
      })
    }

    console.log(
      `[Twitch] GQL search for "${keyword}": ${streams.length} results`,
    )

    return streams
  }

  async onDestroy(): Promise<void> {
    // No cleanup needed
  }
}
