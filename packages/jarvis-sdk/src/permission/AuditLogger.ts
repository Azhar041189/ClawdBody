/**
 * AuditLogger
 * Compliance and audit logging
 */

import type { AuditEntry, AuditQuery, ActorType } from '../types';
import { nanoid } from 'nanoid';

export interface AuditLoggerConfig {
  maxEntries?: number;
  retentionDays?: number;
  persistFn?: (entry: AuditEntry) => Promise<void>;
}

/**
 * AuditLogger records all access and actions for compliance
 */
export class AuditLogger {
  private entries: AuditEntry[] = [];
  private maxEntries: number;
  private retentionDays: number;
  private persistFn?: (entry: AuditEntry) => Promise<void>;

  constructor(config?: AuditLoggerConfig) {
    this.maxEntries = config?.maxEntries ?? 10000;
    this.retentionDays = config?.retentionDays ?? 90;
    this.persistFn = config?.persistFn;
  }

  // ==================== Logging ====================

  /**
   * Log an audit entry
   */
  async log(
    actorId: string,
    actorType: ActorType,
    action: string,
    resource: string,
    result: 'success' | 'denied' | 'error',
    details?: Record<string, unknown>,
    tenantId?: string
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: nanoid(),
      tenantId,
      actorId,
      actorType,
      action,
      resource,
      result,
      details: details ?? {},
      timestamp: new Date(),
    };

    // Add to in-memory storage
    this.entries.push(entry);

    // Persist if configured
    if (this.persistFn) {
      try {
        await this.persistFn(entry);
      } catch (error) {
        console.error('Failed to persist audit entry:', error);
      }
    }

    // Cleanup old entries
    this.cleanup();

    return entry;
  }

  /**
   * Log a successful action
   */
  async logSuccess(
    actorId: string,
    actorType: ActorType,
    action: string,
    resource: string,
    details?: Record<string, unknown>,
    tenantId?: string
  ): Promise<AuditEntry> {
    return this.log(actorId, actorType, action, resource, 'success', details, tenantId);
  }

  /**
   * Log a denied action
   */
  async logDenied(
    actorId: string,
    actorType: ActorType,
    action: string,
    resource: string,
    reason: string,
    tenantId?: string
  ): Promise<AuditEntry> {
    return this.log(
      actorId,
      actorType,
      action,
      resource,
      'denied',
      { reason },
      tenantId
    );
  }

  /**
   * Log an error
   */
  async logError(
    actorId: string,
    actorType: ActorType,
    action: string,
    resource: string,
    error: Error | string,
    tenantId?: string
  ): Promise<AuditEntry> {
    return this.log(
      actorId,
      actorType,
      action,
      resource,
      'error',
      {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      },
      tenantId
    );
  }

  // ==================== Querying ====================

  /**
   * Query audit entries
   */
  query(options: AuditQuery): AuditEntry[] {
    let entries = [...this.entries];

    // Apply filters
    if (options.tenantId) {
      entries = entries.filter((e) => e.tenantId === options.tenantId);
    }

    if (options.actorId) {
      entries = entries.filter((e) => e.actorId === options.actorId);
    }

    if (options.actorType) {
      entries = entries.filter((e) => e.actorType === options.actorType);
    }

    if (options.action) {
      entries = entries.filter((e) => e.action === options.action);
    }

    if (options.resource) {
      entries = entries.filter((e) => e.resource === options.resource);
    }

    if (options.result) {
      entries = entries.filter((e) => e.result === options.result);
    }

    if (options.fromDate) {
      entries = entries.filter((e) => e.timestamp >= options.fromDate!);
    }

    if (options.toDate) {
      entries = entries.filter((e) => e.timestamp <= options.toDate!);
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (options.offset) {
      entries = entries.slice(options.offset);
    }

    if (options.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get entry by ID
   */
  get(id: string): AuditEntry | null {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  /**
   * Get recent entries
   */
  getRecent(limit: number = 100): AuditEntry[] {
    return this.query({ limit });
  }

  /**
   * Get entries for an actor
   */
  getByActor(
    actorId: string,
    options?: { limit?: number; fromDate?: Date }
  ): AuditEntry[] {
    return this.query({
      actorId,
      limit: options?.limit,
      fromDate: options?.fromDate,
    });
  }

  /**
   * Get entries for a resource
   */
  getByResource(
    resource: string,
    options?: { limit?: number; fromDate?: Date }
  ): AuditEntry[] {
    return this.query({
      resource,
      limit: options?.limit,
      fromDate: options?.fromDate,
    });
  }

  /**
   * Get denied actions
   */
  getDenied(options?: { limit?: number; fromDate?: Date }): AuditEntry[] {
    return this.query({
      result: 'denied',
      limit: options?.limit,
      fromDate: options?.fromDate,
    });
  }

  /**
   * Get errors
   */
  getErrors(options?: { limit?: number; fromDate?: Date }): AuditEntry[] {
    return this.query({
      result: 'error',
      limit: options?.limit,
      fromDate: options?.fromDate,
    });
  }

  // ==================== Analytics ====================

  /**
   * Get statistics
   */
  getStats(tenantId?: string): {
    total: number;
    byResult: Record<string, number>;
    byActorType: Record<string, number>;
    byAction: Record<string, number>;
  } {
    let entries = tenantId
      ? this.entries.filter((e) => e.tenantId === tenantId)
      : this.entries;

    const byResult: Record<string, number> = {};
    const byActorType: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    for (const entry of entries) {
      byResult[entry.result] = (byResult[entry.result] ?? 0) + 1;
      byActorType[entry.actorType] = (byActorType[entry.actorType] ?? 0) + 1;
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
    }

    return {
      total: entries.length,
      byResult,
      byActorType,
      byAction,
    };
  }

  /**
   * Get activity timeline
   */
  getTimeline(
    options?: {
      tenantId?: string;
      actorId?: string;
      bucketMinutes?: number;
      fromDate?: Date;
      toDate?: Date;
    }
  ): Array<{ timestamp: Date; count: number }> {
    const bucketMinutes = options?.bucketMinutes ?? 60;
    const bucketMs = bucketMinutes * 60 * 1000;

    let entries = this.query({
      tenantId: options?.tenantId,
      actorId: options?.actorId,
      fromDate: options?.fromDate,
      toDate: options?.toDate,
    });

    // Group by time bucket
    const buckets = new Map<number, number>();

    for (const entry of entries) {
      const bucketTime = Math.floor(entry.timestamp.getTime() / bucketMs) * bucketMs;
      buckets.set(bucketTime, (buckets.get(bucketTime) ?? 0) + 1);
    }

    // Convert to array
    return Array.from(buckets.entries())
      .map(([timestamp, count]) => ({
        timestamp: new Date(timestamp),
        count,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // ==================== Cleanup ====================

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    // Remove entries exceeding max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Remove entries older than retention period
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);

    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);
  }

  /**
   * Force cleanup
   */
  forceCleanup(): number {
    const beforeCount = this.entries.length;
    this.cleanup();
    return beforeCount - this.entries.length;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Export entries
   */
  export(query?: AuditQuery): string {
    const entries = query ? this.query(query) : this.entries;
    return JSON.stringify(entries, null, 2);
  }
}
