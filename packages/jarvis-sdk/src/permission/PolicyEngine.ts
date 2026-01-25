/**
 * PolicyEngine
 * RBAC/ABAC policy evaluation
 */

import type {
  Policy,
  PolicyRule,
  PermissionAction,
  ActorType,
  PermissionCondition,
  PermissionCheckOptions,
} from '../types';
import { nanoid } from 'nanoid';

export interface PolicyEvalResult {
  allowed: boolean;
  reason: string;
  matchedPolicy?: string;
  matchedRule?: number;
}

/**
 * PolicyEngine evaluates access control policies
 */
export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();
  private tenantPolicies: Map<string, Set<string>> = new Map();

  // ==================== Policy Management ====================

  /**
   * Create a new policy
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
    const policy: Policy = {
      id: nanoid(),
      tenantId,
      name,
      description: options?.description,
      rules,
      priority: options?.priority ?? 0,
      enabled: options?.enabled ?? true,
      createdAt: new Date(),
    };

    this.policies.set(policy.id, policy);

    // Index by tenant
    let tenantSet = this.tenantPolicies.get(tenantId);
    if (!tenantSet) {
      tenantSet = new Set();
      this.tenantPolicies.set(tenantId, tenantSet);
    }
    tenantSet.add(policy.id);

    return policy;
  }

  /**
   * Get a policy by ID
   */
  getPolicy(id: string): Policy | null {
    return this.policies.get(id) ?? null;
  }

  /**
   * Update a policy
   */
  updatePolicy(
    id: string,
    updates: Partial<Omit<Policy, 'id' | 'tenantId' | 'createdAt'>>
  ): Policy | null {
    const policy = this.policies.get(id);
    if (!policy) return null;

    const updated: Policy = {
      ...policy,
      ...updates,
    };

    this.policies.set(id, updated);
    return updated;
  }

  /**
   * Delete a policy
   */
  deletePolicy(id: string): boolean {
    const policy = this.policies.get(id);
    if (!policy) return false;

    this.policies.delete(id);

    // Remove from tenant index
    const tenantSet = this.tenantPolicies.get(policy.tenantId);
    if (tenantSet) {
      tenantSet.delete(id);
    }

    return true;
  }

  /**
   * List policies for a tenant
   */
  listPolicies(tenantId: string): Policy[] {
    const tenantSet = this.tenantPolicies.get(tenantId);
    if (!tenantSet) return [];

    return Array.from(tenantSet)
      .map((id) => this.policies.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.priority - a.priority);
  }

  // ==================== Policy Evaluation ====================

  /**
   * Evaluate if an action is allowed
   */
  evaluate(
    tenantId: string,
    options: PermissionCheckOptions
  ): PolicyEvalResult {
    const policies = this.listPolicies(tenantId).filter((p) => p.enabled);

    if (policies.length === 0) {
      return {
        allowed: false,
        reason: 'No policies defined',
      };
    }

    // Evaluate policies in priority order
    for (const policy of policies) {
      for (let i = 0; i < policy.rules.length; i++) {
        const rule = policy.rules[i];
        const matches = this.matchesRule(rule, options);

        if (matches) {
          return {
            allowed: rule.effect === 'allow',
            reason: `Matched policy "${policy.name}" rule ${i + 1}`,
            matchedPolicy: policy.id,
            matchedRule: i,
          };
        }
      }
    }

    // Default deny
    return {
      allowed: false,
      reason: 'No matching policy rule (default deny)',
    };
  }

  /**
   * Check if a rule matches the request
   */
  private matchesRule(
    rule: PolicyRule,
    options: PermissionCheckOptions
  ): boolean {
    // Check actor match
    if (!this.matchesActor(rule.actors, options.actorType, options.actorId)) {
      return false;
    }

    // Check resource match
    if (!this.matchesResource(rule.resources, options.resource)) {
      return false;
    }

    // Check action match
    if (!this.matchesAction(rule.actions, options.action)) {
      return false;
    }

    // Check conditions
    if (rule.conditions && rule.conditions.length > 0) {
      if (!this.matchesConditions(rule.conditions, options.context ?? {})) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if actor matches
   */
  private matchesActor(
    actors: PolicyRule['actors'],
    actorType: ActorType,
    actorId: string
  ): boolean {
    for (const actor of actors) {
      if (actor.type !== actorType && actor.type !== ('*' as ActorType)) {
        continue;
      }

      if (this.matchesPattern(actor.pattern, actorId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if resource matches
   */
  private matchesResource(resources: string[], resource: string): boolean {
    for (const pattern of resources) {
      if (this.matchesPattern(pattern, resource)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if action matches
   */
  private matchesAction(
    actions: PermissionAction[],
    action: PermissionAction
  ): boolean {
    return actions.includes('*') || actions.includes(action);
  }

  /**
   * Check if conditions match
   */
  private matchesConditions(
    conditions: PermissionCondition[],
    context: Record<string, unknown>
  ): boolean {
    for (const condition of conditions) {
      const value = context[condition.field];

      switch (condition.operator) {
        case 'eq':
          if (value !== condition.value) return false;
          break;
        case 'neq':
          if (value === condition.value) return false;
          break;
        case 'in':
          if (!Array.isArray(condition.value) || !condition.value.includes(value)) {
            return false;
          }
          break;
        case 'nin':
          if (Array.isArray(condition.value) && condition.value.includes(value)) {
            return false;
          }
          break;
        case 'gt':
          if (typeof value !== 'number' || typeof condition.value !== 'number') {
            return false;
          }
          if (value <= condition.value) return false;
          break;
        case 'lt':
          if (typeof value !== 'number' || typeof condition.value !== 'number') {
            return false;
          }
          if (value >= condition.value) return false;
          break;
        case 'contains':
          if (typeof value !== 'string' || typeof condition.value !== 'string') {
            return false;
          }
          if (!value.includes(condition.value)) return false;
          break;
      }
    }
    return true;
  }

  /**
   * Match a pattern (supports * wildcard)
   */
  private matchesPattern(pattern: string, value: string): boolean {
    if (pattern === '*') return true;

    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  // ==================== Built-in Policies ====================

  /**
   * Create default admin policy
   */
  createAdminPolicy(tenantId: string): Policy {
    return this.createPolicy(tenantId, 'Admin Full Access', [
      {
        effect: 'allow',
        actors: [{ type: 'user', pattern: '*' }],
        resources: ['*'],
        actions: ['*'],
        conditions: [{ field: 'role', operator: 'eq', value: 'admin' }],
      },
    ], {
      description: 'Full access for admin users',
      priority: 100,
    });
  }

  /**
   * Create default agent policy
   */
  createAgentPolicy(tenantId: string): Policy {
    return this.createPolicy(tenantId, 'Agent Default Access', [
      {
        effect: 'allow',
        actors: [{ type: 'agent', pattern: '*' }],
        resources: ['task:*', 'memory:*', 'vault:*'],
        actions: ['read', 'create', 'update', 'execute'],
      },
      {
        effect: 'deny',
        actors: [{ type: 'agent', pattern: '*' }],
        resources: ['user:*', 'tenant:*', 'policy:*'],
        actions: ['*'],
      },
    ], {
      description: 'Default access for agents',
      priority: 50,
    });
  }

  /**
   * Create read-only policy
   */
  createReadOnlyPolicy(tenantId: string, name: string): Policy {
    return this.createPolicy(tenantId, name, [
      {
        effect: 'allow',
        actors: [{ type: 'user', pattern: '*' }],
        resources: ['*'],
        actions: ['read'],
      },
      {
        effect: 'deny',
        actors: [{ type: 'user', pattern: '*' }],
        resources: ['*'],
        actions: ['create', 'update', 'delete', 'execute', 'admin'],
      },
    ], {
      description: 'Read-only access',
      priority: 10,
    });
  }

  // ==================== Stats ====================

  /**
   * Get policy statistics
   */
  getStats(): {
    totalPolicies: number;
    policiesByTenant: Map<string, number>;
    enabledPolicies: number;
  } {
    let enabledPolicies = 0;
    const policiesByTenant = new Map<string, number>();

    for (const policy of this.policies.values()) {
      if (policy.enabled) enabledPolicies++;

      const count = policiesByTenant.get(policy.tenantId) ?? 0;
      policiesByTenant.set(policy.tenantId, count + 1);
    }

    return {
      totalPolicies: this.policies.size,
      policiesByTenant,
      enabledPolicies,
    };
  }
}
