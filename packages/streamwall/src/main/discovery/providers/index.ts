/**
 * Static provider registry.
 *
 * Platform providers are instantiated here and exported as
 * an array for the DiscoveryManager to consume.
 */
import type { BaseProvider } from '../base'
import { KickProvider } from './kick'
import { TwitchProvider } from './twitch'
import { YouTubeProvider } from './youtube'

export const providers: BaseProvider[] = [
  new YouTubeProvider(),
  new TwitchProvider(),
  new KickProvider(),
]
