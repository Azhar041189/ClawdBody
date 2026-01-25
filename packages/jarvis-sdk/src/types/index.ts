/**
 * JARVIS SDK Core Types
 */

// ==================== Configuration ====================

export type JarvisMode = 'enterprise' | 'consumer';

export interface JarvisConfig {
  apiKey: string;
  mode: JarvisMode;
  infrastructure: InfrastructureConfig;
  options?: JarvisOptions;
}

export interface InfrastructureConfig {
  orgoApiKey: string;
  githubAccessToken: string;
  databaseUrl: string;
}

export interface JarvisOptions {
  defaultAgentConfig?: Partial<AgentConfig>;
  maxConcurrentAgents?: number;
  memoryRetentionDays?: number;
  auditLogEnabled?: boolean;
}

// ==================== Agent Types ====================

export interface Agent {
  id: string;
  tenantId?: string;
  name: string;
  computerId: string;
  vaultRepoName: string;
  status: AgentStatus;
  capabilities: AgentCapabilities;
  config: AgentConfig;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentStatus =
  | 'provisioning'
  | 'starting'
  | 'running'
  | 'idle'
  | 'busy'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface AgentCapabilities {
  canExecuteBash: boolean;
  canAccessInternet: boolean;
  canAccessFiles: boolean;
  canSendMessages: boolean;
  customCapabilities?: string[];
}

export interface AgentConfig {
  ram?: 1 | 2 | 4 | 8 | 16 | 32 | 64;
  cpu?: 1 | 2 | 4 | 8 | 16;
  os?: 'linux' | 'windows';
  heartbeatIntervalMinutes?: number;
  maxConcurrentTasks?: number;
  systemPrompt?: string;
}

export interface DeployAgentOptions {
  name: string;
  tenantId?: string;
  config?: Partial<AgentConfig>;
  capabilities?: Partial<AgentCapabilities>;
}

// ==================== Task Types ====================

export interface Task {
  id: string;
  agentId?: string;
  tenantId?: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  payload: TaskPayload;
  result?: TaskResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export type TaskType = 'command' | 'scheduled' | 'inferred' | 'sync' | 'voice';

export type TaskPriority = 'p0' | 'p1' | 'p2' | 'p3';

export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskPayload {
  instruction: string;
  context?: Record<string, unknown>;
  attachments?: TaskAttachment[];
  deadline?: Date;
}

export interface TaskAttachment {
  type: 'file' | 'url' | 'data';
  name: string;
  content: string;
  mimeType?: string;
}

export interface TaskResult {
  success: boolean;
  output?: string;
  artifacts?: TaskArtifact[];
  error?: string;
  metrics?: TaskMetrics;
}

export interface TaskArtifact {
  type: 'file' | 'data' | 'log';
  name: string;
  content: string;
  mimeType?: string;
}

export interface TaskMetrics {
  durationMs: number;
  tokensUsed?: number;
  stepsExecuted?: number;
}

export interface SubmitTaskOptions {
  priority?: TaskPriority;
  agentId?: string;
  deadline?: Date;
  context?: Record<string, unknown>;
}

// ==================== Memory Types ====================

export interface Memory {
  id: string;
  agentId: string;
  tenantId?: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  importance: number;
  vaultPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MemoryType = 'fact' | 'preference' | 'pattern' | 'task-result' | 'context' | 'conversation';

export interface MemoryQuery {
  query?: string;
  types?: MemoryType[];
  agentId?: string;
  minImportance?: number;
  limit?: number;
  offset?: number;
  semantic?: boolean;
}

export interface MemoryCreateOptions {
  type: MemoryType;
  content: string;
  agentId: string;
  metadata?: Record<string, unknown>;
  importance?: number;
  vaultPath?: string;
}

export interface MemoryUpdateOptions {
  content?: string;
  metadata?: Record<string, unknown>;
  importance?: number;
}

// ==================== Permission Types ====================

export interface Permission {
  id: string;
  tenantId: string;
  actorId: string;
  actorType: ActorType;
  resource: string;
  action: PermissionAction;
  conditions?: PermissionCondition[];
  createdAt: Date;
}

export type ActorType = 'user' | 'agent' | 'service' | 'system';

export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'execute'
  | 'admin'
  | '*';

export interface PermissionCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'contains';
  value: unknown;
}

export interface PermissionCheckOptions {
  actorId: string;
  actorType: ActorType;
  resource: string;
  action: PermissionAction;
  context?: Record<string, unknown>;
}

export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  rules: PolicyRule[];
  priority: number;
  enabled: boolean;
  createdAt: Date;
}

export interface PolicyRule {
  effect: 'allow' | 'deny';
  actors: ActorMatcher[];
  resources: string[];
  actions: PermissionAction[];
  conditions?: PermissionCondition[];
}

export interface ActorMatcher {
  type: ActorType;
  pattern: string;
}

// ==================== Audit Types ====================

export interface AuditEntry {
  id: string;
  tenantId?: string;
  actorId: string;
  actorType: ActorType;
  action: string;
  resource: string;
  result: 'success' | 'denied' | 'error';
  details: Record<string, unknown>;
  timestamp: Date;
}

export interface AuditQuery {
  tenantId?: string;
  actorId?: string;
  actorType?: ActorType;
  action?: string;
  resource?: string;
  result?: 'success' | 'denied' | 'error';
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

// ==================== Device Types ====================

export interface Device {
  id: string;
  userId: string;
  tenantId?: string;
  type: DeviceType;
  platform: DevicePlatform;
  name?: string;
  capabilities: DeviceCapabilities;
  status: DeviceStatus;
  lastSeenAt?: Date;
  createdAt: Date;
}

export type DeviceType =
  | 'smartphone'
  | 'tablet'
  | 'wearable-watch'
  | 'wearable-glasses'
  | 'desktop'
  | 'embedded';

export type DevicePlatform = 'ios' | 'android' | 'web' | 'embedded' | 'unknown';

export type DeviceStatus = 'online' | 'offline' | 'away' | 'dnd';

export interface DeviceCapabilities {
  hasVoice: boolean;
  hasCamera: boolean;
  hasGPS: boolean;
  hasBiometrics: boolean;
  hasHaptics: boolean;
  customSensors?: string[];
}

export interface RegisterDeviceOptions {
  userId: string;
  type: DeviceType;
  platform: DevicePlatform;
  name?: string;
  capabilities?: Partial<DeviceCapabilities>;
}

// ==================== Sync Types ====================

export interface SyncProvider {
  id: string;
  name: string;
  type: SyncProviderType;
  enabled: boolean;
  lastSyncAt?: Date;
  config: Record<string, unknown>;
}

export type SyncProviderType = 'gmail' | 'calendar' | 'slack' | 'notion' | 'github' | 'custom';

export interface SyncResult {
  providerId: string;
  success: boolean;
  itemsSynced: number;
  errors?: string[];
  nextSyncToken?: string;
  syncedAt: Date;
}

export interface SyncOptions {
  providers?: string[];
  fullSync?: boolean;
  since?: Date;
}

// ==================== Tenant Types ====================

export interface Tenant {
  id: string;
  name: string;
  type: JarvisMode;
  config?: TenantConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantConfig {
  maxAgents?: number;
  maxTasksPerDay?: number;
  memoryQuotaMB?: number;
  allowedCapabilities?: string[];
}

// ==================== Event Types ====================

export interface JarvisEvent {
  id: string;
  type: JarvisEventType;
  timestamp: Date;
  payload: Record<string, unknown>;
  source: {
    type: 'agent' | 'task' | 'memory' | 'device' | 'system';
    id: string;
  };
}

export type JarvisEventType =
  | 'agent.deployed'
  | 'agent.started'
  | 'agent.stopped'
  | 'agent.failed'
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'memory.created'
  | 'memory.updated'
  | 'device.connected'
  | 'device.disconnected'
  | 'sync.completed'
  | 'sync.failed';

export type JarvisEventHandler = (event: JarvisEvent) => void | Promise<void>;
