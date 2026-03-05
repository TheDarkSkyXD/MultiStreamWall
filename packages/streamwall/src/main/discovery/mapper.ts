/**
 * Maps DiscoveredStream (platform-native) to StreamData (grid format).
 *
 * Field mapping:
 *   url -> link
 *   title -> label
 *   channelName -> source
 *   kind = 'video'
 *   _dataSource = 'discovery:{platform}'
 *   _id = '' (assigned later by StreamIDGenerator)
 *
 * Discovery extension fields (thumbnailUrl, viewerCount, platform,
 * channelName) are preserved as optional StreamData fields.
 */
import type { StreamData } from 'streamwall-shared'
import type { DiscoveredStream } from './types'

export function toStreamData(discovered: DiscoveredStream): StreamData {
  return {
    kind: 'video',
    link: discovered.url,
    label: discovered.title,
    source: discovered.channelName,
    _id: '',
    _dataSource: `discovery:${discovered.platform}`,
    thumbnailUrl: discovered.thumbnailUrl,
    viewerCount: discovered.viewerCount,
    platform: discovered.platform,
    channelName: discovered.channelName,
  }
}
