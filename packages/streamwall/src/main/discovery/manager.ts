/**
 * Discovery manager orchestrates multiple providers.
 *
 * Handles per-provider error isolation: a broken provider
 * does not crash the manager or affect other providers.
 */
import type { BaseProvider } from './base'
import type { ProviderResult, ProviderStatus } from './types'

export class DiscoveryManager {
  private providers: BaseProvider[]
  private statuses: Map<string, ProviderStatus>

  constructor(providers: BaseProvider[]) {
    this.providers = providers
    this.statuses = new Map()
    for (const p of providers) {
      this.statuses.set(p.platform, 'stopped')
    }
  }

  async initAll(
    configs: Record<string, Record<string, unknown>>,
  ): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.init(configs[provider.platform] ?? {})
        this.statuses.set(provider.platform, 'running')
      } catch (err) {
        console.error(
          `Failed to init provider ${provider.platform}:`,
          err,
        )
        this.statuses.set(provider.platform, 'error')
      }
    }
  }

  async searchAll(
    query: string,
  ): Promise<{ platform: string; result: ProviderResult }[]> {
    const results = await Promise.allSettled(
      this.providers.map(async (provider) => {
        const result = await provider.search(query)
        if (result.error) {
          this.statuses.set(provider.platform, 'error')
        }
        return { platform: provider.platform, result }
      }),
    )

    return results.map((r, i) => {
      if (r.status === 'fulfilled') {
        return r.value
      }
      // Should not happen since BaseProvider.search catches errors,
      // but handle it defensively
      const platform = this.providers[i].platform
      this.statuses.set(platform, 'error')
      return {
        platform,
        result: {
          streams: [],
          error: {
            type: 'network_error' as const,
            message:
              r.reason instanceof Error
                ? r.reason.message
                : String(r.reason),
          },
        },
      }
    })
  }

  async destroyAll(): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.destroy()
        this.statuses.set(provider.platform, 'stopped')
      } catch (err) {
        console.error(
          `Failed to destroy provider ${provider.platform}:`,
          err,
        )
      }
    }
  }

  getProviderStatuses(): Map<string, ProviderStatus> {
    return new Map(this.statuses)
  }
}
