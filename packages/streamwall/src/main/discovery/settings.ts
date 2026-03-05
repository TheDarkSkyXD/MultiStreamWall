/**
 * Discovery settings persistence with safeStorage encryption for API keys.
 *
 * Uses electron-store for disk persistence. API keys are encrypted
 * via Electron's safeStorage when available, falling back to plain text.
 */
import { safeStorage } from 'electron'
import Store from 'electron-store'
import type { DiscoveryWorkerSettings } from './types'

interface DiscoveryStoreSchema {
  discoveryIntervalMs: number
  livenessIntervalMs: number
  searchQuery: string
  providers: Record<
    string,
    {
      enabled: boolean
      apiKeyEncrypted?: string
      apiKeyPlain?: string
      [key: string]: unknown
    }
  >
}

const defaults: DiscoveryStoreSchema = {
  discoveryIntervalMs: 60000,
  livenessIntervalMs: 30000,
  searchQuery: '',
  providers: {},
}

export const discoveryStore = new Store<DiscoveryStoreSchema>({
  name: 'discovery-settings',
  defaults,
  migrations: {},
})

export function setApiKey(platform: string, key: string): void {
  const providers = discoveryStore.get('providers')
  const existing = providers[platform] ?? { enabled: false }

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    existing.apiKeyEncrypted = encrypted.toString('base64')
    delete existing.apiKeyPlain
  } else {
    existing.apiKeyPlain = key
    delete existing.apiKeyEncrypted
  }

  providers[platform] = existing
  discoveryStore.set('providers', providers)
}

export function getApiKey(platform: string): string | undefined {
  const providers = discoveryStore.get('providers')
  const providerSettings = providers[platform]
  if (!providerSettings) return undefined

  if (
    providerSettings.apiKeyEncrypted &&
    safeStorage.isEncryptionAvailable()
  ) {
    const buffer = Buffer.from(providerSettings.apiKeyEncrypted, 'base64')
    return safeStorage.decryptString(buffer)
  }

  return providerSettings.apiKeyPlain
}

export function getDiscoverySettings(): DiscoveryWorkerSettings {
  const settings = discoveryStore.store
  return {
    discoveryIntervalMs: settings.discoveryIntervalMs,
    livenessIntervalMs: settings.livenessIntervalMs,
    providers: Object.fromEntries(
      Object.entries(settings.providers).map(([platform, config]) => [
        platform,
        {
          enabled: config.enabled,
          apiKey: getApiKey(platform),
        },
      ]),
    ),
  }
}

export function getSearchQuery(): string {
  return discoveryStore.get('searchQuery')
}

export function setSearchQuery(query: string): void {
  discoveryStore.set('searchQuery', query)
}

export function resetDefaults(): void {
  discoveryStore.clear()
}
