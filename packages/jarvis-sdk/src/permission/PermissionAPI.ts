/**
 * PermissionAPI
 * High-level API for access control
 */

import type {
  Policy,
  PolicyRule,
  PermissionAction,
  ActorType,
  PermissionCheckOptions,
  AuditEntry,
  AuditQuery,
} from '../types';
import { PolicyEngine, PolicyEvalResult } from './PolicyEngine';
import { AuditLogger, AuditLoggerConfig } from './AuditLogger';

export interface PermissionAPIConfig {
  defaultDeny?: boolean;
  auditAll?: boolean;
  auditConfig?: AuditLoggerConfig;
}

/**
 * PermissionAPI provides unified access control
 */
export class PermissionAPI {
  private policyEngine: PolicyEngine;
  private auditLogger: AuditLogger;
  private defaultDeny: boolean;
  private auditAll: boolean;

  constructor(config?: PermissionAPIConfig) {
    this.policyEngine = new PolicyEngine();
    this.auditLogger = new AuditLogger(config?.auditConfig);
    this.defaultDeny = config?.defaultDeny ?? true;
    this.auditAll = config?.auditAll ?? true;
  }

  // ==================== Permission Checking ====================

  /**
   * Check if an action is allowed
   */
  async check(
    tenantId: string,
    options: PermissionCheckOptions
  ): Promise<boolean> {
    const result = this.policyEngine.evaluate(tenantId, options);

    // Log if auditing is enabled
    if (this.auditAll || !result.allowed) {
      await this.auditLogger.log(
        options.actorId,
        options.actorType,
        options.action,
        options.resource,
        result.allowed ? 'success' : 'denied',
        {
          reason: result.reason,
          matchedPolicy: result.matchedPolicy,
          context: options.context,
        },
        tenantId
      );
    }

    return result.allowed;
  }

  /**
   * Check with detailed result
   */
  async checkWithDetails(
    tenantId: string,
    options: PermissionCheckOptions
  ): Promise<PolicyEvalResult> {
    const result = this.policyEngine.evaluate(tenantId, options);

    // Log if auditing is enabled
    if (this.auditAll || !result.allowed) {
      await this.auditLogger.log(
        options.actorId,
        options.actorType,
        options.action,
        options.resource,
        result.allowed ? 'success' : 'denied',
        {
          reason: result.reason,
          matchedPolicy: result.matchedPolicy,
          matchedRule: result.matchedRule,
          context: options.context,
        },
        tenantId
      );
    }

    return result;
  }

  /**
   * Enforce permission (throws if denied)
   */
  async enforce(
    tenantId: string,
    options: PermissionCheckOptions
  ): Promise<void> {
    const result = await this.checkWithDetails(tenantId, options);

    if (!result.allowed) {
      throw new Error(`Permission denied: ${result.reason}`);
    }
  }

  /**
   * Check multiple actions at once
   */
  async checkMultiple(
    tenantId: string,
    checks: PermissionCheckOptions[]
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const check of checks) {
      const key = `${check.actorId}:${check.action}:${check.resource}`;
      const allowed = await this.check(tenantId, check);
      results.set(key, allowed);
    }

    return results;
  }

  /**
   * Check if actor can perform any of the actions
   */
  async canAny(
    tenantId: string,
    actorId: string,
    actorType: ActorType,
    resource: string,
    actions: PermissionAction[]
  ): Promise<boolean> {
    for (const action of actions) {
      const allowed = await this.check(tenantId, {
        actorId,
        actorType,
        resource,
        action,
      });
      if (allowed) return true;
    }
    return false;
  }

  /**
   * Check if actor can perform all actions
   */
  async canAll(
    tenantId: string,
    actorId: string,
    actorType: ActorType,
    resource: string,
    actions: PermissionAction[]
  ): Promise<boolean> {
    for (const action of actions) {
      const allowed = await this.check(tenantId, {
        actorId,
        actorType,
        resource,
        action,
      });
      if (!allowed) return false;
    }
    return true;
  }

  // ==================== Policy Management ====================

  /**
   * Create a policy
   */
  createPolicy(
    tenantId: string,
    name: string,
    rules: PolicyRule[],
    options?: {
      description?: string;
      priority?: number;
      enabled?: boolean;
    }
  ): Policy {
    return this.policyEngine.createPolicy(tenantId, name, rules, options);
  }

  /**
   * Get a policy
   */
  getPolicy(id: string): Policy | null {
    return this.policyEngine.getPolicy(id);
  }

  /**
   * Update a policy
   */
  updatePolicy(
    id: string,
    updates: Partial<Omit<Policy, 'id' | 'tenantId' | 'createdAt'>>
  ): Policy | null {
    return this.policyEngine.updatePolicy(id, updates);
  }

  /**
   * Delete a policy
   */
  deletePolicy(id: string): boolean {
    return this.policyEngine.deletePolicy(id);
  }

  /**
   * List policies for a tenant
   */
  listPolicies(tenantId: string): Policy[] {
    return this.policyEngine.listPolicies(tenantId);
  }

  /**
   * Enable a policy
   */
  enablePolicy(id: string): Policy | null {
    return this.policyEngine.updatePolicy(id, { enabled: true });
  }

  /**
   * Disable a policy
   */
  disablePolicy(id: string): Policy | null {
    return this.policyEngine.updatePolicy(id, { enabled: false });
  }

  // ==================== Built-in Policies ====================

  /**
   * Setup default policies for a tenant
   */
  setupDefaultPolicies(tenantId: string): {
    admin: Policy;
    agent: Policy;
  } {
    const admin = this.policyEngine.createAdminPolicy(tenantId);
    const agent = this.policyEngine.createAgentPolicy(tenantId);
    return { admin, agent };
  }

  /**
   * Create a resource-specific policy
   */
  createResourcePolicy(
    tenantId: string,
    resource: string,
    allowedActors: Array<{ id: string; type: ActorType }>,
    allowedActions: PermissionAction[]
  ): Policy {
    const rules: PolicyRule[] = [
      {
        effect: 'allow',
        actors: allowedActors.map((a) => ({ type: a.type, pattern: a.id })),
        resources: [resource],
        actions: allowedActions,
      },
    ];

    return this.createPolicy(tenantId, `Access to ${resource}`, rules, {
      description: `Policy for ${resource}`,
      priority: 10,
    });
  }

  /**
   * Create a role-based policy
   */
  createRolePolicy(
    tenantId: string,
    roleName: string,
    resources: string[],
    actions: PermissionAction[]
  ): Policy {
    const rules: PolicyRule[] = [
      {
        effect: 'allow',
        actors: [{ type: 'user', pattern: '*' }],
        resources,
        actions,
        conditions: [{ field: 'role', operator: 'eq', value: roleName }],
      },
    ];

    return this.createPolicy(tenantId, `Role: ${roleName}`, rules, {
      description: `Policy for ${roleName} role`,
      priority: 50,
    });
  }

  // ==================== Audit ====================

  /**
   * Log an audit entry directly
   */
  async audit(
    actorId: string,
    actorType: ActorType,
    action: string,
    resource: string,
    result: 'success' | 'denied' | 'error',
    details?: Record<string, unknown>,
    tenantId?: string
  ): Promise<AuditEntry> {
    return this.auditLogger.log(
      actorId,
      actorType,
      action,
      resource,
      result,
      details,
      tenantId
    );
  }

  /**
   * Query audit log
   */
  queryAuditLog(query: AuditQuery): AuditEntry[] {
    return this.auditLogger.query(query);
  }

  /**
   * Get recent audit entries
   */
  getRecentAuditEntries(limit?: number): AuditEntry[] {
    return this.auditLogger.getRecent(limit);
  }

  /**
   * Get audit entries for an actor
   */
  getAuditByActor(actorId: string, limit?: number): AuditEntry[] {
    return this.auditLogger.getByActor(actorId, { limit });
  }

  /**
   * Get denied actions
   */
  getDeniedActions(limit?: number): AuditEntry[] {
    return this.auditLogger.getDenied({ limit });
  }

  /**
   * Get audit statistics
   */
  getAuditStats(tenantId?: string) {
    return this.auditLogger.getStats(tenantId);
  }

  /**
   * Get activity timeline
   */
  getActivityTimeline(options?: {
    tenantId?: string;
    actorId?: string;
    bucketMinutes?: number;
    fromDate?: Date;
    toDate?: Date;
  }) {
    return this.auditLogger.getTimeline(options);
  }

  /**
   * Export audit log
   */
  exportAuditLog(query?: AuditQuery): string {
    return this.auditLogger.export(query);
  }

  // ==================== Stats ====================

  /**
   * Get permission system stats
   */
  getStats() {
    return {
      policy: this.policyEngine.getStats(),
      audit: this.auditLogger.getStats(),
    };
  }
}
