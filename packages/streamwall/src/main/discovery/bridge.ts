/**
 * Repeater-based bridge: MessagePort messages -> AsyncGenerator<StreamData[]>
 *
 * Converts WorkerOutMessage 'streams' events from the utility process
 * into an async generator compatible with combineDataSources.
 */
import { Repeater } from '@repeaterjs/repeater'
import type { StreamData } from 'streamwall-shared'
import { toStreamData } from './mapper'
import type { WorkerOutMessage } from './types'

export function createDiscoveryBridge(
  port: Electron.MessagePortMain,
): AsyncGenerator<StreamData[]> {
  return new Repeater(async (push, stop) => {
    await push([]) // initial empty state

    const handler = (event: Electron.MessageEvent) => {
      const message = event.data as WorkerOutMessage
      if (message.type === 'streams') {
        const streams = message.payload.map(toStreamData)
        push(streams)
      }
    }

    port.on('message', handler)
    await stop
    port.off('message', handler)
  })
}
