/**
 * VectorIndex
 * Optional semantic search using embeddings
 * Can be backed by pgvector, Pinecone, or in-memory
 */

import type { Memory, MemoryType } from '../types';

export interface VectorIndexConfig {
  dimensions?: number;
  similarity?: 'cosine' | 'euclidean' | 'dotProduct';
}

export interface SearchResult {
  memory: Memory;
  score: number;
}

/**
 * EmbeddingProvider interface for different embedding backends
 */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}

/**
 * VectorIndex provides semantic search capabilities
 * This is an in-memory implementation for simplicity
 * Production usage should use pgvector or similar
 */
export class VectorIndex {
  private embeddings: Map<string, number[]> = new Map();
  private memories: Map<string, Memory> = new Map();
  private dimensions: number;
  private similarity: 'cosine' | 'euclidean' | 'dotProduct';
  private embeddingProvider?: EmbeddingProvider;

  constructor(config?: VectorIndexConfig) {
    this.dimensions = config?.dimensions ?? 1536; // OpenAI ada-002 default
    this.similarity = config?.similarity ?? 'cosine';
  }

  /**
   * Set the embedding provider
   */
  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
    this.dimensions = provider.dimensions;
  }

  /**
   * Index a memory with its embedding
   */
  async index(memory: Memory, embedding?: number[]): Promise<void> {
    let vector = embedding;

    if (!vector && this.embeddingProvider) {
      vector = await this.embeddingProvider.embed(memory.content);
    }

    if (!vector) {
      throw new Error('No embedding provided and no embedding provider configured');
    }

    if (vector.length !== this.dimensions) {
      throw new Error(
        `Embedding dimensions mismatch: expected ${this.dimensions}, got ${vector.length}`
      );
    }

    this.embeddings.set(memory.id, vector);
    this.memories.set(memory.id, memory);
  }

  /**
   * Index multiple memories
   */
  async indexBatch(
    memories: Memory[],
    embeddings?: number[][]
  ): Promise<void> {
    let vectors = embeddings;

    if (!vectors && this.embeddingProvider) {
      vectors = await this.embeddingProvider.embedBatch(
        memories.map((m) => m.content)
      );
    }

    if (!vectors) {
      throw new Error('No embeddings provided and no embedding provider configured');
    }

    if (vectors.length !== memories.length) {
      throw new Error('Embeddings count must match memories count');
    }

    for (let i = 0; i < memories.length; i++) {
      this.embeddings.set(memories[i].id, vectors[i]);
      this.memories.set(memories[i].id, memories[i]);
    }
  }

  /**
   * Remove a memory from the index
   */
  remove(memoryId: string): boolean {
    const existed = this.embeddings.has(memoryId);
    this.embeddings.delete(memoryId);
    this.memories.delete(memoryId);
    return existed;
  }

  /**
   * Search for similar memories
   */
  async search(
    query: string | number[],
    options?: {
      limit?: number;
      minScore?: number;
      types?: MemoryType[];
      agentId?: string;
    }
  ): Promise<SearchResult[]> {
    let queryVector: number[];

    if (typeof query === 'string') {
      if (!this.embeddingProvider) {
        throw new Error('No embedding provider configured for text queries');
      }
      queryVector = await this.embeddingProvider.embed(query);
    } else {
      queryVector = query;
    }

    const results: SearchResult[] = [];

    for (const [id, embedding] of this.embeddings) {
      const memory = this.memories.get(id);
      if (!memory) continue;

      // Apply filters
      if (options?.types && !options.types.includes(memory.type)) {
        continue;
      }
      if (options?.agentId && memory.agentId !== options.agentId) {
        continue;
      }

      const score = this.calculateSimilarity(queryVector, embedding);

      if (options?.minScore && score < options.minScore) {
        continue;
      }

      results.push({ memory, score });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    const limit = options?.limit ?? 10;
    return results.slice(0, limit);
  }

  /**
   * Calculate similarity between two vectors
   */
  private calculateSimilarity(a: number[], b: number[]): number {
    switch (this.similarity) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return this.euclideanSimilarity(a, b);
      case 'dotProduct':
        return this.dotProduct(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  /**
   * Cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProd = this.dotProduct(a, b);
    const normA = Math.sqrt(this.dotProduct(a, a));
    const normB = Math.sqrt(this.dotProduct(b, b));
    return dotProd / (normA * normB);
  }

  /**
   * Euclidean similarity (1 / (1 + distance))
   */
  private euclideanSimilarity(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return 1 / (1 + Math.sqrt(sum));
  }

  /**
   * Dot product
   */
  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Get index statistics
   */
  stats(): {
    count: number;
    dimensions: number;
    similarity: string;
    hasProvider: boolean;
  } {
    return {
      count: this.embeddings.size,
      dimensions: this.dimensions,
      similarity: this.similarity,
      hasProvider: !!this.embeddingProvider,
    };
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.embeddings.clear();
    this.memories.clear();
  }

  /**
   * Get all indexed memory IDs
   */
  getIndexedIds(): string[] {
    return Array.from(this.embeddings.keys());
  }

  /**
   * Check if a memory is indexed
   */
  isIndexed(memoryId: string): boolean {
    return this.embeddings.has(memoryId);
  }

  /**
   * Get embedding for a memory
   */
  getEmbedding(memoryId: string): number[] | null {
    return this.embeddings.get(memoryId) ?? null;
  }
}

/**
 * Simple mock embedding provider for testing
 * Uses hash-based pseudo-random vectors
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;

  constructor(dimensions: number = 1536) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    return this.generateVector(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.generateVector(t));
  }

  private generateVector(text: string): number[] {
    const vector: number[] = [];
    let hash = 0;

    // Simple hash function
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }

    // Generate pseudo-random vector based on hash
    const random = this.seededRandom(hash);
    for (let i = 0; i < this.dimensions; i++) {
      vector.push(random() * 2 - 1); // Values between -1 and 1
    }

    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / norm);
  }

  private seededRandom(seed: number): () => number {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }
}
