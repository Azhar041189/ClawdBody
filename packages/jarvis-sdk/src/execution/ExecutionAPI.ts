/**
 * ExecutionAPI
 * High-level API for task submission and agent management
 */

import type {
  Agent,
  Task,
  DeployAgentOptions,
  SubmitTaskOptions,
  TaskPayload,
  TaskPriority,
  JarvisEventHandler,
} from '../types';
import { AgentOrchestrator, OrchestratorConfig } from './AgentOrchestrator';
import { nanoid } from 'nanoid';

export interface ExecutionAPIConfig extends OrchestratorConfig {
  tenantId?: string;
}

/**
 * ExecutionAPI provides a simple interface for task execution
 */
export class ExecutionAPI {
  private orchestrator: AgentOrchestrator;
  private tenantId?: string;

  constructor(config: ExecutionAPIConfig) {
    this.orchestrator = new AgentOrchestrator(config);
    this.tenantId = config.tenantId;
  }

  // ==================== Agent Management ====================

  /**
   * Deploy a new agent
   */
  async deployAgent(options: DeployAgentOptions): Promise<Agent> {
    return this.orchestrator.deployAgent({
      ...options,
      tenantId: options.tenantId ?? this.tenantId,
    });
  }

  /**
   * Start a stopped agent
   */
  async startAgent(agentId: string): Promise<Agent> {
    return this.orchestrator.startAgent(agentId);
  }

  /**
   * Stop a running agent
   */
  async stopAgent(agentId: string): Promise<Agent> {
    return this.orchestrator.stopAgent(agentId);
  }

  /**
   * Restart an agent
   */
  async restartAgent(agentId: string): Promise<Agent> {
    return this.orchestrator.restartAgent(agentId);
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    return this.orchestrator.deleteAgent(agentId);
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | null {
    return this.orchestrator.getAgent(agentId);
  }

  /**
   * List all agents
   */
  listAgents(): Agent[] {
    if (this.tenantId) {
      return this.orchestrator.getAgentsByTenant(this.tenantId);
    }
    return this.orchestrator.getAllAgents();
  }

  /**
   * List running agents
   */
  listRunningAgents(): Agent[] {
    const agents = this.orchestrator.getAgentsByStatus('running');
    if (this.tenantId) {
      return agents.filter((a) => a.tenantId === this.tenantId);
    }
    return agents;
  }

  // ==================== Task Submission ====================

  /**
   * Submit a task for execution
   */
  async submitTask(
    instruction: string,
    options?: SubmitTaskOptions
  ): Promise<Task> {
    const payload: TaskPayload = {
      instruction,
      context: options?.context,
      deadline: options?.deadline,
    };

    const task: Task = {
      id: nanoid(),
      agentId: options?.agentId,
      tenantId: this.tenantId,
      type: 'command',
      priority: options?.priority ?? 'p2',
      status: 'pending',
      payload,
      createdAt: new Date(),
    };

    return this.orchestrator.submitTask(task, options?.agentId);
  }

  /**
   * Submit multiple tasks
   */
  async submitTasks(
    tasks: Array<{
      instruction: string;
      priority?: TaskPriority;
      context?: Record<string, unknown>;
    }>
  ): Promise<Task[]> {
    const results: Task[] = [];

    for (const taskDef of tasks) {
      const task = await this.submitTask(taskDef.instruction, {
        priority: taskDef.priority,
        context: taskDef.context,
      });
      results.push(task);
    }

    return results;
  }

  /**
   * Submit a scheduled task
   */
  async scheduleTask(
    instruction: string,
    scheduledFor: Date,
    options?: Omit<SubmitTaskOptions, 'deadline'>
  ): Promise<Task> {
    const payload: TaskPayload = {
      instruction,
      context: options?.context,
      deadline: scheduledFor,
    };

    const task: Task = {
      id: nanoid(),
      agentId: options?.agentId,
      tenantId: this.tenantId,
      type: 'scheduled',
      priority: options?.priority ?? 'p2',
      status: 'pending',
      payload,
      createdAt: new Date(),
    };

    return this.orchestrator.submitTask(task, options?.agentId);
  }

  /**
   * Get a task by ID
   */
  getTask(agentId: string, taskId: string): Task | null {
    return this.orchestrator.getTask(agentId, taskId);
  }

  /**
   * Cancel a task
   */
  cancelTask(agentId: string, taskId: string): boolean {
    return this.orchestrator.cancelTask(agentId, taskId);
  }

  /**
   * Get queue status for an agent
   */
  getQueueStatus(agentId: string) {
    return this.orchestrator.getQueueStatus(agentId);
  }

  // ==================== Direct Execution ====================

  /**
   * Execute a command directly on an agent
   */
  async executeCommand(
    agentId: string,
    command: string
  ): Promise<{ output: string; success: boolean }> {
    return this.orchestrator.executeCommand(agentId, command);
  }

  /**
   * Take a screenshot of an agent
   */
  async screenshot(agentId: string): Promise<{ image: string }> {
    return this.orchestrator.screenshot(agentId);
  }

  // ==================== Health & Stats ====================

  /**
   * Check if an agent is healthy
   */
  async checkAgentHealth(agentId: string): Promise<boolean> {
    return this.orchestrator.checkHealth(agentId);
  }

  /**
   * Get execution stats
   */
  getStats() {
    return this.orchestrator.getStats();
  }

  // ==================== Events ====================

  /**
   * Subscribe to execution events
   */
  on(eventType: string, handler: JarvisEventHandler): void {
    this.orchestrator.on(eventType, handler);
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: string, handler: JarvisEventHandler): void {
    this.orchestrator.off(eventType, handler);
  }

  // ==================== Convenience Methods ====================

  /**
   * Deploy agent and submit task in one call
   */
  async deployAndExecute(
    agentName: string,
    instruction: string,
    options?: {
      agentConfig?: DeployAgentOptions['config'];
      taskPriority?: TaskPriority;
      taskContext?: Record<string, unknown>;
    }
  ): Promise<{ agent: Agent; task: Task }> {
    const agent = await this.deployAgent({
      name: agentName,
      config: options?.agentConfig,
    });

    const task = await this.submitTask(instruction, {
      agentId: agent.id,
      priority: options?.taskPriority,
      context: options?.taskContext,
    });

    return { agent, task };
  }

  /**
   * Find or deploy an agent and submit task
   */
  async ensureAgentAndExecute(
    instruction: string,
    options?: {
      agentName?: string;
      agentConfig?: DeployAgentOptions['config'];
      taskPriority?: TaskPriority;
      taskContext?: Record<string, unknown>;
    }
  ): Promise<{ agent: Agent; task: Task }> {
    // Try to find an available agent
    const runningAgents = this.listRunningAgents();
    let agent: Agent | null = null;

    for (const a of runningAgents) {
      const queueStatus = this.getQueueStatus(a.id);
      if (queueStatus && queueStatus.processing < queueStatus.maxConcurrent) {
        agent = a;
        break;
      }
    }

    // Deploy new agent if none available
    if (!agent) {
      agent = await this.deployAgent({
        name: options?.agentName ?? `agent-${nanoid(6)}`,
        config: options?.agentConfig,
      });
    }

    const task = await this.submitTask(instruction, {
      agentId: agent.id,
      priority: options?.taskPriority,
      context: options?.taskContext,
    });

    return { agent, task };
  }
}
