# Samantha - Autonomous AI Agent

Samantha is an autonomous AI agent with **persistent memory**, **intelligent reasoning**, and the ability to **act** in the real world.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ORGO VM                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              OBSIDIAN VAULT (GitHub Sync)               │    │
│  │  ├── tasks.md          ← P0 Priority Queue              │    │
│  │  ├── completed_tasks/  ← Archive                        │    │
│  │  ├── context/          ← Agent Memory                   │    │
│  │  └── integrations/     ← App Configs                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Claude   │  │ Browser  │  │ Orgo API │  │ Ralph Wiggum │    │
│  │ Code     │  │ Use      │  │ & Bash   │  │ Long Tasks   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Role | Technology |
|-----------|------|------------|
| **Memory** | Persistent knowledge base | Obsidian Vault + GitHub |
| **Mind** | Reasoning & decision making | Claude Code (terminal-based) |
| **Hands** | Browser & computer control | Orgo APIs |

### Task Priority System

| Priority | Source | Description |
|----------|--------|-------------|
| **P0** | `tasks.md` | Externally provided tasks (urgent) |
| **P1** | Inferred from vault | High priority inferred tasks |
| **P2** | Inferred from vault | Lower priority inferred tasks |

Tasks execute right-to-left (P0 → P1 → P2).

## Setup

### Prerequisites

- Node.js 18+
- GitHub account
- [Claude API key](https://console.anthropic.com/settings/keys)
- [Orgo API key](https://orgo.ai/workspaces)

### 1. Clone and Install

```bash
git clone <this-repo>
cd samantha
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
# GitHub OAuth App credentials
# Create at: https://github.com/settings/developers
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_here  # Generate with: openssl rand -base64 32

# Orgo API Key (your admin key)
ORGO_API_KEY=sk_live_your_orgo_api_key

# Database
DATABASE_URL="file:./dev.db"

# Google OAuth (for Gmail integration)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google

# Cron Job Secret (optional, for securing cron endpoints)
CRON_SECRET=your_cron_secret_here  # Generate with: openssl rand -base64 32
```

### 3. Set up Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Samantha
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Copy Client ID and Client Secret to `.env`

### 5. Create Google OAuth App (for Gmail Integration)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Client Secret to `.env`

### 6. Run the App

```bash
npm run dev
```

Visit `http://localhost:3000` and sign in with GitHub.

## What Happens During Setup

1. **GitHub OAuth** - Sign in and grant repo permissions
2. **API Keys** - Enter your Claude and Orgo API keys
3. **VM Provisioning** - Creates an Orgo VM (project: `claude-code`)
4. **Vault Creation** - Creates a private GitHub repo with vault template
5. **VM Configuration**:
   - Clones vault repo to VM
   - Sets up Git sync (auto-pulls from GitHub)

## Gmail Integration

### Connecting Gmail

1. After setup, navigate to `/learning-sources`
2. Click "Connect" on the Gmail card
3. Authorize Gmail access
4. All emails will be synced to your vault in `integrations/gmail/`

### Automatic Email Syncing

Gmail automatically syncs new emails every 12 hours via a cron job.

**For Vercel Deployment:**
- The cron job is configured in `vercel.json`
- Runs automatically every 12 hours at `/api/cron/gmail-sync`
- No additional setup needed

**For Other Platforms:**
Set up a cron job to call:
```
POST /api/integrations/gmail/sync
Authorization: Bearer <CRON_SECRET>
```

Example cron schedule (every 12 hours):
```bash
0 */12 * * * curl -X POST https://your-domain.com/api/integrations/gmail/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Manual Sync:**
You can manually trigger a sync by calling:
```bash
curl -X POST http://localhost:3000/api/integrations/gmail/sync \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Email Storage

- Emails are batched into files (50 emails per file)
- New emails from syncs are stored in `integrations/gmail/new-messages-<timestamp>.md`
- Sync history is logged in `integrations/gmail/sync-log.md`

## After Setup

### Adding Tasks

Edit `tasks.md` in your vault repository:

```markdown
## Active Tasks

- [ ] Book flight to NYC for March 15
  - Context: Prefer window seat, direct flights
  - Deadline: March 10

- [ ] Research best noise-canceling headphones under $300
  - Context: For daily commute and focus work
```

### Monitoring

- **VM Console**: View at your Orgo dashboard
- **Vault Repo**: Check GitHub for synced changes

## Development

```bash
# Run in development
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## API Reference

### Orgo API
- [Documentation](https://docs.orgo.ai)
- Endpoints for VM management, bash execution, screenshots

## License

MIT


