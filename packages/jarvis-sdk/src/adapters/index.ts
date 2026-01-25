/**
 * JARVIS SDK Adapters
 * Wraps existing Samantha infrastructure for SDK use
 */

export { OrgoAdapter, generateComputerName } from './OrgoAdapter';
export type {
  OrgoComputer,
  OrgoProject,
  CreateComputerOptions,
  CommandResult,
  ScreenshotResult,
} from './OrgoAdapter';

export { GitHubAdapter } from './GitHubAdapter';
export type {
  GitHubUser,
  GitHubRepo,
  VaultRepoInfo,
  FileOperation,
} from './GitHubAdapter';

export { VMSetupAdapter } from './VMSetupAdapter';
export type {
  SetupProgress,
  ProgressCallback,
  VMSetupOptions,
  FullSetupOptions,
  SetupResult,
} from './VMSetupAdapter';
