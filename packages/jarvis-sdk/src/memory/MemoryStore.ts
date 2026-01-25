/**
 * MemoryStore
 * Git-backed persistent storage for agent memory
 */

import type { Memory, MemoryType, MemoryCreateOptions, MemoryUpdateOptions } from '../types';
import { GitHubAdapter } from '../adapters/GitHubAdapter';
import { nanoid } from 'nanoid';

export interface MemoryStoreConfig {
  githubAccessToken: string;
  vaultRepoName: string;
  memoryDir?: string;
}

interface StoredMemory {
  id: string;
  agentId: string;
  tenantId?: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  importance: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * MemoryStore manages Git-backed memory persistence
 */
export class MemoryStore {
  private github: GitHubAdapter;
  private repoName: string;
  private memoryDir: string;
  private cache: Map<string, Memory> = new Map();
  private cacheValid: boolean = false;

  constructor(config: MemoryStoreConfig) {
    this.github = new GitHubAdapter(config.githubAccessToken);
    this.repoName = config.vaultRepoName;
    this.memoryDir = config.memoryDir ?? 'memory';
  }

  // ==================== CRUD Operations ====================

  /**
   * Create a new memory entry
   */
  async create(options: MemoryCreateOptions): Promise<Memory> {
    const now = new Date();
    const memory: Memory = {
      id: nanoid(),
      agentId: options.agentId,
      type: options.type,
      content: options.content,
      metadata: options.metadata,
      importance: options.importance ?? 0.5,
      vaultPath: options.vaultPath,
      createdAt: now,
      updatedAt: now,
    };

    // Determine file path
    const filePath = memory.vaultPath ?? this.getFilePath(memory);

    // Store in Git
    await this.github.writeFile(
      this.repoName,
      filePath,
      this.serializeMemory(memory),
      `Add memory: ${memory.type} - ${memory.id}`
    );

    // Update cache
    this.cache.set(memory.id, memory);

    return memory;
  }

  /**
   * Get a memory by ID
   */
  async get(id: string): Promise<Memory | null> {
    // Check cache first
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    // Load all memories and search
    await this.loadAll();
    return this.cache.get(id) ?? null;
  }

  /**
   * Update a memory entry
   */
  async update(id: string, options: MemoryUpdateOptions): Promise<Memory | null> {
    const existing = await this.get(id);
    if (!existing) {
      return null;
    }

    const updated: Memory = {
      ...existing,
      content: options.content ?? existing.content,
      metadata: options.metadata ?? existing.metadata,
      importance: options.importance ?? existing.importance,
      updatedAt: new Date(),
    };

    // Update in Git
    const filePath = updated.vaultPath ?? this.getFilePath(updated);
    await this.github.writeFile(
      this.repoName,
      filePath,
      this.serializeMemory(updated),
      `Update memory: ${updated.type} - ${updated.id}`
    );

    // Update cache
    this.cache.set(id, updated);

    return updated;
  }

  /**
   * Delete a memory entry
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) {
      return false;
    }

    const filePath = existing.vaultPath ?? this.getFilePath(existing);

    try {
      await this.github.deleteFile(
        this.repoName,
        filePath,
        `Delete memory: ${existing.type} - ${id}`
      );
      this.cache.delete(id);
      return true;
    } catch {
      return false;
    }
  }

  // ==================== Query Operations ====================

  /**
   * List all memories
   */
  async list(agentId?: string): Promise<Memory[]> {
    await this.loadAll();

    let memories = Array.from(this.cache.values());

    if (agentId) {
      memories = memories.filter((m) => m.agentId === agentId);
    }

    return memories.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Find memories by type
   */
  async findByType(type: MemoryType, agentId?: string): Promise<Memory[]> {
    await this.loadAll();

    let memories = Array.from(this.cache.values()).filter(
      (m) => m.type === type
    );

    if (agentId) {
      memories = memories.filter((m) => m.agentId === agentId);
    }

    return memories.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Find memories by importance threshold
   */
  async findByImportance(
    minImportance: number,
    agentId?: string
  ): Promise<Memory[]> {
    await this.loadAll();

    let memories = Array.from(this.cache.values()).filter(
      (m) => m.importance >= minImportance
    );

    if (agentId) {
      memories = memories.filter((m) => m.agentId === agentId);
    }

    return memories.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Search memories by content (simple text search)
   */
  async search(
    query: string,
    options?: {
      agentId?: string;
      types?: MemoryType[];
      limit?: number;
    }
  ): Promise<Memory[]> {
    await this.loadAll();

    const queryLower = query.toLowerCase();
    let memories = Array.from(this.cache.values());

    // Filter by agent
    if (options?.agentId) {
      memories = memories.filter((m) => m.agentId === options.agentId);
    }

    // Filter by types
    if (options?.types && options.types.length > 0) {
      memories = memories.filter((m) => options.types!.includes(m.type));
    }

    // Filter by content match
    memories = memories.filter((m) =>
      m.content.toLowerCase().includes(queryLower)
    );

    // Sort by importance
    memories.sort((a, b) => b.importance - a.importance);

    // Apply limit
    if (options?.limit) {
      memories = memories.slice(0, options.limit);
    }

    return memories;
  }

  // ==================== Bulk Operations ====================

  /**
   * Create multiple memories in a single commit
   */
  async createMany(
    memoriesData: MemoryCreateOptions[]
  ): Promise<Memory[]> {
    const memories: Memory[] = [];
    const files: Array<{ path: string; content: string }> = [];

    for (const data of memoriesData) {
      const now = new Date();
      const memory: Memory = {
        id: nanoid(),
        agentId: data.agentId,
        type: data.type,
        content: data.content,
        metadata: data.metadata,
        importance: data.importance ?? 0.5,
        vaultPath: data.vaultPath,
        createdAt: now,
        updatedAt: now,
      };

      memories.push(memory);
      files.push({
        path: memory.vaultPath ?? this.getFilePath(memory),
        content: this.serializeMemory(memory),
      });

      this.cache.set(memory.id, memory);
    }

    // Write all in single commit
    await this.github.writeMultipleFiles(
      this.repoName,
      files,
      `Add ${memories.length} memories`
    );

    return memories;
  }

  /**
   * Load all memories from repository
   */
  async loadAll(): Promise<void> {
    if (this.cacheValid) {
      return;
    }

    try {
      // List all files in memory directories
      const types: MemoryType[] = [
        'fact',
        'preference',
        'pattern',
        'task-result',
        'context',
        'conversation',
      ];

      for (const type of types) {
        try {
          const dir = `${this.memoryDir}/${type}`;
          const files = await this.github.listDirectory(this.repoName, dir);

          for (const file of files) {
            if (file.type === 'file' && file.name.endsWith('.md')) {
              const content = await this.github.readFile(
                this.repoName,
                file.path
              );
              if (content) {
                const memory = this.deserializeMemory(content, file.path);
                if (memory) {
                  this.cache.set(memory.id, memory);
                }
              }
            }
          }
        } catch {
          // Directory might not exist, skip
        }
      }

      this.cacheValid = true;
    } catch (error) {
      console.error('Failed to load memories:', error);
    }
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.cacheValid = false;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheValid = false;
  }

  // ==================== Helpers ====================

  /**
   * Get file path for a memory
   */
  private getFilePath(memory: Memory): string {
    return `${this.memoryDir}/${memory.type}/${memory.id}.md`;
  }

  /**
   * Serialize memory to markdown
   */
  private serializeMemory(memory: Memory): string {
    const frontmatter = {
      id: memory.id,
      agentId: memory.agentId,
      tenantId: memory.tenantId,
      type: memory.type,
      importance: memory.importance,
      metadata: memory.metadata,
      createdAt: memory.createdAt.toISOString(),
      updatedAt: memory.updatedAt.toISOString(),
    };

    return `---
${JSON.stringify(frontmatter, null, 2)}
---

${memory.content}
`;
  }

  /**
   * Deserialize memory from markdown
   */
  private deserializeMemory(content: string, path: string): Memory | null {
    try {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        return null;
      }

      const frontmatter = JSON.parse(frontmatterMatch[1]) as StoredMemory;
      const memoryContent = frontmatterMatch[2].trim();

      return {
        id: frontmatter.id,
        agentId: frontmatter.agentId,
        tenantId: frontmatter.tenantId,
        type: frontmatter.type,
        content: memoryContent,
        metadata: frontmatter.metadata,
        importance: frontmatter.importance,
        vaultPath: path,
        createdAt: new Date(frontmatter.createdAt),
        updatedAt: new Date(frontmatter.updatedAt),
      };
    } catch {
      return null;
    }
  }
}
