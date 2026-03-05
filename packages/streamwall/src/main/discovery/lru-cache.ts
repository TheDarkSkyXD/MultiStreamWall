/**
 * Simple Map-based LRU cache.
 *
 * Uses Map iteration order (insertion order) for eviction.
 * Accessing a key via get() promotes it to most-recently-used
 * by deleting and re-inserting.
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>

  constructor(private maxSize: number) {
    this.cache = new Map()
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value === undefined) {
      return undefined
    }
    // Promote to most recently used
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    // If key exists, remove it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    this.cache.set(key, value)
    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) {
        this.cache.delete(oldest)
      }
    }
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
