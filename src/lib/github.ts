/**
 * GitHub API Client
 * Handles repository creation and management
 */

import { Octokit } from 'octokit'

export class GitHubClient {
  private octokit: Octokit

  constructor(accessToken: string) {
    this.octokit = new Octokit({ auth: accessToken })
  }

  /**
   * Get authenticated user info
   */
  async getUser() {
    const { data } = await this.octokit.rest.users.getAuthenticated()
    return data
  }

  /**
   * List all repositories for the authenticated user (excluding vault repo)
   */
  async listRepositories(excludeRepoName?: string): Promise<Array<{
    id: number
    name: string
    full_name: string
    private: boolean
    clone_url: string
    ssh_url: string
    html_url: string
  }>> {
    const repos: any[] = []
    
    // Fetch both public and private repos
    // Using pagination to get all repos
    let page = 1
    const perPage = 100
    
    while (true) {
      const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
        per_page: perPage,
        page,
        sort: 'updated',
        direction: 'desc',
      })
      
      if (data.length === 0) break
      
      repos.push(...data)
      
      if (data.length < perPage) break
      page++
    }
    
    // Filter out the vault repo if specified
    const filteredRepos = excludeRepoName
      ? repos.filter(repo => repo.name !== excludeRepoName)
      : repos
    
    return filteredRepos.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      html_url: repo.html_url,
    }))
  }

  /**
   * Create a new private repository with initial files
   */
  async createVaultRepo(repoName: string): Promise<{
    name: string
    url: string
    cloneUrl: string
    sshUrl: string
  }> {
    const user = await this.getUser()
    
    // Create the repository with auto_init: true to create an initial commit
    // The Git Data API requires at least one commit to exist
    const { data: repo } = await this.octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      description: 'Samantha AI Agent - Obsidian Vault (Memory)',
      private: true,
      auto_init: true, // Creates initial commit so Git Data API can work
    })

    // Wait a moment for GitHub to initialize the repo
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Initialize with vault template files
    await this.initializeVaultTemplate(user.login, repoName)

    return {
      name: repo.name,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      sshUrl: repo.ssh_url,
    }
  }

  /**
   * Initialize repository with vault template structure
   */
  private async initializeVaultTemplate(owner: string, repo: string) {
    // Get the current main branch ref (created by auto_init)
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main',
    })
    const parentSha = ref.object.sha

    // Get the current commit to get its tree
    const { data: parentCommit } = await this.octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: parentSha,
    })

    // Create vault structure files
    const files = getVaultTemplateFiles()
    
    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        })
        return { path: file.path, sha: blob.sha, mode: '100644' as const }
      })
    )

    // Create tree based on parent tree (to preserve existing files like README)
    const { data: tree } = await this.octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: parentCommit.tree.sha,
      tree: blobs.map(b => ({
        path: b.path,
        mode: b.mode,
        type: 'blob',
        sha: b.sha,
      })),
    })

    // Create commit with parent
    const { data: commit } = await this.octokit.rest.git.createCommit({
      owner,
      repo,
      message: 'Initial vault setup by Samantha',
      tree: tree.sha,
      parents: [parentSha],
    })

    // Update main branch reference (not create, since it already exists)
    await this.octokit.rest.git.updateRef({
      owner,
      repo,
      ref: 'heads/main',
      sha: commit.sha,
    })
  }

  /**
   * Check if a repository exists
   */
  async repoExists(repoName: string): Promise<boolean> {
    try {
      const user = await this.getUser()
      await this.octokit.rest.repos.get({
        owner: user.login,
        repo: repoName,
      })
      return true
    } catch (error: any) {
      if (error.status === 404) return false
      throw error
    }
  }

  /**
   * Create a deploy key for the repository
   */
  async createDeployKey(
    repoName: string,
    publicKey: string,
    title: string = 'Samantha VM Deploy Key'
  ): Promise<{ id: number }> {
    const user = await this.getUser()
    const { data } = await this.octokit.rest.repos.createDeployKey({
      owner: user.login,
      repo: repoName,
      title,
      key: publicKey,
      read_only: false, // Need write access for sync
    })
    return { id: data.id }
  }

  /**
   * Set up webhook for repo changes
   */
  async createWebhook(
    repoName: string,
    webhookUrl: string,
    secret: string
  ): Promise<{ id: number }> {
    const user = await this.getUser()
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
    })
    return { id: data.id }
  }

  /**
   * Read file contents from the vault repository
   */
  async readFileFromVault(repoName: string, filePath: string): Promise<string | null> {
    try {
      const user = await this.getUser()
      const { data } = await this.octokit.rest.repos.getContent({
        owner: user.login,
        repo: repoName,
        path: filePath,
      })

      if (Array.isArray(data)) {
        throw new Error(`Path ${filePath} is a directory, not a file`)
      }

      if ('content' in data && data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }

      return null
    } catch (error: any) {
      if (error.status === 404) {
        return null // File doesn't exist
      }
      throw error
    }
  }

  /**
   * Write or update a file in the vault repository
   */
  async writeFileToVault(
    repoName: string,
    filePath: string,
    content: string,
    message: string
  ): Promise<void> {
    const user = await this.getUser()
    
    // Check if file exists to get its SHA (required for updates)
    let fileSha: string | undefined
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: user.login,
        repo: repoName,
        path: filePath,
      })
      
      if (Array.isArray(data)) {
        throw new Error(`Path ${filePath} is a directory, not a file`)
      }
      
      if ('sha' in data) {
        fileSha = data.sha
      }
    } catch (error: any) {
      // File doesn't exist (404), which is fine for new files
      if (error.status !== 404) {
        throw error
      }
    }

    // Create or update the file
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repoName,
      path: filePath,
      message,
      content: Buffer.from(content).toString('base64'),
      sha: fileSha, // undefined for new files, SHA for updates
    })
  }

  /**
   * Write multiple files to the vault repository in a single commit
   */
  async writeMultipleFilesToVault(
    repoName: string,
    files: Array<{ path: string; content: string }>,
    message: string
  ): Promise<void> {
    const user = await this.getUser()
    
    // Get the current main branch ref
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner: user.login,
      repo: repoName,
      ref: 'heads/main',
    })
    const parentSha = ref.object.sha

    // Get the current commit to get its tree
    const { data: parentCommit } = await this.octokit.rest.git.getCommit({
      owner: user.login,
      repo: repoName,
      commit_sha: parentSha,
    })

    // Get existing file SHAs for files that already exist
    const existingFiles = new Map<string, string>()
    for (const file of files) {
      try {
        const { data } = await this.octokit.rest.repos.getContent({
          owner: user.login,
          repo: repoName,
          path: file.path,
        })
        
        if (!Array.isArray(data) && 'sha' in data) {
          existingFiles.set(file.path, data.sha)
        }
      } catch (error: any) {
        // File doesn't exist, which is fine
        if (error.status !== 404) {
          throw error
        }
      }
    }

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner: user.login,
          repo: repoName,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        })
        return { path: file.path, sha: blob.sha, mode: '100644' as const }
      })
    )

    // Create tree based on parent tree
    const { data: tree } = await this.octokit.rest.git.createTree({
      owner: user.login,
      repo: repoName,
      base_tree: parentCommit.tree.sha,
      tree: blobs.map(b => ({
        path: b.path,
        mode: b.mode,
        type: 'blob',
        sha: b.sha,
      })),
    })

    // Create commit with parent
    const { data: commit } = await this.octokit.rest.git.createCommit({
      owner: user.login,
      repo: repoName,
      message,
      tree: tree.sha,
      parents: [parentSha],
    })

    // Update main branch reference
    await this.octokit.rest.git.updateRef({
      owner: user.login,
      repo: repoName,
      ref: 'heads/main',
      sha: commit.sha,
    })
  }
}

/**
 * Get the vault template files structure
 */
function getVaultTemplateFiles(): Array<{ path: string; content: string }> {
  return [
    {
      path: 'CLAUDE.md',
      content: `# Samantha - Autonomous AI Agent

You are Samantha, an autonomous AI agent with persistent memory and the ability to act in the real world.

---

## Core Philosophy

### Be Ruthlessly Helpful
- Execute tasks to FULL completion, not partial progress
- If blocked, provide research + draft at minimum
- Proactively offer next steps, insights, resources
- Never settle for "I couldn't do that" - find a way
- Keep working until truly done

### Use Your Memory
This vault is your persistent memory. Search it FIRST before external research:
- \`context/\` - What you've learned about the user
- \`completed_tasks/\` - Past tasks and their outcomes
- \`integrations/\` - Connected services and credentials
- \`Daily/\` - Daily notes (if user creates them)

**Always search the vault for context before acting.**

### Sign Your Work
When adding content to the vault:
- Visible: \`*Added by Samantha on YYYY-MM-DD*\`
- Hidden: \`<!-- Samantha: YYYY-MM-DD -->\`

---

## Vault Structure

\`\`\`
tasks.md              # P0 tasks (externally provided, highest priority)
completed_tasks/      # Archive of completed tasks with results
context/              # Your persistent memory
  ├── about_me.md     # What you know about the user
  ├── learned_patterns.md  # Patterns you've learned
  └── ...             # Other context files you create
integrations/         # Service configurations
Daily/                # Daily notes (optional)
logs/                 # Execution logs
\`\`\`

---

## Task Priority System

| Priority | Source | Description |
|----------|--------|-------------|
| **P0** | tasks.md | User-provided tasks (execute first) |
| **P1** | Inferred | High priority inferred from vault |
| **P2** | Inferred | Lower priority inferred tasks |

Execute P0 → P1 → P2

---

## Proactive Work Discovery

**Don't just wait for tasks.md - actively find useful work!**

### Task Sources (Check in Order)
1. \`tasks.md\` - Explicit P0 tasks (highest priority)
2. \`Daily/*.md\` - Check for incomplete items (\`- [ ]\`)
3. \`context/\` - Review and update your knowledge
4. Vault analysis - Find patterns, connections, things to improve

### When tasks.md is Empty
1. Analyze vault for implicit tasks
2. Check if any context files need updating
3. Look for patterns in completed_tasks that suggest recurring work
4. Proactively research topics mentioned in the vault
5. Only rest when truly nothing to do

---

## Context Discovery

**Be maximally curious - the vault is a knowledge graph.**

When you discover a task or topic:
1. **Search for context** - Grep for related keywords, names, projects
2. **Follow the links** - Check \`[[linked notes]]\` for background
3. **Check related files** - Look at the context/ folder
4. **Understand before acting** - Context makes execution better

### Example Discovery
\`\`\`bash
# Found a task about "Project X"? Search for context:
grep -r "Project X" ~/vault/
grep -r "project x" ~/vault/

# Found a person mentioned? Learn about them:
grep -r "John" ~/vault/context/
\`\`\`

---

## Available Tools

### Computer Use (Orgo)
You can control the VM through:
- Screenshots - See what's on screen
- Mouse clicks - Navigate GUIs
- Keyboard input - Type and use shortcuts
- Bash commands - Full terminal access

### File Operations
- Read/write any file in the vault
- Create new notes, update context
- Archive completed tasks

### Git Sync
- Vault auto-syncs with GitHub
- Changes you make get pushed back
- User changes get pulled in

---

## Execution Guidelines

### On Task Start
1. Read the full task and any context provided
2. Search vault for related information
3. Plan your approach
4. Execute using appropriate tools

### During Execution
1. Work autonomously - don't wait for confirmation
2. If blocked, try alternative approaches
3. Document what you're doing in logs/
4. Update context/ with things you learn

### On Task Completion
1. Archive task to completed_tasks/ with full results
2. Update tasks.md (mark as complete)
3. Update context/ if you learned something new
4. Push changes to GitHub

---

## When Blocked

1. Research the problem (web search, GUI exploration)
2. Check vault for relevant context
3. Try alternative approaches
4. If truly stuck: Document + partial solution + next steps
5. **NEVER return empty-handed**
6. **Move to next task** - One blocker shouldn't stop all progress

---

## Learning & Memory

### What to Remember
- User preferences and patterns
- Successful approaches to tasks
- Important context for future tasks
- Mistakes to avoid

### Where to Store
- \`context/about_me.md\` - User information
- \`context/learned_patterns.md\` - Patterns and workflows
- Create new files in \`context/\` for specific topics

---

## Communication Style

- Be concise but thorough
- Show your work in logs/
- Proactively share insights
- Ask clarifying questions only when truly stuck
- Default to action over asking

---

## Success Criteria

A successful session means:
- All P0 tasks completed or clearly blocked with documentation
- Vault context updated with new learnings
- Proactive work found and executed when task queue empty
- Clear logs of what was done
- Changes synced to GitHub
`,
    },
    {
      path: 'README.md',
      content: `# Samantha Vault

This is your AI agent's memory vault. It stays in sync between GitHub and your Orgo VM.

## Structure

- \`CLAUDE.md\` - Agent behavior guidelines and instructions
- \`tasks.md\` - Active task queue (P0 priority - externally provided)
- \`completed_tasks/\` - Archive of completed tasks with context
- \`context/\` - Agent's persistent memory and learned context
- \`integrations/\` - Configuration for connected apps
- \`logs/\` - Execution logs

## Priority System

| Priority | Source | Description |
|----------|--------|-------------|
| P0 | tasks.md | Externally provided tasks (urgent) |
| P1 | Inferred from vault | High priority inferred tasks |
| P2 | Inferred from vault | Lower priority inferred tasks |

Tasks execute right-to-left (P0 first, then P1, then P2).

## Adding Tasks

Edit \`tasks.md\` and add tasks in this format:

\`\`\`markdown
- [ ] Task description
  - Context: Any relevant context
  - Deadline: Optional deadline
\`\`\`

Samantha will pick up the task within ~1 minute.
`,
    },
    {
      path: 'tasks.md',
      content: `# Task Queue

Add tasks here for Samantha to execute. These are P0 (highest priority).

## Format

\`\`\`
- [ ] Task description
  - Context: Any relevant context
  - Deadline: Optional deadline
\`\`\`

## Active Tasks

<!-- Add your tasks below this line -->

`,
    },
    {
      path: 'completed_tasks/.gitkeep',
      content: '',
    },
    {
      path: 'context/about_me.md',
      content: `# About Me

<!-- Samantha will learn about you and update this file -->

## Preferences

- (To be learned)

## Communication Style

- (To be learned)

## Important Context

- (To be learned)
`,
    },
    {
      path: 'context/learned_patterns.md',
      content: `# Learned Patterns

<!-- Patterns Samantha has learned from interactions -->

## Workflow Patterns

- (To be learned)

## Decision Patterns

- (To be learned)
`,
    },
    {
      path: 'integrations/.gitkeep',
      content: '',
    },
    {
      path: 'logs/.gitkeep',
      content: '',
    },
    {
      path: '.obsidian/app.json',
      content: JSON.stringify({
        showLineNumber: true,
        spellcheck: true,
        strictLineBreaks: false,
      }, null, 2),
    },
    {
      path: '.obsidian/appearance.json',
      content: JSON.stringify({
        baseFontSize: 16,
        theme: 'obsidian',
      }, null, 2),
    },
  ]
}


