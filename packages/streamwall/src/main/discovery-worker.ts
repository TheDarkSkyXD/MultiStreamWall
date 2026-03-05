/**
 * Discovery utility process entry point.
 *
 * Runs in a separate Electron utility process (utilityProcess.fork).
 * Receives settings via MessagePort, manages providers, runs polling loop.
 */
import { DiscoveryManager } from './discovery/manager'
import { providers } from './discovery/providers'
import type {
  DiscoveryWorkerSettings,
  WorkerInMessage,
  WorkerOutMessage,
} from './discovery/types'

let manager: DiscoveryManager | null = null
let settings: DiscoveryWorkerSettings | null = null
let pollingTimer: ReturnType<typeof setTimeout> | null = null
let paused = false
let currentQuery = ''

function sendMessage(msg: WorkerOutMessage) {
  if (workerPort) {
    workerPort.postMessage(msg)
  }
}

let workerPort: Electron.MessagePortMain | null = null

async function runSearch() {
  if (!manager || !settings || paused) return

  try {
    const results = await manager.searchAll(currentQuery)
    for (const { platform, result } of results) {
      if (result.error) {
        sendMessage({
          type: 'error',
          platform,
          error: result.error,
        })
      }
      if (result.streams.length > 0) {
        sendMessage({
          type: 'streams',
          platform,
          payload: result.streams,
        })
      }
    }
  } catch (err) {
    console.error('Discovery search error:', err)
  }

  scheduleNextPoll()
}

function scheduleNextPoll() {
  if (pollingTimer) {
    clearTimeout(pollingTimer)
  }
  if (!paused && settings) {
    pollingTimer = setTimeout(runSearch, settings.discoveryIntervalMs)
  }
}

function stopPolling() {
  if (pollingTimer) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
}

async function handleMessage(msg: WorkerInMessage) {
  switch (msg.type) {
    case 'configure': {
      settings = msg.settings
      if (!manager) {
        manager = new DiscoveryManager(providers)
        // Build config map from settings providers
        const configs: Record<string, Record<string, unknown>> = {}
        for (const [platform, providerSettings] of Object.entries(
          settings.providers,
        )) {
          configs[platform] = { ...providerSettings }
        }
        await manager.initAll(configs)
      }
      // If already running, settings update is picked up on next poll
      if (!paused && !pollingTimer) {
        scheduleNextPoll()
      }
      break
    }
    case 'search': {
      currentQuery = msg.query
      stopPolling()
      await runSearch()
      break
    }
    case 'pause': {
      paused = true
      stopPolling()
      break
    }
    case 'resume': {
      paused = false
      scheduleNextPoll()
      break
    }
    case 'destroy': {
      stopPolling()
      if (manager) {
        await manager.destroyAll()
        manager = null
      }
      process.exit(0)
      break
    }
  }
}

// Entry point: receive initial MessagePort from parent
process.parentPort.on('message', (event: Electron.MessageEvent) => {
  // First message delivers the MessagePort
  if (event.ports.length > 0) {
    workerPort = event.ports[0]
    workerPort.start()

    workerPort.on('message', (portEvent: Electron.MessageEvent) => {
      const msg = portEvent.data as WorkerInMessage
      handleMessage(msg).catch((err) => {
        console.error('Worker message handler error:', err)
      })
    })

    sendMessage({ type: 'ready' })
  }
})

// Handle unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Discovery worker uncaught exception:', err)
})

process.on('unhandledRejection', (err) => {
  console.error('Discovery worker unhandled rejection:', err)
})
