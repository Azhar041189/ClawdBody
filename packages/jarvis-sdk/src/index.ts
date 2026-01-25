/**
 * JARVIS SDK
 * Orchestration framework for always-running AI agents with persistent memory
 *
 * @packageDocumentation
 */

// Main client
export { JarvisClient, createJarvisClient } from './client';
export type { JarvisClientOptions } from './client';

// Types
export type {
  // Configuration
  JarvisConfig,
  JarvisMode,
  InfrastructureConfig,
  JarvisOptions,
  // Agent
  Agent,
  AgentStatus,
  AgentCapabilities,
  AgentConfig,
  DeployAgentOptions,
  // Task
  Task,
  TaskType,
  TaskPriority,
  TaskStatus,
  TaskPayload,
  TaskResult,
  TaskAttachment,
  TaskArtifact,
  TaskMetrics,
  SubmitTaskOptions,
  // Memory
  Memory,
  MemoryType,
  MemoryQuery,
  MemoryCreateOptions,
  MemoryUpdateOptions,
  // Permission
  Permission,
  PermissionAction,
  ActorType,
  PermissionCondition,
  PermissionCheckOptions,
  Policy,
  PolicyRule,
  ActorMatcher,
  // Audit
  AuditEntry,
  AuditQuery,
  // Device
  Device,
  DeviceType,
  DevicePlatform,
  DeviceStatus,
  DeviceCapabilities,
  RegisterDeviceOptions,
  // Sync
  SyncProvider,
  SyncProviderType,
  SyncResult,
  SyncOptions,
  // Tenant
  Tenant,
  TenantConfig,
  // Events
  JarvisEvent,
  JarvisEventType,
  JarvisEventHandler,
} from './types';

// Execution API
export { ExecutionAPI, AgentOrchestrator, TaskQueue } from './execution';
export type {
  ExecutionAPIConfig,
  OrchestratorConfig,
  TaskQueueOptions,
} from './execution';

// Memory API
export { MemoryAPI, MemoryStore, VectorIndex, MockEmbeddingProvider } from './memory';
export type {
  MemoryAPIConfig,
  MemoryStoreConfig,
  VectorIndexConfig,
  SearchResult,
  EmbeddingProvider,
} from './memory';

// Permission API
export { PermissionAPI, PolicyEngine, AuditLogger } from './permission';
export type {
  PermissionAPIConfig,
  PolicyEvalResult,
  AuditLoggerConfig,
} from './permission';

// Adapters
export {
  OrgoAdapter,
  GitHubAdapter,
  VMSetupAdapter,
  generateComputerName,
} from './adapters';
export type {
  OrgoComputer,
  OrgoProject,
  CreateComputerOptions,
  CommandResult,
  ScreenshotResult,
  GitHubUser,
  GitHubRepo,
  VaultRepoInfo,
  FileOperation,
  SetupProgress,
  ProgressCallback,
  VMSetupOptions,
  FullSetupOptions,
  SetupResult,
} from './adapters';
