/**
 * Template Marketplace - Generic Template System
 * 
 * Templates define AI agent deployments that can be installed on VMs.
 * The system is designed to be fully generic - no template-specific code.
 * All behavior is driven by the template configuration.
 */

// ==================== Types ====================

export type TemplateCategory = 'social' | 'productivity' | 'dev-tools' | 'other'
export type VMProvider = 'orgo' | 'aws' | 'e2b'

export interface TemplateVMConfig {
  provider: VMProvider
  minRam: number
  recommendedRam: number
}

export interface TemplateRegistration {
  endpoint: string
  method: 'POST' | 'GET'
  headers?: Record<string, string>
  bodyTemplate: Record<string, any>
  responseMapping: {
    apiKey?: string      // JSON path like "agent.api_key"
    claimUrl?: string    // JSON path like "agent.claim_url"
    verificationCode?: string
  }
}

export interface TemplateCredentials {
  path: string
  template: Record<string, string>
}

export interface TemplatePostSetup {
  type: 'claimUrl' | 'openLink' | 'none'
  message?: string
}

export interface Template {
  id: string
  name: string
  description: string
  logo: string                    // URL or /public path
  category: TemplateCategory
  author?: string                 // For user-uploaded templates
  websiteUrl?: string             // Link to service website
  comingSoon?: boolean            // Mark template as coming soon (not deployable)
  
  vmConfig: TemplateVMConfig
  
  setup: {
    commands: string[]            // Shell commands with {{placeholders}}
  }
  
  registration?: TemplateRegistration
  credentials?: TemplateCredentials
  postSetup?: TemplatePostSetup
}

// ==================== Helper Functions ====================

/**
 * Replace {{placeholders}} in a string with values from context
 */
export function replacePlaceholders(
  str: string,
  context: Record<string, string>
): string {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return context[key] !== undefined ? context[key] : match
  })
}

/**
 * Process template commands by replacing placeholders
 */
export function processCommands(
  commands: string[],
  context: Record<string, string>
): string[] {
  return commands.map(cmd => replacePlaceholders(cmd, context))
}

/**
 * Process a template object (credentials, bodyTemplate) by replacing placeholders
 */
export function processTemplateObject(
  obj: Record<string, any>,
  context: Record<string, string>
): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = replacePlaceholders(value, context)
    } else if (typeof value === 'object' && value !== null) {
      result[key] = processTemplateObject(value, context)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Extract a value from a nested object using a dot-separated path
 * e.g., extractJsonPath({ agent: { api_key: 'xyz' } }, 'agent.api_key') => 'xyz'
 */
export function extractJsonPath(obj: any, path: string): any {
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[part]
  }
  return current
}

/**
 * Generate a default agent name from template name and random suffix
 */
export function generateAgentName(templateName: string): string {
  const base = templateName.replace(/[^a-zA-Z0-9]/g, '')
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${base}Agent_${suffix}`
}

/**
 * Get a template by ID from built-in templates
 */
export function getTemplateById(id: string): Template | undefined {
  return BUILTIN_TEMPLATES.find(t => t.id === id)
}

/**
 * Get all templates (built-in only for now, will merge with DB later)
 */
export function getAllTemplates(): Template[] {
  return [...BUILTIN_TEMPLATES]
}

// ==================== Built-in Templates ====================

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'moltbook',
    name: 'Moltbook',
    description: 'Create an AI agent for Moltbook - the social network for AI agents. Post, comment, upvote, and interact with other AI agents.',
    logo: '/logos/moltbook.png',
    category: 'social',
    author: 'Moltbook',
    websiteUrl: 'https://www.moltbook.com',
    
    vmConfig: {
      provider: 'orgo',
      minRam: 4,
      recommendedRam: 8
    },
    
    setup: {
      commands: [
        // === STAGING APPROACH ===
        // Template saves to ~/.openclaw/ (staging area) which survives
        // ClawdBot setup later copies skills to ~/clawd/skills/ and appends heartbeat entries
        // This ensures template works regardless of whether setup has run yet
        
        // Create staging directories
        'mkdir -p ~/.openclaw/skills/moltbook ~/.openclaw/heartbeat-additions ~/.config/moltbook',
        
        // Download Moltbook skill files to managed skills directory (staging)
        // OpenClaw will discover these from ~/.openclaw/skills/ even before workspace setup
        'curl -s https://www.moltbook.com/skill.md > ~/.openclaw/skills/moltbook/SKILL.md',
        'curl -s https://www.moltbook.com/heartbeat.md > ~/.openclaw/skills/moltbook/HEARTBEAT.md',
        'curl -s https://www.moltbook.com/messaging.md > ~/.openclaw/skills/moltbook/MESSAGING.md',
        'curl -s https://www.moltbook.com/skill.json > ~/.openclaw/skills/moltbook/package.json',
        
        // Save credentials (apiKey and agentName are injected after registration)
        'echo \'{{credentialsJson}}\' > ~/.config/moltbook/credentials.json',
        'chmod 600 ~/.config/moltbook/credentials.json',
        
        // Stage heartbeat additions (setup will append these to HEARTBEAT.md)
        'echo "## Moltbook\\n- Check Moltbook for new messages and notifications (use moltbook skill)\\n- If there are pending interactions, respond appropriately" > ~/.openclaw/heartbeat-additions/moltbook.md',
        
        // If workspace already exists (setup ran before template), copy skills there NOW
        // This is critical - OpenClaw looks in <workspace>/skills/ first
        'mkdir -p ~/clawd/skills/moltbook && cp -f ~/.openclaw/skills/moltbook/* ~/clawd/skills/moltbook/ 2>&1 || echo "Skills copy to workspace failed (workspace may not exist yet)"',
        
        // If HEARTBEAT.md already exists, append our additions now (avoid duplicates)
        'if [ -f ~/clawd/HEARTBEAT.md ] && ! grep -q "## Moltbook" ~/clawd/HEARTBEAT.md; then echo "" >> ~/clawd/HEARTBEAT.md && cat ~/.openclaw/heartbeat-additions/moltbook.md >> ~/clawd/HEARTBEAT.md; fi',
      ]
    },
    
    registration: {
      endpoint: 'https://www.moltbook.com/api/v1/agents/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      bodyTemplate: {
        name: '{{agentName}}',
        description: 'AI agent deployed via ClawdBody'
      },
      responseMapping: {
        apiKey: 'agent.api_key',
        claimUrl: 'agent.claim_url',
        verificationCode: 'agent.verification_code'
      }
    },
    
    credentials: {
      path: '~/.config/moltbook/credentials.json',
      template: {
        api_key: '{{apiKey}}',
        agent_name: '{{agentName}}'
      }
    },
    
    postSetup: {
      type: 'claimUrl',
      message: 'To activate your agent, you need to verify ownership by posting a tweet. Click the button below to open the claim page.'
    }
  },
  
  // Placeholder templates for marketplace UI (coming soon)
  // These show the extensibility of the system
  
  {
    id: 'stock-crypto-trader',
    name: 'Stock & Crypto Trader',
    description: 'Deploy an AI agent that monitors markets, analyzes trends, and executes trades for stocks and cryptocurrencies on your behalf.',
    logo: '/logos/robinhood.png',
    category: 'other',
    author: 'OpenClaw',
    websiteUrl: 'https://openclaw.ai',
    comingSoon: true,
    
    vmConfig: {
      provider: 'orgo',
      minRam: 4,
      recommendedRam: 8
    },
    
    setup: {
      commands: [
        // Create staging directories
        'mkdir -p ~/.openclaw/skills/stock-crypto-trader ~/.openclaw/heartbeat-additions ~/.config/stock-crypto-trader',
        
        // Save credentials (will be injected after registration)
        'echo \'{{credentialsJson}}\' > ~/.config/stock-crypto-trader/credentials.json',
        'chmod 600 ~/.config/stock-crypto-trader/credentials.json',
        
        // Stage heartbeat additions
        'echo "## Stock & Crypto Trader\\n- Monitor market conditions and portfolio performance\\n- Execute trades based on configured strategy and risk parameters" > ~/.openclaw/heartbeat-additions/stock-crypto-trader.md',
        
        // If workspace already exists, copy skills there now
        'if [ -d ~/clawd ]; then mkdir -p ~/clawd/skills && cp -r ~/.openclaw/skills/* ~/clawd/skills/ 2>/dev/null || true; fi',
        
        // If HEARTBEAT.md already exists, append our additions now
        'if [ -f ~/clawd/HEARTBEAT.md ]; then echo "" >> ~/clawd/HEARTBEAT.md && cat ~/.openclaw/heartbeat-additions/stock-crypto-trader.md >> ~/clawd/HEARTBEAT.md; fi',
      ]
    },
    
    credentials: {
      path: '~/.config/stock-crypto-trader/credentials.json',
      template: {
        api_key: '{{apiKey}}',
        agent_name: '{{agentName}}'
      }
    },
    
    postSetup: {
      type: 'none',
      message: 'Your Stock & Crypto Trader agent is ready. Configure your trading preferences and API keys for your preferred exchanges.'
    }
  },
]

// ==================== Template Validation ====================

/**
 * Validate a template definition
 */
export function validateTemplate(template: Partial<Template>): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!template.id) errors.push('Template ID is required')
  if (!template.name) errors.push('Template name is required')
  if (!template.description) errors.push('Template description is required')
  if (!template.logo) errors.push('Template logo is required')
  if (!template.category) errors.push('Template category is required')
  
  if (!template.vmConfig) {
    errors.push('VM configuration is required')
  } else {
    if (!template.vmConfig.provider) errors.push('VM provider is required')
    if (!template.vmConfig.minRam) errors.push('Minimum RAM is required')
    if (!template.vmConfig.recommendedRam) errors.push('Recommended RAM is required')
  }
  
  if (!template.setup) {
    errors.push('Setup configuration is required')
  } else {
    if (!template.setup.commands || template.setup.commands.length === 0) {
      errors.push('At least one setup command is required')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}
