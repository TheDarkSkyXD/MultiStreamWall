import { describe, it, expect } from 'vitest'
import { toStreamData } from '../mapper'
import type { DiscoveredStream } from '../types'

describe('toStreamData', () => {
  const sampleStream: DiscoveredStream = {
    platform: 'twitch',
    title: 'Playing Elden Ring',
    channelName: 'teststreamer',
    url: 'https://twitch.tv/teststreamer',
    thumbnailUrl: 'https://static-cdn.jtvnw.net/thumb.jpg',
    viewerCount: 1234,
    language: 'en',
    tags: ['gaming', 'rpg'],
    startedAt: '2026-03-05T12:00:00Z',
  }

  it('sets _dataSource to discovery:{platform}', () => {
    const result = toStreamData(sampleStream)
    expect(result._dataSource).toBe('discovery:twitch')
  })

  it('maps url to link', () => {
    const result = toStreamData(sampleStream)
    expect(result.link).toBe('https://twitch.tv/teststreamer')
  })

  it('maps title to label', () => {
    const result = toStreamData(sampleStream)
    expect(result.label).toBe('Playing Elden Ring')
  })

  it('maps channelName to source', () => {
    const result = toStreamData(sampleStream)
    expect(result.source).toBe('teststreamer')
  })

  it('sets kind to video', () => {
    const result = toStreamData(sampleStream)
    expect(result.kind).toBe('video')
  })

  it('preserves thumbnailUrl', () => {
    const result = toStreamData(sampleStream)
    expect(result.thumbnailUrl).toBe(
      'https://static-cdn.jtvnw.net/thumb.jpg',
    )
  })

  it('preserves viewerCount', () => {
    const result = toStreamData(sampleStream)
    expect(result.viewerCount).toBe(1234)
  })

  it('preserves platform', () => {
    const result = toStreamData(sampleStream)
    expect(result.platform).toBe('twitch')
  })

  it('preserves channelName', () => {
    const result = toStreamData(sampleStream)
    expect(result.channelName).toBe('teststreamer')
  })

  it('sets _id to empty string', () => {
    const result = toStreamData(sampleStream)
    expect(result._id).toBe('')
  })

  it('works with different platforms', () => {
    const kickStream: DiscoveredStream = {
      ...sampleStream,
      platform: 'kick',
      url: 'https://kick.com/teststreamer',
    }
    const result = toStreamData(kickStream)
    expect(result._dataSource).toBe('discovery:kick')
    expect(result.link).toBe('https://kick.com/teststreamer')
  })
})
