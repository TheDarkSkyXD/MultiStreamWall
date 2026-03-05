import { describe, it, expect } from 'vitest'
import type {
  DiscoveredStream,
  ProviderResult,
  ProviderError,
  ProviderCapabilities,
  RateLimitConfig,
  WorkerInMessage,
  WorkerOutMessage,
  ProviderStatus,
} from '../types'
import type { StreamData, DiscoverySettings } from 'streamwall-shared'

describe('Discovery types', () => {
  it('DiscoveredStream has all required fields', () => {
    const stream: DiscoveredStream = {
      platform: 'twitch',
      title: 'Test Stream',
      channelName: 'testuser',
      url: 'https://twitch.tv/testuser',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      viewerCount: 100,
      language: 'en',
      tags: ['gaming'],
      startedAt: new Date().toISOString(),
    }
    expect(stream.platform).toBe('twitch')
    expect(stream.tags).toHaveLength(1)
  })

  it('ProviderResult supports success and error', () => {
    const success: ProviderResult = {
      streams: [],
    }
    expect(success.error).toBeUndefined()

    const failure: ProviderResult = {
      streams: [],
      error: {
        type: 'auth_failed',
        message: 'Invalid token',
      },
    }
    expect(failure.error?.type).toBe('auth_failed')
  })

  it('ProviderError type is constrained', () => {
    const errors: ProviderError['type'][] = [
      'auth_failed',
      'rate_limited',
      'network_error',
      'unavailable',
    ]
    expect(errors).toHaveLength(4)
  })

  it('ProviderCapabilities has required flags', () => {
    const caps: ProviderCapabilities = {
      requiresCredentials: true,
      supportsLanguageFilter: false,
      isExperimental: false,
    }
    expect(caps.requiresCredentials).toBe(true)
  })

  it('RateLimitConfig has required fields', () => {
    const config: RateLimitConfig = {
      maxRequests: 30,
      windowMs: 60000,
    }
    expect(config.maxRequests).toBe(30)
  })

  it('WorkerInMessage is a discriminated union', () => {
    const msgs: WorkerInMessage[] = [
      { type: 'configure', settings: {} as any },
      { type: 'search', query: 'gaming' },
      { type: 'pause' },
      { type: 'resume' },
      { type: 'destroy' },
    ]
    expect(msgs).toHaveLength(5)
  })

  it('WorkerOutMessage is a discriminated union', () => {
    const msgs: WorkerOutMessage[] = [
      { type: 'streams', platform: 'twitch', payload: [] },
      {
        type: 'error',
        platform: 'twitch',
        error: { type: 'network_error', message: 'fail' },
      },
      { type: 'status', platform: 'twitch', status: 'running' },
      { type: 'ready' },
    ]
    expect(msgs).toHaveLength(4)
  })

  it('ProviderStatus is a union type', () => {
    const statuses: ProviderStatus[] = [
      'running',
      'paused',
      'error',
      'stopped',
    ]
    expect(statuses).toHaveLength(4)
  })

  it('StreamData has optional discovery fields', () => {
    const stream: StreamData = {
      kind: 'video',
      link: 'https://twitch.tv/test',
      label: 'Test',
      _id: '1',
      _dataSource: 'discovery:twitch',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      viewerCount: 100,
      platform: 'twitch',
      channelName: 'testuser',
    }
    expect(stream.thumbnailUrl).toBe('https://example.com/thumb.jpg')
    expect(stream.viewerCount).toBe(100)
  })

  it('DiscoverySettings has required structure', () => {
    const settings: DiscoverySettings = {
      discoveryIntervalMs: 60000,
      livenessIntervalMs: 30000,
      providers: {
        twitch: { enabled: true, apiKey: 'test-key' },
      },
    }
    expect(settings.discoveryIntervalMs).toBe(60000)
    expect(settings.providers.twitch.enabled).toBe(true)
  })
})
