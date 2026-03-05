/**
 * Discovery type definitions.
 *
 * These types define the contract for platform stream discovery:
 * provider interfaces, message protocols, rate limiting, and status.
 */

/** A stream discovered from a platform API */
export interface DiscoveredStream {
  platform: string
  title: string
  channelName: string
  url: string
  thumbnailUrl: string
  viewerCount: number
  language: string
  tags: string[]
  startedAt: string
}

/** Error types for provider failures */
export interface ProviderError {
  type: 'auth_failed' | 'rate_limited' | 'network_error' | 'unavailable'
  message: string
  retryAfter?: number
}

/** Result returned by a provider search */
export interface ProviderResult {
  streams: DiscoveredStream[]
  error?: ProviderError
}

/** Capability flags for a provider */
export interface ProviderCapabilities {
  requiresCredentials: boolean
  supportsLanguageFilter: boolean
  isExperimental: boolean
}

/** Rate limiting configuration per provider */
export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

/** Provider runtime status */
export type ProviderStatus = 'running' | 'paused' | 'error' | 'stopped'

/** Settings sent to the discovery worker process */
export interface DiscoveryWorkerSettings {
  discoveryIntervalMs: number
  livenessIntervalMs: number
  providers: Record<
    string,
    {
      enabled: boolean
      apiKey?: string
      [key: string]: unknown
    }
  >
}

/** Messages from main process -> utility process */
export type WorkerInMessage =
  | { type: 'configure'; settings: DiscoveryWorkerSettings }
  | { type: 'search'; query: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'destroy' }

/** Messages from utility process -> main process */
export type WorkerOutMessage =
  | { type: 'streams'; platform: string; payload: DiscoveredStream[] }
  | { type: 'error'; platform: string; error: ProviderError }
  | { type: 'status'; platform: string; status: ProviderStatus }
  | { type: 'ready' }
