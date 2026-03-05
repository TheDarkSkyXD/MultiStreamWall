import { describe, it, expect } from 'vitest'
import { LRUCache } from '../lru-cache'

describe('LRUCache', () => {
  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<string, string>(10)
    expect(cache.get('missing')).toBeUndefined()
  })

  it('stores and retrieves values', () => {
    const cache = new LRUCache<string, number>(10)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBe(2)
  })

  it('evicts oldest entry when capacity exceeded', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.set('d', 4) // should evict 'a'

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('get() promotes entry to most-recently-used', () => {
    const cache = new LRUCache<string, number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    cache.get('a') // promote 'a' to most recent

    cache.set('d', 4) // should evict 'b' (now oldest)

    expect(cache.get('a')).toBe(1) // still present
    expect(cache.get('b')).toBeUndefined() // evicted
    expect(cache.get('c')).toBe(3)
    expect(cache.get('d')).toBe(4)
  })

  it('has() returns true for existing keys', () => {
    const cache = new LRUCache<string, number>(10)
    cache.set('a', 1)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
  })

  it('size reflects current number of entries', () => {
    const cache = new LRUCache<string, number>(10)
    expect(cache.size).toBe(0)
    cache.set('a', 1)
    expect(cache.size).toBe(1)
    cache.set('b', 2)
    expect(cache.size).toBe(2)
  })

  it('clear() removes all entries', () => {
    const cache = new LRUCache<string, number>(10)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
  })

  it('size does not exceed maxSize after evictions', () => {
    const cache = new LRUCache<string, number>(2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.size).toBe(2)
  })
})
