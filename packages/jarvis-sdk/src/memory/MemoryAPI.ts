/**
 * MemoryAPI
 * High-level API for memory operations
 */

import type {
  Memory,
  MemoryType,
  MemoryQuery,
  MemoryCreateOptions,
  MemoryUpdateOptions,
} from '../types';
import { MemoryStore, MemoryStoreConfig } from './MemoryStore';
import { VectorIndex, EmbeddingProvider, SearchResult } from './VectorIndex';

export interface MemoryAPIConfig extends MemoryStoreConfig {
  enableSemanticSearch?: boolean;
  embeddingProvider?: EmbeddingProvider;
}

/**
 * MemoryAPI provides unified access to memory operations
 */
export class MemoryAPI {
  private store: MemoryStore;
  private vectorIndex?: VectorIndex;
  private semanticEnabled: boolean;

  constructor(config: MemoryAPIConfig) {
    this.store = new MemoryStore(config);
    this.semanticEnabled = config.enableSemanticSearch ?? false;

    if (this.semanticEnabled) {
      this.vectorIndex = new VectorIndex();
      if (config.embeddingProvider) {
        this.vectorIndex.setEmbeddingProvider(config.embeddingProvider);
      }
    }
  }

  // ==================== CRUD Operations ====================

  /**
   * Create a new memory
   */
  async create(options: MemoryCreateOptions): Promise<Memory> {
    const memory = await this.store.create(options);

    // Index for semantic search if enabled
    if (this.vectorIndex) {
      try {
        await this.vectorIndex.index(memory);
      } catch (error) {
        console.warn('Failed to index memory for semantic search:', error);
      }
    }

    return memory;
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    return this.store.get(id);
  }

  /**
   * Update a memory
   */
  async update(id: string, options: MemoryUpdateOptions): Promise<Memory | null> {
    const updated = await this.store.update(id, options);

    // Re-index if content changed
    if (updated && options.content && this.vectorIndex) {
      try {
        await this.vectorIndex.index(updated);
      } catch (error) {
        console.warn('Failed to re-index memory:', error);
      }
    }

    return updated;
  }

  /**
   * Delete a memory
   */
  async delete(id: string): Promise<boolean> {
    const deleted = await this.store.delete(id);

    if (deleted && this.vectorIndex) {
      this.vectorIndex.remove(id);
    }

    return deleted;
  }

  // ==================== Query Operations ====================

  /**
   * Query memories with various filters
   */
  async query(options: MemoryQuery): Promise<Memory[]> {
    // Use semantic search if enabled and query is provided
    if (
      options.semantic &&
      options.query &&
      this.vectorIndex
    ) {
      const results = await this.vectorIndex.search(options.query, {
        limit: options.limit ?? 10,
        types: options.types,
        agentId: options.agentId,
      });
      return results.map((r) => r.memory);
    }

    // Text-based search
    if (options.query) {
      return this.store.search(options.query, {
        agentId: options.agentId,
        types: options.types,
        limit: options.limit,
      });
    }

    // Filter by type
    if (options.types && options.types.length === 1) {
      let memories = await this.store.findByType(options.types[0], options.agentId);

      if (options.minImportance) {
        memories = memories.filter((m) => m.importance >= options.minImportance!);
      }

      if (options.limit) {
        memories = memories.slice(0, options.limit);
      }

      return memories;
    }

    // Filter by importance
    if (options.minImportance) {
      let memories = await this.store.findByImportance(
        options.minImportance,
        options.agentId
      );

      if (options.types) {
        memories = memories.filter((m) => options.types!.includes(m.type));
      }

      if (options.limit) {
        memories = memories.slice(0, options.limit);
      }

      return memories;
    }

    // Return all memories with optional filters
    let memories = await this.store.list(options.agentId);

    if (options.types) {
      memories = memories.filter((m) => options.types!.includes(m.type));
    }

    if (options.offset) {
      memories = memories.slice(options.offset);
    }

    if (options.limit) {
      memories = memories.slice(0, options.limit);
    }

    return memories;
  }

  /**
   * Search memories semantically
   */
  async semanticSearch(
    query: string,
    options?: {
      limit?: number;
      minScore?: number;
      types?: MemoryType[];
      agentId?: string;
    }
  ): Promise<SearchResult[]> {
    if (!this.vectorIndex) {
      throw new Error('Semantic search is not enabled');
    }

    return this.vectorIndex.search(query, options);
  }

  /**
   * List memories by type
   */
  async listByType(type: MemoryType, agentId?: string): Promise<Memory[]> {
    return this.store.findByType(type, agentId);
  }

  /**
   * List all memories for an agent
   */
  async listByAgent(agentId: string): Promise<Memory[]> {
    return this.store.list(agentId);
  }

  // ==================== Bulk Operations ====================

  /**
   * Create multiple memories
   */
  async createMany(memoriesData: MemoryCreateOptions[]): Promise<Memory[]> {
    const memories = await this.store.createMany(memoriesData);

    // Index for semantic search
    if (this.vectorIndex) {
      try {
        await this.vectorIndex.indexBatch(memories);
      } catch (error) {
        console.warn('Failed to batch index memories:', error);
      }
    }

    return memories;
  }

  /**
   * Delete multiple memories
   */
  async deleteMany(ids: string[]): Promise<number> {
    let deleted = 0;

    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }

    return deleted;
  }

  // ==================== Memory Types ====================

  /**
   * Store a fact
   */
  async storeFact(
    agentId: string,
    content: string,
    importance?: number
  ): Promise<Memory> {
    return this.create({
      agentId,
      type: 'fact',
      content,
      importance: importance ?? 0.6,
    });
  }

  /**
   * Store a preference
   */
  async storePreference(
    agentId: string,
    content: string,
    importance?: number
  ): Promise<Memory> {
    return this.create({
      agentId,
      type: 'preference',
      content,
      importance: importance ?? 0.7,
    });
  }

  /**
   * Store a pattern
   */
  async storePattern(
    agentId: string,
    content: string,
    importance?: number
  ): Promise<Memory> {
    return this.create({
      agentId,
      type: 'pattern',
      content,
      importance: importance ?? 0.5,
    });
  }

  /**
   * Store a task result
   */
  async storeTaskResult(
    agentId: string,
    taskId: string,
    result: string,
    metadata?: Record<string, unknown>
  ): Promise<Memory> {
    return this.create({
      agentId,
      type: 'task-result',
      content: result,
      metadata: { taskId, ...metadata },
      importance: 0.4,
    });
  }

  /**
   * Store context
   */
  async storeContext(
    agentId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Memory> {
    return this.create({
      agentId,
      type: 'context',
      content,
      metadata,
      importance: 0.5,
    });
  }

  /**
   * Store conversation history
   */
  async storeConversation(
    agentId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Memory> {
    return this.create({
      agentId,
      type: 'conversation',
      content,
      metadata,
      importance: 0.3,
    });
  }

  // ==================== Convenience Methods ====================

  /**
   * Get relevant context for a query
   */
  async getContext(
    query: string,
    agentId: string,
    options?: {
      limit?: number;
      includeTypes?: MemoryType[];
    }
  ): Promise<Memory[]> {
    const types = options?.includeTypes ?? ['fact', 'preference', 'context', 'pattern'];
    const limit = options?.limit ?? 10;

    if (this.vectorIndex) {
      const results = await this.vectorIndex.search(query, {
        limit,
        types,
        agentId,
        minScore: 0.5,
      });
      return results.map((r) => r.memory);
    }

    return this.store.search(query, {
      agentId,
      types,
      limit,
    });
  }

  /**
   * Get facts about a topic
   */
  async getFactsAbout(
    topic: string,
    agentId: string,
    limit?: number
  ): Promise<Memory[]> {
    return this.query({
      query: topic,
      agentId,
      types: ['fact'],
      limit: limit ?? 5,
      semantic: true,
    });
  }

  /**
   * Get user preferences
   */
  async getPreferences(agentId: string): Promise<Memory[]> {
    return this.listByType('preference', agentId);
  }

  /**
   * Refresh the memory index
   */
  async refresh(): Promise<void> {
    this.store.invalidateCache();
    await this.store.loadAll();

    // Re-index all for semantic search
    if (this.vectorIndex) {
      this.vectorIndex.clear();
      const memories = await this.store.list();
      for (const memory of memories) {
        try {
          await this.vectorIndex.index(memory);
        } catch (error) {
          console.warn(`Failed to index memory ${memory.id}:`, error);
        }
      }
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<MemoryType, number>;
    indexStats?: {
      count: number;
      dimensions: number;
      hasProvider: boolean;
    };
  }> {
    const memories = await this.store.list();

    const byType: Record<MemoryType, number> = {
      fact: 0,
      preference: 0,
      pattern: 0,
      'task-result': 0,
      context: 0,
      conversation: 0,
    };

    for (const memory of memories) {
      byType[memory.type]++;
    }

    const stats: {
      total: number;
      byType: Record<MemoryType, number>;
      indexStats?: {
        count: number;
        dimensions: number;
        hasProvider: boolean;
      };
    } = {
      total: memories.length,
      byType,
    };

    if (this.vectorIndex) {
      const indexStats = this.vectorIndex.stats();
      stats.indexStats = {
        count: indexStats.count,
        dimensions: indexStats.dimensions,
        hasProvider: indexStats.hasProvider,
      };
    }

    return stats;
  }
}
