/**
 * GitHubAdapter
 * Wraps the Samantha GitHubClient for JARVIS SDK
 * Provides repository and vault management for memory persistence
 */

import { Octokit } from 'octokit';

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  cloneUrl: string;
  sshUrl: string;
  htmlUrl: string;
}

export interface VaultRepoInfo {
  name: string;
  url: string;
  cloneUrl: string;
  sshUrl: string;
}

export interface FileOperation {
  path: string;
  content: string;
}

/**
 * GitHubAdapter wraps Octokit for GitHub operations
 * Based on existing Samantha GitHubClient
 */
export class GitHubAdapter {
  private octokit: Octokit;
  private userCache: GitHubUser | null = null;

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken });
  }

  // ==================== User Operations ====================

  /**
   * Get authenticated user info
   */
  async getUser(): Promise<GitHubUser> {
    if (this.userCache) {
      return this.userCache;
    }
    const { data } = await this.octokit.rest.users.getAuthenticated();
    this.userCache = {
      id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatar_url,
    };
    return this.userCache;
  }

  // ==================== Repository Operations ====================

  /**
   * List all repositories for authenticated user
   */
  async listRepositories(excludeRepoName?: string): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
        per_page: perPage,
        page,
        sort: 'updated',
        direction: 'desc',
      });

      if (data.length === 0) break;

      for (const repo of data) {
        if (excludeRepoName && repo.name === excludeRepoName) continue;
        repos.push({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          cloneUrl: repo.clone_url,
          sshUrl: repo.ssh_url,
          htmlUrl: repo.html_url,
        });
      }

      if (data.length < perPage) break;
      page++;
    }

    return repos;
  }

  /**
   * Check if a repository exists
   */
  async repoExists(repoName: string): Promise<boolean> {
    try {
      const user = await this.getUser();
      await this.octokit.rest.repos.get({
        owner: user.login,
        repo: repoName,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
        return false;
      }
      throw error;
    }
  }

  // ==================== Vault Operations ====================

  /**
   * Create a new vault repository with initial files
   */
  async createVaultRepo(
    repoName: string,
    description?: string
  ): Promise<VaultRepoInfo> {
    const user = await this.getUser();

    // Create the repository with auto_init
    const { data: repo } =
      await this.octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: description || 'JARVIS Agent Memory Vault',
        private: true,
        auto_init: true,
      });

    // Wait for GitHub to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Initialize with vault template
    await this.initializeVaultTemplate(user.login, repoName);

    return {
      name: repo.name,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
    };
  }

  /**
   * Initialize repository with vault template structure
   */
  private async initializeVaultTemplate(
    owner: string,
    repo: string
  ): Promise<void> {
    // Get the current main branch ref
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main',
    });
    const parentSha = ref.object.sha;

    // Get the parent commit
    const { data: parentCommit } = await this.octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: parentSha,
    });

    // Get vault template files
    const files = this.getVaultTemplateFiles();

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });
        return { path: file.path, sha: blob.sha, mode: '100644' as const };
      })
    );

    // Create tree
    const { data: tree } = await this.octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: parentCommit.tree.sha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: b.mode,
        type: 'blob',
        sha: b.sha,
      })),
    });

    // Create commit
    const { data: commit } = await this.octokit.rest.git.createCommit({
      owner,
      repo,
      message: 'Initial vault setup by JARVIS',
      tree: tree.sha,
      parents: [parentSha],
    });

    // Update main branch reference
    await this.octokit.rest.git.updateRef({
      owner,
      repo,
      ref: 'heads/main',
      sha: commit.sha,
    });
  }

  /**
   * Get vault template files
   */
  private getVaultTemplateFiles(): FileOperation[] {
    return [
      {
        path: 'AGENT.md',
        content: `# JARVIS Agent Memory Vault

This vault is the persistent memory for a JARVIS agent.

## Structure

- \`tasks/\` - Active and completed tasks
- \`memory/\` - Agent memory and learned context
- \`context/\` - User context and preferences
- \`logs/\` - Execution logs
- \`sync/\` - Synced data from external sources

## Priority System

| Priority | Description |
|----------|-------------|
| P0 | Critical - execute immediately |
| P1 | High - execute soon |
| P2 | Normal - standard priority |
| P3 | Low - when time permits |
`,
      },
      {
        path: 'tasks/active.md',
        content: `# Active Tasks

Add tasks for the agent to execute.

## Format
\`\`\`
- [ ] Task description [P0|P1|P2|P3]
  - Context: Any relevant context
  - Deadline: Optional deadline
\`\`\`

## Tasks

<!-- Add tasks below -->
`,
      },
      {
        path: 'tasks/completed/.gitkeep',
        content: '',
      },
      {
        path: 'memory/facts.md',
        content: `# Facts

Learned facts about the user and environment.

<!-- Agent will update this file -->
`,
      },
      {
        path: 'memory/preferences.md',
        content: `# Preferences

User preferences learned over time.

<!-- Agent will update this file -->
`,
      },
      {
        path: 'memory/patterns.md',
        content: `# Patterns

Behavioral patterns and workflows.

<!-- Agent will update this file -->
`,
      },
      {
        path: 'context/user.md',
        content: `# User Context

Information about the user.

<!-- Agent will update this file -->
`,
      },
      {
        path: 'logs/.gitkeep',
        content: '',
      },
      {
        path: 'sync/.gitkeep',
        content: '',
      },
    ];
  }

  // ==================== File Operations ====================

  /**
   * Read file contents from repository
   */
  async readFile(repoName: string, filePath: string): Promise<string | null> {
    try {
      const user = await this.getUser();
      const { data } = await this.octokit.rest.repos.getContent({
        owner: user.login,
        repo: repoName,
        path: filePath,
      });

      if (Array.isArray(data)) {
        throw new Error(`Path ${filePath} is a directory, not a file`);
      }

      if ('content' in data && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write or update a file in repository
   */
  async writeFile(
    repoName: string,
    filePath: string,
    content: string,
    message: string
  ): Promise<void> {
    const user = await this.getUser();

    // Check if file exists to get SHA
    let fileSha: string | undefined;
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: user.login,
        repo: repoName,
        path: filePath,
      });

      if (!Array.isArray(data) && 'sha' in data) {
        fileSha = data.sha;
      }
    } catch (error: unknown) {
      if (!(error instanceof Error && 'status' in error && (error as { status: number }).status === 404)) {
        throw error;
      }
    }

    // Create or update file
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repoName,
      path: filePath,
      message,
      content: Buffer.from(content).toString('base64'),
      sha: fileSha,
    });
  }

  /**
   * Write multiple files in a single commit
   */
  async writeMultipleFiles(
    repoName: string,
    files: FileOperation[],
    message: string
  ): Promise<void> {
    const user = await this.getUser();

    // Get main branch ref
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner: user.login,
      repo: repoName,
      ref: 'heads/main',
    });
    const parentSha = ref.object.sha;

    // Get parent commit
    const { data: parentCommit } = await this.octokit.rest.git.getCommit({
      owner: user.login,
      repo: repoName,
      commit_sha: parentSha,
    });

    // Create blobs for files
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner: user.login,
          repo: repoName,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });
        return { path: file.path, sha: blob.sha, mode: '100644' as const };
      })
    );

    // Create tree
    const { data: tree } = await this.octokit.rest.git.createTree({
      owner: user.login,
      repo: repoName,
      base_tree: parentCommit.tree.sha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: b.mode,
        type: 'blob',
        sha: b.sha,
      })),
    });

    // Create commit
    const { data: commit } = await this.octokit.rest.git.createCommit({
      owner: user.login,
      repo: repoName,
      message,
      tree: tree.sha,
      parents: [parentSha],
    });

    // Update branch
    await this.octokit.rest.git.updateRef({
      owner: user.login,
      repo: repoName,
      ref: 'heads/main',
      sha: commit.sha,
    });
  }

  /**
   * Delete a file from repository
   */
  async deleteFile(
    repoName: string,
    filePath: string,
    message: string
  ): Promise<void> {
    const user = await this.getUser();

    // Get file SHA
    const { data } = await this.octokit.rest.repos.getContent({
      owner: user.login,
      repo: repoName,
      path: filePath,
    });

    if (Array.isArray(data)) {
      throw new Error(`Path ${filePath} is a directory`);
    }

    if (!('sha' in data)) {
      throw new Error(`Cannot get SHA for ${filePath}`);
    }

    await this.octokit.rest.repos.deleteFile({
      owner: user.login,
      repo: repoName,
      path: filePath,
      message,
      sha: data.sha,
    });
  }

  // ==================== Deploy Key Operations ====================

  /**
   * Create a deploy key for the repository
   */
  async createDeployKey(
    repoName: string,
    publicKey: string,
    title: string = 'JARVIS Agent Deploy Key'
  ): Promise<{ id: number }> {
    const user = await this.getUser();
    const { data } = await this.octokit.rest.repos.createDeployKey({
      owner: user.login,
      repo: repoName,
      title,
      key: publicKey,
      read_only: false,
    });
    return { id: data.id };
  }

  // ==================== Webhook Operations ====================

  /**
   * Set up webhook for repository changes
   */
  async createWebhook(
    repoName: string,
    webhookUrl: string,
    secret: string
  ): Promise<{ id: number }> {
    const user = await this.getUser();
    const { data } = await this.octokit.rest.repos.createWebhook({
      owner: user.login,
      repo: repoName,
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret,
      },
      events: ['push'],
      active: true,
    });
    return { id: data.id };
  }

  // ==================== List Directory ====================

  /**
   * List files in a directory
   */
  async listDirectory(
    repoName: string,
    path: string = ''
  ): Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }>> {
    const user = await this.getUser();
    const { data } = await this.octokit.rest.repos.getContent({
      owner: user.login,
      repo: repoName,
      path,
    });

    if (!Array.isArray(data)) {
      throw new Error(`Path ${path} is a file, not a directory`);
    }

    return data.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type === 'dir' ? 'dir' : 'file',
    }));
  }
}
