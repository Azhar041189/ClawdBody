/**
 * VMSetupAdapter
 * Wraps the Samantha VMSetup for JARVIS SDK
 * Provides agent provisioning pipeline
 */

import { OrgoAdapter } from './OrgoAdapter';

export interface SetupProgress {
  step: string;
  message: string;
  success: boolean;
  output?: string;
}

export type ProgressCallback = (progress: SetupProgress) => void;

export interface VMSetupOptions {
  onProgress?: ProgressCallback;
  retryAttempts?: number;
  commandTimeoutMs?: number;
}

export interface FullSetupOptions {
  githubUsername: string;
  githubEmail: string;
  repoSshUrl: string;
  claudeApiKey: string;
  telegramBotToken?: string;
  telegramUserId?: string;
  heartbeatIntervalMinutes?: number;
  knowledgeRepos?: Array<{ name: string; sshUrl: string }>;
}

export interface SetupResult {
  success: boolean;
  error?: string;
  publicKey?: string;
}

/**
 * VMSetupAdapter wraps VM configuration logic
 * Based on existing Samantha VMSetup
 */
export class VMSetupAdapter {
  private orgo: OrgoAdapter;
  private computerId: string;
  private onProgress?: ProgressCallback;
  private retryAttempts: number;

  constructor(
    orgo: OrgoAdapter,
    computerId: string,
    options?: VMSetupOptions
  ) {
    this.orgo = orgo;
    this.computerId = computerId;
    this.onProgress = options?.onProgress;
    this.retryAttempts = options?.retryAttempts ?? 2;
  }

  /**
   * Run command with progress reporting and retries
   */
  private async runCommand(
    command: string,
    step: string
  ): Promise<{ output: string; success: boolean }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await this.orgo.bash(this.computerId, command);

        this.onProgress?.({
          step,
          message: result.success ? `Completed: ${step}` : `Failed: ${step}`,
          success: result.success,
          output: result.output,
        });

        return { output: result.output, success: result.success };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const message = lastError.message;

        // Retry on transient errors
        if (
          attempt < this.retryAttempts &&
          (message.includes('502') ||
            message.includes('Failed to execute') ||
            message.includes('ECONNREFUSED'))
        ) {
          const waitTime = (attempt + 1) * 2000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        this.onProgress?.({
          step,
          message: `Error: ${message}`,
          success: false,
        });
        return { output: message, success: false };
      }
    }

    const message = lastError?.message || 'Unknown error';
    return { output: message, success: false };
  }

  /**
   * Wait for VM to be ready
   */
  private async waitForVMReady(
    maxRetries = 10,
    delayMs = 3000
  ): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.orgo.bash(this.computerId, 'echo "ready"');
        if (result.success) {
          return true;
        }
      } catch {
        // VM not ready yet
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return false;
  }

  // ==================== Setup Steps ====================

  /**
   * Generate SSH key pair for GitHub access
   */
  async generateSSHKey(): Promise<{ publicKey: string; success: boolean }> {
    // Ensure .ssh directory exists
    const mkdirResult = await this.runCommand(
      'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
      'Create .ssh directory'
    );

    if (!mkdirResult.success) {
      return { publicKey: '', success: false };
    }

    // Check ssh-keygen availability
    const checkSshKeygen = await this.runCommand(
      'which ssh-keygen || command -v ssh-keygen',
      'Check ssh-keygen availability'
    );

    if (!checkSshKeygen.success || !checkSshKeygen.output.trim()) {
      // Try to install openssh-client
      const installSsh = await this.runCommand(
        'sudo apt-get update -qq && sudo apt-get install -y -qq openssh-client',
        'Install openssh-client'
      );

      if (!installSsh.success) {
        return { publicKey: '', success: false };
      }
    }

    // Remove existing key
    await this.runCommand(
      'rm -f ~/.ssh/id_ed25519 ~/.ssh/id_ed25519.pub',
      'Remove existing SSH key'
    );

    // Generate SSH key
    const keyGen = await this.runCommand(
      'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "jarvis-agent"',
      'Generate SSH key'
    );

    if (!keyGen.success) {
      return { publicKey: '', success: false };
    }

    // Get public key
    const pubKey = await this.runCommand(
      'cat ~/.ssh/id_ed25519.pub',
      'Read public key'
    );

    if (!pubKey.success || !pubKey.output.trim()) {
      return { publicKey: '', success: false };
    }

    return {
      publicKey: pubKey.output.trim(),
      success: true,
    };
  }

  /**
   * Configure Git with user info
   */
  async configureGit(username: string, email: string): Promise<boolean> {
    const commands = [
      `git config --global user.name "${username}"`,
      `git config --global user.email "${email}"`,
      'git config --global init.defaultBranch main',
      'mkdir -p ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null',
    ];

    for (const cmd of commands) {
      const result = await this.runCommand(cmd, 'Configure Git');
      if (!result.success) return false;
    }

    return true;
  }

  /**
   * Clone the vault repository
   */
  async cloneVaultRepo(sshUrl: string): Promise<boolean> {
    const result = await this.runCommand(
      `rm -rf ~/vault && git clone ${sshUrl} ~/vault`,
      'Clone vault repository'
    );
    return result.success;
  }

  /**
   * Install Python and essential tools
   */
  async installPython(): Promise<boolean> {
    // Wait for VM to be ready
    const vmReady = await this.waitForVMReady(15, 5000);
    if (!vmReady) {
      this.onProgress?.({
        step: 'Install Python',
        message: 'VM did not become ready',
        success: false,
      });
      return false;
    }

    const commands = [
      'apt-get update -qq',
      'apt-get install -y -qq python3 python3-pip python3-venv git openssh-client procps',
    ];

    for (const cmd of commands) {
      let retries = 3;
      let success = false;

      while (retries > 0 && !success) {
        const result = await this.runCommand(`sudo ${cmd}`, 'Install Python');
        if (result.success) {
          success = true;
        } else {
          retries--;
          if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        }
      }

      if (!success) {
        return false;
      }
    }

    return true;
  }

  /**
   * Install AI SDKs (Anthropic, etc.)
   */
  async installAISDKs(): Promise<boolean> {
    const result = await this.runCommand(
      'pip3 install anthropic langchain-anthropic requests Pillow --break-system-packages',
      'Install AI SDKs'
    );

    if (!result.success) {
      // Log warning but continue
      this.onProgress?.({
        step: 'Install SDKs',
        message: 'SDK installation had issues, continuing...',
        success: true,
      });
    }

    return true;
  }

  /**
   * Install Node.js via NVM
   */
  async installNodeJS(): Promise<boolean> {
    // Install NVM
    const nvmInstall = await this.runCommand(
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash',
      'Install NVM'
    );

    if (!nvmInstall.success) {
      return false;
    }

    // Install Node.js 22
    const nodeInstall = await this.runCommand(
      'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22',
      'Install Node.js 22'
    );

    return nodeInstall.success;
  }

  /**
   * Set up Git sync daemon for vault
   */
  async setupGitSync(): Promise<boolean> {
    // Create sync script
    const syncScript = `#!/bin/bash
cd ~/vault
git fetch origin main
git reset --hard origin/main
`;

    const createScript = await this.runCommand(
      `cat > ~/sync-vault.sh << 'EOF'
${syncScript}
EOF
chmod +x ~/sync-vault.sh`,
      'Create sync script'
    );

    if (!createScript.success) return false;

    // Create daemon script
    const daemonScript = `#!/bin/bash
# Vault sync daemon - runs every 60 seconds
LOG_FILE=~/vault-sync.log

echo "[$(date)] Vault sync daemon starting..." >> $LOG_FILE

while true; do
    ~/sync-vault.sh >> $LOG_FILE 2>&1
    echo "[$(date)] Sync completed" >> $LOG_FILE
    sleep 60
done
`;

    const createDaemon = await this.runCommand(
      `cat > ~/vault-sync-daemon.sh << 'EOF'
${daemonScript}
EOF
chmod +x ~/vault-sync-daemon.sh`,
      'Create sync daemon script'
    );

    if (!createDaemon.success) return false;

    // Try cron first
    const cronResult = await this.runCommand(
      '(crontab -l 2>/dev/null | grep -v "sync-vault.sh"; echo "* * * * * /root/sync-vault.sh >> /root/vault-sync.log 2>&1") | crontab -',
      'Setup cron job'
    );

    if (cronResult.success) {
      this.onProgress?.({
        step: 'Git Sync',
        message: 'Vault sync configured via cron',
        success: true,
      });
      return true;
    }

    // Fallback: start background daemon
    const startDaemon = await this.runCommand(
      'nohup ~/vault-sync-daemon.sh > /dev/null 2>&1 &',
      'Start vault sync daemon'
    );

    return startDaemon.success;
  }

  /**
   * Store API key in environment
   */
  async storeApiKey(keyName: string, apiKey: string): Promise<boolean> {
    const result = await this.runCommand(
      `echo 'export ${keyName}="${apiKey}"' >> ~/.bashrc`,
      `Store ${keyName}`
    );
    return result.success;
  }

  /**
   * Link vault to workspace directory
   */
  async linkVaultToWorkspace(workspacePath: string): Promise<boolean> {
    // Ensure workspace exists
    await this.runCommand(
      `mkdir -p ${workspacePath}/knowledge`,
      'Create workspace directory'
    );

    // Symlink vault
    const linkResult = await this.runCommand(
      `ln -sf ~/vault ${workspacePath}/knowledge/vault`,
      'Link vault to workspace'
    );

    return linkResult.success;
  }

  /**
   * Clone additional repositories
   */
  async cloneRepositories(
    repos: Array<{ name: string; sshUrl: string }>
  ): Promise<{ success: boolean; errors?: Array<{ repo: string; error: string }> }> {
    const errors: Array<{ repo: string; error: string }> = [];
    const baseDir = '~/repositories';

    await this.runCommand(`mkdir -p ${baseDir}`, 'Create repositories directory');

    for (const repo of repos) {
      const repoPath = `${baseDir}/${repo.name}`;
      const result = await this.runCommand(
        `rm -rf ${repoPath} && git clone ${repo.sshUrl} ${repoPath}`,
        `Clone repository: ${repo.name}`
      );

      if (!result.success) {
        errors.push({ repo: repo.name, error: result.output });
      }
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ==================== Full Setup ====================

  /**
   * Run full agent setup sequence
   */
  async runFullSetup(options: FullSetupOptions): Promise<SetupResult> {
    try {
      // 1. Install Python
      this.onProgress?.({
        step: 'python',
        message: 'Installing Python...',
        success: true,
      });
      const pythonOk = await this.installPython();
      if (!pythonOk) throw new Error('Failed to install Python');

      // 2. Install AI SDKs
      this.onProgress?.({
        step: 'sdk',
        message: 'Installing AI SDKs...',
        success: true,
      });
      await this.installAISDKs();

      // 3. Generate SSH key
      this.onProgress?.({
        step: 'ssh',
        message: 'Generating SSH key...',
        success: true,
      });
      const { publicKey, success: sshOk } = await this.generateSSHKey();
      if (!sshOk) throw new Error('Failed to generate SSH key');

      // 4. Configure Git
      this.onProgress?.({
        step: 'git',
        message: 'Configuring Git...',
        success: true,
      });
      const gitOk = await this.configureGit(
        options.githubUsername,
        options.githubEmail
      );
      if (!gitOk) throw new Error('Failed to configure Git');

      // 5. Clone vault
      this.onProgress?.({
        step: 'clone',
        message: 'Cloning vault repository...',
        success: true,
      });
      const cloneOk = await this.cloneVaultRepo(options.repoSshUrl);
      if (!cloneOk) throw new Error('Failed to clone vault');

      // 6. Set up Git sync
      this.onProgress?.({
        step: 'sync',
        message: 'Setting up Git sync...',
        success: true,
      });
      const syncOk = await this.setupGitSync();
      if (!syncOk) throw new Error('Failed to set up Git sync');

      // 7. Clone additional repos
      if (options.knowledgeRepos && options.knowledgeRepos.length > 0) {
        this.onProgress?.({
          step: 'knowledge',
          message: 'Cloning knowledge repositories...',
          success: true,
        });
        await this.cloneRepositories(options.knowledgeRepos);
      }

      // 8. Store Claude API key
      this.onProgress?.({
        step: 'claude',
        message: 'Storing API keys...',
        success: true,
      });
      await this.storeApiKey('ANTHROPIC_API_KEY', options.claudeApiKey);

      if (options.telegramBotToken) {
        await this.storeApiKey('TELEGRAM_BOT_TOKEN', options.telegramBotToken);
      }

      return { success: true, publicKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  // ==================== Utility ====================

  /**
   * Get the public SSH key from VM
   */
  async getPublicKey(): Promise<string> {
    const result = await this.runCommand(
      'cat ~/.ssh/id_ed25519.pub',
      'Get public key'
    );
    return result.output.trim();
  }

  /**
   * Check if VM is responsive
   */
  async isResponsive(): Promise<boolean> {
    return this.orgo.isResponsive(this.computerId);
  }
}
