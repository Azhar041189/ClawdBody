/**
 * JarvisClient
 * Main entry point for the JARVIS SDK
 */

import type {
  JarvisConfig,
  JarvisMode,
  Agent,
  Task,
  Memory,
  MemoryQuery,
  DeployAgentOptions,
  SubmitTaskOptions,
  MemoryCreateOptions,
  Policy,
  PolicyRule,
  JarvisEventHandler,
  Device,
  RegisterDeviceOptions,
} from '../types';
import { ExecutionAPI, ExecutionAPIConfig } from '../execution/ExecutionAPI';
import { MemoryAPI, MemoryAPIConfig } from '../memory/MemoryAPI';
import { PermissionAPI, PermissionAPIConfig } from '../permission/PermissionAPI';
import { nanoid } from 'nanoid';

export interface JarvisClientOptions {
  tenantId?: string;
  enableSemanticSearch?: boolean;
  auditAllActions?: boolean;
}

/**
 * JarvisClient is the main SDK entry point
 */
export class JarvisClient {
  private config: JarvisConfig;
  private mode: JarvisMode;
  private tenantId: string;

  // APIs
  private executionAPI: ExecutionAPI;
  private memoryAPI?: MemoryAPI;
  private permissionAPI: PermissionAPI;

  // State
  private initialized: boolean = false;
  private devices: Map<string, Device> = new Map();

  constructor(config: JarvisConfig, options?: JarvisClientOptions) {
    this.config = config;
    this.mode = config.mode;
    this.tenantId = options?.tenantId ?? nanoid();

    // Initialize ExecutionAPI
    const executionConfig: ExecutionAPIConfig = {
      orgoApiKey: config.infrastructure.orgoApiKey,
      githubAccessToken: config.infrastructure.githubAccessToken,
      tenantId: this.tenantId,
      maxAgents: config.options?.maxConcurrentAgents,
      defaultAgentConfig: config.options?.defaultAgentConfig,
    };
    this.executionAPI = new ExecutionAPI(executionConfig);

    // Initialize PermissionAPI
    const permissionConfig: PermissionAPIConfig = {
      defaultDeny: true,
      auditAll: options?.auditAllActions ?? config.options?.auditLogEnabled ?? true,
    };
    this.permissionAPI = new PermissionAPI(permissionConfig);

    // Setup default policies
    this.permissionAPI.setupDefaultPolicies(this.tenantId);
  }

  /**
   * Initialize the client (must be called before most operations)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Future: Initialize database connections, etc.
    this.initialized = true;
  }

  // ==================== Agent Operations ====================

  /**
   * Deploy a new agent
   */
  async deployAgent(options: DeployAgentOptions): Promise<Agent> {
    await this.ensureInitialized();
    return this.executionAPI.deployAgent({
      ...options,
      tenantId: options.tenantId ?? this.tenantId,
    });
  }

  /**
   * Start a stopped agent
   */
  async startAgent(agentId: string): Promise<Agent> {
    await this.ensureInitialized();
    return this.executionAPI.startAgent(agentId);
  }

  /**
   * Stop a running agent
   */
  async stopAgent(agentId: string): Promise<Agent> {
    await this.ensureInitialized();
    return this.executionAPI.stopAgent(agentId);
  }

  /**
   * Restart an agent
   */
  async restartAgent(agentId: string): Promise<Agent> {
    await this.ensureInitialized();
    return this.executionAPI.restartAgent(agentId);
  }

  /**
   * Delete an agent
   */
  async deleteAgent(agentId: string): Promise<void> {
    await this.ensureInitialized();
    return this.executionAPI.deleteAgent(agentId);
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): Agent | null {
    return this.executionAPI.getAgent(agentId);
  }

  /**
   * List all agents
   */
  listAgents(): Agent[] {
    return this.executionAPI.listAgents();
  }

  // ==================== Task Operations ====================

  /**
   * Submit a task for execution
   */
  async submitTask(
    instruction: string,
    options?: SubmitTaskOptions
  ): Promise<Task> {
    await this.ensureInitialized();
    return this.executionAPI.submitTask(instruction, options);
  }

  /**
   * Submit multiple tasks
   */
  async submitTasks(
    tasks: Array<{
      instruction: string;
      priority?: Task['priority'];
      context?: Record<string, unknown>;
    }>
  ): Promise<Task[]> {
    await this.ensureInitialized();
    return this.executionAPI.submitTasks(tasks);
  }

  /**
   * Get a task by ID
   */
  getTask(agentId: string, taskId: string): Task | null {
    return this.executionAPI.getTask(agentId, taskId);
  }

  /**
   * Cancel a task
   */
  cancelTask(agentId: string, taskId: string): boolean {
    return this.executionAPI.cancelTask(agentId, taskId);
  }

  /**
   * Execute a command directly on an agent
   */
  async executeCommand(
    agentId: string,
    command: string
  ): Promise<{ output: string; success: boolean }> {
    await this.ensureInitialized();
    return this.executionAPI.executeCommand(agentId, command);
  }

  /**
   * Take a screenshot of an agent
   */
  async screenshot(agentId: string): Promise<{ image: string }> {
    await this.ensureInitialized();
    return this.executionAPI.screenshot(agentId);
  }

  // ==================== Memory Operations ====================

  /**
   * Initialize memory for an agent
   */
  async initializeMemory(
    agentId: string,
    vaultRepoName: string
  ): Promise<void> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const memoryConfig: MemoryAPIConfig = {
      githubAccessToken: this.config.infrastructure.githubAccessToken,
      vaultRepoName: vaultRepoName || agent.vaultRepoName,
      enableSemanticSearch: false, // Can be enabled with embedding provider
    };

    this.memoryAPI = new MemoryAPI(memoryConfig);
  }

  /**
   * Query memories
   */
  async queryMemory(query: MemoryQuery): Promise<Memory[]> {
    await this.ensureMemoryInitialized();
    return this.memoryAPI!.query(query);
  }

  /**
   * Create a memory
   */
  async createMemory(options: MemoryCreateOptions): Promise<Memory> {
    await this.ensureMemoryInitialized();
    return this.memoryAPI!.create(options);
  }

  /**
   * Get a memory by ID
   */
  async getMemory(id: string): Promise<Memory | null> {
    await this.ensureMemoryInitialized();
    return this.memoryAPI!.get(id);
  }

  /**
   * Delete a memory
   */
  async deleteMemory(id: string): Promise<boolean> {
    await this.ensureMemoryInitialized();
    return this.memoryAPI!.delete(id);
  }

  /**
   * Store a fact
   */
  async storeFact(
    agentId: string,
    content: string,
    importance?: number
  ): Promise<Memory> {
    await this.ensureMemoryInitialized();
    return this.memoryAPI!.storeFact(agentId, content, importance);
  }

  /**
   * Store a preference
   */
  async storePreference(
    agentId: string,
    content: string,
    importance?: number
  ): Promise<Memory> {
    await this.ensureMemoryInitialized();
    return this.memoryAPI!.storePreference(agentId, content, importance);
  }

  /**
   * Get relevant context for a query
   */
  async getContext(
    query: string,
    agentId: string,
    limit?: number
  ): Promise<Memory[]> {
    await this.ensureMemoryInitialized();
    return this.memoryAPI!.getContext(query, agentId, { limit });
  }

  // ==================== Permission Operations ====================

  /**
   * Check if an action is allowed
   */
  async checkPermission(
    actorId: string,
    actorType: 'user' | 'agent' | 'service' | 'system',
    resource: string,
    action: 'create' | 'read' | 'update' | 'delete' | 'execute' | 'admin' | '*',
    context?: Record<string, unknown>
  ): Promise<boolean> {
    return this.permissionAPI.check(this.tenantId, {
      actorId,
      actorType,
      resource,
      action,
      context,
    });
  }

  /**
   * Create a policy
   */
  createPolicy(
    name: string,
    rules: PolicyRule[],
    options?: { description?: string; priority?: number }
  ): Policy {
    return this.permissionAPI.createPolicy(this.tenantId, name, rules, options);
  }

  /**
   * List policies
   */
  listPolicies(): Policy[] {
    return this.permissionAPI.listPolicies(this.tenantId);
  }

  /**
   * Get audit log
   */
  getAuditLog(options?: {
    limit?: number;
    actorId?: string;
    action?: string;
    fromDate?: Date;
  }) {
    return this.permissionAPI.queryAuditLog({
      tenantId: this.tenantId,
      ...options,
    });
  }

  // ==================== Device Operations (Consumer Mode) ====================

  /**
   * Register a device
   */
  registerDevice(options: RegisterDeviceOptions): Device {
    if (this.mode !== 'consumer') {
      throw new Error('Device operations are only available in consumer mode');
    }

    const device: Device = {
      id: nanoid(),
      userId: options.userId,
      tenantId: this.tenantId,
      type: options.type,
      platform: options.platform,
      name: options.name,
      capabilities: {
        hasVoice: options.capabilities?.hasVoice ?? false,
        hasCamera: options.capabilities?.hasCamera ?? false,
        hasGPS: options.capabilities?.hasGPS ?? false,
        hasBiometrics: options.capabilities?.hasBiometrics ?? false,
        hasHaptics: options.capabilities?.hasHaptics ?? false,
        customSensors: options.capabilities?.customSensors,
      },
      status: 'online',
      lastSeenAt: new Date(),
      createdAt: new Date(),
    };

    this.devices.set(device.id, device);
    return device;
  }

  /**
   * Get a device
   */
  getDevice(deviceId: string): Device | null {
    return this.devices.get(deviceId) ?? null;
  }

  /**
   * List devices for a user
   */
  listDevices(userId?: string): Device[] {
    const devices = Array.from(this.devices.values());
    if (userId) {
      return devices.filter((d) => d.userId === userId);
    }
    return devices;
  }

  /**
   * Update device status
   */
  updateDeviceStatus(
    deviceId: string,
    status: 'online' | 'offline' | 'away' | 'dnd'
  ): Device | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    device.status = status;
    device.lastSeenAt = new Date();
    return device;
  }

  /**
   * Process voice command (consumer mode)
   */
  async processVoiceCommand(
    audioBuffer: Buffer,
    deviceId: string
  ): Promise<{ text: string; task?: Task }> {
    if (this.mode !== 'consumer') {
      throw new Error('Voice commands are only available in consumer mode');
    }

    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (!device.capabilities.hasVoice) {
      throw new Error('Device does not have voice capability');
    }

    // TODO: Implement actual voice transcription
    // This is a placeholder that would integrate with speech-to-text
    throw new Error('Voice transcription not yet implemented');
  }

  // ==================== Events ====================

  /**
   * Subscribe to events
   */
  on(eventType: string, handler: JarvisEventHandler): void {
    this.executionAPI.on(eventType, handler);
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: string, handler: JarvisEventHandler): void {
    this.executionAPI.off(eventType, handler);
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
      taskPriority?: Task['priority'];
      taskContext?: Record<string, unknown>;
    }
  ): Promise<{ agent: Agent; task: Task }> {
    await this.ensureInitialized();
    return this.executionAPI.deployAndExecute(agentName, instruction, options);
  }

  /**
   * Ensure agent exists and submit task
   */
  async ensureAndExecute(
    instruction: string,
    options?: {
      agentName?: string;
      agentConfig?: DeployAgentOptions['config'];
      taskPriority?: Task['priority'];
      taskContext?: Record<string, unknown>;
    }
  ): Promise<{ agent: Agent; task: Task }> {
    await this.ensureInitialized();
    return this.executionAPI.ensureAgentAndExecute(instruction, options);
  }

  // ==================== Stats & Health ====================

  /**
   * Get client stats
   */
  getStats() {
    return {
      mode: this.mode,
      tenantId: this.tenantId,
      initialized: this.initialized,
      execution: this.executionAPI.getStats(),
      permissions: this.permissionAPI.getStats(),
      devices: this.devices.size,
    };
  }

  /**
   * Check agent health
   */
  async checkAgentHealth(agentId: string): Promise<boolean> {
    return this.executionAPI.checkAgentHealth(agentId);
  }

  // ==================== Internal ====================

  /**
   * Ensure client is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Ensure memory API is initialized
   */
  private async ensureMemoryInitialized(): Promise<void> {
    if (!this.memoryAPI) {
      throw new Error(
        'Memory not initialized. Call initializeMemory() first.'
      );
    }
  }

  /**
   * Get tenant ID
   */
  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Get mode
   */
  getMode(): JarvisMode {
    return this.mode;
  }
}

/**
 * Create a JARVIS client
 */
export function createJarvisClient(
  config: JarvisConfig,
  options?: JarvisClientOptions
): JarvisClient {
  return new JarvisClient(config, options);
}
