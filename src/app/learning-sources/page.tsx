'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { motion } from 'framer-motion'
import { Mail, Calendar, MessageSquare, FileText, MessageCircle, Bot, Video, Phone, Loader2, RefreshCw, Check, Key, AlertCircle, ArrowRight, ExternalLink, LogOut, Github, X, Server, GitBranch, Terminal, CheckCircle2, ChevronDown, ChevronUp, Trash2, XCircle } from 'lucide-react'

interface Connector {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  autoLiveSync?: boolean
  available: boolean
}

const connectors: Connector[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: <Mail className="w-6 h-6" />,
    description: 'Import project details and track the context of important conversations.',
    autoLiveSync: true,
    available: true,
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    icon: <Calendar className="w-6 h-6" />,
    description: 'Sync your events so OS-1 stays on top of meetings, plans, and deadlines.',
    autoLiveSync: true,
    available: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: <Github className="w-6 h-6" />,
    description: 'Let AI agents complete your unfinished projects autonomously.',
    autoLiveSync: false,
    available: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: <MessageSquare className="w-6 h-6" />,
    description: 'Extract key insights and memories from your team channels and DMs.',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: <FileText className="w-6 h-6" />,
    description: 'Sync your workspace pages, project roadmaps, and structured knowledge.',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: <Bot className="w-6 h-6" />,
    description: 'Capture your brainstorming sessions, creative ideas, and problem-solving history.',
    autoLiveSync: false,
    available: false,
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: <MessageCircle className="w-6 h-6" />,
    description: 'Preserve your Claude in-depth discussions, research analysis, and writing drafts.',
    autoLiveSync: false,
    available: false,
  },
  {
    id: 'granola',
    name: 'Granola',
    icon: <Video className="w-6 h-6" />,
    description: 'Upload meeting notes to turn transcripts into memories.',
    autoLiveSync: false,
    available: false,
  },
  {
    id: 'fireflies',
    name: 'Fireflies',
    icon: <Video className="w-6 h-6" />,
    description: 'Turn meeting transcripts, summaries, and action items into memories.',
    autoLiveSync: true,
    available: false,
  },
  {
    id: 'fathom',
    name: 'Fathom',
    icon: <Phone className="w-6 h-6" />,
    description: 'Turn meeting transcripts, summaries, and action items into memories.',
    autoLiveSync: true,
    available: false,
  },
]

interface SetupStatus {
  status: string
  vmCreated: boolean
  repoCreated: boolean
  repoCloned: boolean
  gitSyncConfigured: boolean
  clawdbotInstalled?: boolean
  telegramConfigured?: boolean
  gatewayStarted?: boolean
  orgoComputerId?: string
  orgoComputerUrl?: string
  vaultRepoUrl?: string
  errorMessage?: string
}

export default function LearningSourcesPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramUserId, setTelegramUserId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [showSetupProgress, setShowSetupProgress] = useState(false)
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [setupLogs, setSetupLogs] = useState<Array<{ time: Date; message: string; type: 'info' | 'success' | 'error' }>>([])
  const [isLoadingStatus, setIsLoadingStatus] = useState(true) // Track if we're still loading initial status

  useEffect(() => {
    // Handle OAuth callback parameters
    const gmailConnected = searchParams?.get('gmail_connected')
    const calendarConnected = searchParams?.get('calendar_connected')
    const error = searchParams?.get('error')

    if (gmailConnected === 'true') {
      // Show success message (could use a toast library here)
      console.log('Gmail connected successfully')
      // Trigger refresh of connector cards
      setRefreshKey(prev => prev + 1)
    }

    if (calendarConnected === 'true') {
      // Show success message (could use a toast library here)
      console.log('Calendar connected successfully')
      // Trigger refresh of connector cards
      setRefreshKey(prev => prev + 1)
    }

    if (error) {
      console.error('Connection error:', error)
      // Show error message
    }
  }, [searchParams])

  const addLog = useCallback((type: 'info' | 'success' | 'error', message: string) => {
    setSetupLogs(prev => [...prev, { time: new Date(), message, type }])
  }, [])

  // Check initial setup status on mount and periodically
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const res = await fetch('/api/setup/status')
        if (res.ok) {
          const status: SetupStatus = await res.json()
          setSetupStatus(prevStatus => {
            // Handle state transitions
            if (status.status === 'ready' && prevStatus?.status !== 'ready') {
              // Just became ready
              setShowSetupProgress(false)
            } else if (status.status === 'pending' && prevStatus?.status === 'ready') {
              // Computer was deleted/reset - hide progress and show API key form
              setShowSetupProgress(false)
              setSetupLogs([])
            } else if (status.status && status.status !== 'pending' && status.status !== 'ready' && status.status !== 'failed') {
              // Setup in progress
            setShowSetupProgress(true)
              if (!prevStatus || prevStatus.status === 'pending') {
            addLog('info', `Setup status: ${status.status}`)
              }
          } else if (status.status === 'ready') {
              // Already ready - ensure we don't show progress
              setShowSetupProgress(false)
          } else if (status.status === 'failed') {
            addLog('error', status.errorMessage || 'Setup failed')
          }
            return status
          })
        }
      } catch (e) {
        console.error('Failed to check initial setup status:', e)
      }
    }
    // Run immediately on mount
    checkInitialStatus()
    
    // Check periodically to detect if computer was deleted from Orgo
    const interval = setInterval(checkInitialStatus, 5000) // Check every 5 seconds
    
    return () => clearInterval(interval)
  }, [addLog])
  
  // Check status immediately on mount to avoid flash of wrong content
  useEffect(() => {
    const checkStatusImmediately = async () => {
      try {
        const res = await fetch('/api/setup/status')
        if (res.ok) {
          const status: SetupStatus = await res.json()
          setSetupStatus(status)
          setIsLoadingStatus(false)
          
          // Set UI state based on status
          if (status.status === 'ready' && status.orgoComputerId) {
            setShowSetupProgress(false)
          } else if (status.status && status.status !== 'pending' && status.status !== 'ready' && status.status !== 'failed') {
            setShowSetupProgress(true)
          } else {
            setShowSetupProgress(false)
          }
        } else {
          setIsLoadingStatus(false)
        }
      } catch (e) {
        console.error('Failed to check initial setup status:', e)
        setIsLoadingStatus(false)
      }
    }
    checkStatusImmediately()
  }, [])

  // Poll setup status when progress is shown
  useEffect(() => {
    if (!showSetupProgress) return

    let shouldStop = false

    const pollStatus = async () => {
      if (shouldStop) return
      
      try {
        const res = await fetch('/api/setup/status')
        if (res.ok) {
          const status: SetupStatus = await res.json()
          
          setSetupStatus(prevStatus => {
            // Add logs for status changes
            if (prevStatus) {
              if (status.status !== prevStatus.status) {
                addLog('info', `Status changed: ${prevStatus.status} → ${status.status}`)
              }
              if (status.vmCreated && !prevStatus.vmCreated) {
                addLog('success', 'VM created successfully')
              }
              if (status.repoCreated && !prevStatus.repoCreated) {
                addLog('success', 'Vault repository created')
              }
              if (status.repoCloned && !prevStatus.repoCloned) {
                addLog('success', 'Vault repository cloned to VM')
              }
              if (status.gitSyncConfigured && !prevStatus.gitSyncConfigured) {
                addLog('success', 'Git sync configured')
              }
            }

            // Check for completion or failure
            if (status.status === 'ready') {
              addLog('success', 'Setup completed successfully!')
              shouldStop = true
            } else if (status.status === 'failed') {
              addLog('error', status.errorMessage || 'Setup failed')
              shouldStop = true
            }

            return status
          })
        }
      } catch (e) {
        console.error('Failed to poll setup status:', e)
        addLog('error', 'Failed to check setup status')
      }
    }

    // Poll every 2 seconds
    const interval = setInterval(() => {
      if (!shouldStop) {
        pollStatus()
      }
    }, 2000)
    pollStatus() // Initial call

    return () => {
      shouldStop = true
      clearInterval(interval)
    }
  }, [showSetupProgress, addLog])

  const handleStartSetup = async () => {
    if (!claudeApiKey.trim()) {
      setSetupError('Claude API key is required')
      return
    }

    setIsSubmitting(true)
    setSetupError(null)
    setSetupLogs([])

    try {
      const res = await fetch('/api/setup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          claudeApiKey,
          telegramBotToken: telegramBotToken.trim() || undefined,
          telegramUserId: telegramUserId.trim() || undefined,
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to start setup')
      }

      // Show progress view
      setShowSetupProgress(true)
      addLog('info', 'Setup process started...')
      addLog('info', 'Creating Orgo VM...')
      
      // Clear the input
      setClaudeApiKey('')
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Something went wrong')
      addLog('error', e instanceof Error ? e.message : 'Failed to start setup')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-sam-bg">
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Top Bar with Logout */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex-1" />
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border hover:border-sam-error/50 text-sam-text-dim hover:text-sam-error transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-mono">Sign out</span>
          </button>
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 text-sam-text leading-tight">
            Connect your sources
          </h1>
          <p className="text-lg text-sam-text-dim max-w-3xl font-body leading-relaxed">
          Each source becomes structured context the AI agent uses to execute tasks. Your private data lives securely in a private GitHub repository.
          </p>
        </motion.div>

        {/* Setup Progress or API Keys Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-12"
        >
          {isLoadingStatus ? (
            <div className="p-8 rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur flex items-center justify-center min-h-[200px]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
                <p className="text-sm text-sam-text-dim font-mono">Loading setup status...</p>
              </div>
            </div>
          ) : showSetupProgress ? (
            <SetupProgressView 
              setupStatus={setupStatus} 
              logs={setupLogs}
              onReset={() => {
                setShowSetupProgress(false)
                setSetupStatus(null)
                setSetupLogs([])
              }}
            />
          ) : setupStatus?.status === 'ready' && setupStatus?.orgoComputerId ? (
            <ComputerConnectedView 
              setupStatus={setupStatus}
              onStatusUpdate={async () => {
                // Refresh status
                const res = await fetch('/api/setup/status')
                if (res.ok) {
                  const newStatus = await res.json()
                  setSetupStatus(newStatus)
                }
              }}
              onDelete={async () => {
                try {
                  const res = await fetch('/api/setup/delete-computer', {
                    method: 'POST',
                  })
                  if (res.ok) {
                    // Status will be updated by the periodic check
                    setSetupStatus(null)
                    setIsLoadingStatus(true) // Re-check status
                  } else {
                    const error = await res.json()
                    alert(`Failed to delete computer: ${error.error || 'Unknown error'}`)
                  }
                } catch (error) {
                  console.error('Failed to delete computer:', error)
                  alert('Failed to delete computer. Please try again.')
                }
              }}
            />
          ) : (
            <div className="p-8 rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur">
              <h2 className="text-2xl font-display font-bold mb-2">Enter your API Keys</h2>
              <p className="text-sam-text-dim mb-8">
                Your keys are encrypted and stored locally. We never access or store your credentials—they remain private to you.
              </p>

              {setupError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-6 p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-sam-error flex-shrink-0 mt-0.5" />
                  <p className="text-sam-error text-sm">{setupError}</p>
                </motion.div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-mono text-sam-text-dim mb-2">
                    Claude API Key <span className="text-sam-error">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={claudeApiKey}
                      onChange={(e) => setClaudeApiKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      className="w-full px-4 py-3 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-sm transition-colors"
                    />
                  </div>
                  <a 
                    href="https://console.anthropic.com/settings/keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-sam-accent hover:underline"
                  >
                    Get your key from Anthropic Console
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-sm font-mono text-sam-text-dim mb-2">
                    Telegram Bot Token <span className="text-sam-text-dim text-xs">(Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                      className="w-full px-4 py-3 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-sm transition-colors"
                    />
                  </div>
                  <p className="mt-2 text-xs text-sam-text-dim">
                    Get your bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-sam-accent hover:underline">@BotFather</a> on Telegram
                  </p>
                </div>

                {telegramBotToken.trim() && (
                  <div>
                    <label className="block text-sm font-mono text-sam-text-dim mb-2">
                      Telegram User ID <span className="text-sam-text-dim text-xs">(Optional - for allowlist)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={telegramUserId}
                        onChange={(e) => setTelegramUserId(e.target.value)}
                        placeholder="123456789"
                        className="w-full px-4 py-3 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-sm transition-colors"
                      />
                    </div>
                    <p className="mt-2 text-xs text-sam-text-dim">
                      Your Telegram user ID. Get it from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-sam-accent hover:underline">@userinfobot</a>
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={handleStartSetup}
                disabled={isSubmitting || !claudeApiKey.trim()}
                className="mt-8 w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-sam-accent text-sam-bg font-display font-semibold hover:bg-sam-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Starting setup...
                  </>
                ) : (
                  <>
                    Begin Setup
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>

        {/* Connectors Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
        >
          {connectors.map((connector, index) => (
            <ConnectorCard key={`${connector.id}-${refreshKey}`} connector={connector} index={index} />
          ))}
        </motion.div>

        {/* Footer Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl border border-sam-border bg-sam-surface/30"
        >
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-mono text-sam-text-dim mb-1">Memory Density</p>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-sam-surface rounded-full overflow-hidden">
                  <div className="h-full bg-sam-accent rounded-full" style={{ width: '0%' }} />
                </div>
                <span className="text-sm text-sam-text-dim font-mono">Empty</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-sam-text-dim font-body max-w-md text-center md:text-right">
            OS-1 understands you based on your memories. Your data stays encrypted and private—we never store, share, or train on your personal information.
          </p>
          <button className="px-6 py-3 rounded-xl bg-sam-surface border border-sam-border text-sam-text-dim hover:border-sam-accent hover:text-sam-text transition-all font-display font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            Next
          </button>
        </motion.div>
      </div>
    </div>
  )
}

function ConnectorCard({ connector, index }: { connector: Connector; index: number }) {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSynced, setIsSynced] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [showGithubDialog, setShowGithubDialog] = useState(false)
  const [githubRepos, setGithubRepos] = useState<Array<{ id: number; full_name: string; name: string; private: boolean }>>([])
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)

  // Check connection status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/integrations/status')
        if (response.ok) {
          const data = await response.json()
          const status = data.status?.[connector.id]
          if (status?.connected || status?.pending) {
            setIsConnected(true)
            if (status.email) {
              setConnectedEmail(status.email)
            } else if (connector.id === 'github' && status.repositoryCount) {
              const pendingText = status.pending ? ' (pending VM setup)' : ''
              setConnectedEmail(`${status.repositoryCount} repository(ies)${pendingText}`)
            }
          }
        }
      } catch (error) {
        console.error('Failed to check integration status:', error)
      }
    }

    checkStatus()
  }, [connector.id])

  const handleConnect = async () => {
    if (isConnecting || isConnected) return

    // For GitHub, show dialog with repository selection
    if (connector.id === 'github') {
      setIsLoadingRepos(true)
      setShowGithubDialog(true)
      
      try {
        const response = await fetch(`/api/integrations/${connector.id}/connect`, {
          method: 'GET',
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to fetch repositories')
        }

        const data = await response.json()
        setGithubRepos(data.repositories || [])
      } catch (error) {
        console.error(`Failed to fetch GitHub repositories:`, error)
        alert(`Failed to fetch repositories. Please try again.`)
        setShowGithubDialog(false)
      } finally {
        setIsLoadingRepos(false)
      }
      return
    }

    // For other connectors, use existing OAuth flow
    setIsConnecting(true)
    try {
      const response = await fetch(`/api/integrations/${connector.id}/connect`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to connect')
      }

      const data = await response.json()

      // If OAuth URL is returned, redirect to it
      if (data.authUrl) {
        window.location.href = data.authUrl
        return
      }

      // Otherwise, connection was successful
      setIsConnected(true)
      if (data.email) {
        setConnectedEmail(data.email)
      }
    } catch (error) {
      console.error(`Failed to connect ${connector.name}:`, error)
      alert(`Failed to connect ${connector.name}. Please try again.`)
      setIsConnecting(false)
    }
  }

  const handleGithubConnect = async () => {
    if (selectedRepos.size === 0) {
      alert('Please select at least one repository')
      return
    }

    setIsConnecting(true)
    try {
      const response = await fetch(`/api/integrations/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedRepos: Array.from(selectedRepos) }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to connect repositories')
      }

      const data = await response.json()
      
      setIsConnected(true)
      setShowGithubDialog(false)
      setSelectedRepos(new Set())
      
      if (data.cloneErrors && data.cloneErrors.length > 0) {
        alert(`Connected ${data.repositories.length} repositories. Some repositories had cloning errors.`)
      }
    } catch (error) {
      console.error(`Failed to connect GitHub repositories:`, error)
      alert(`Failed to connect repositories. Please try again.`)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleResync = async () => {
    if (isSyncing || !isConnected || isSynced) return

    setIsSyncing(true)
    setIsSynced(false)
    try {
      const response = await fetch(`/api/integrations/${connector.id}/sync-user`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Sync error response:', error)
        throw new Error(error.error || `HTTP ${response.status}: Failed to sync`)
      }

      const data = await response.json()
      setIsSynced(true)
      
      // Reset to "Resync" after 3 seconds
      setTimeout(() => {
        setIsSynced(false)
      }, 3000)
    } catch (error: any) {
      console.error(`Failed to sync ${connector.name}:`, error)
      // Show error alert only on failure
      const errorMessage = error?.message || error?.toString() || 'Unknown error'
      alert(`Failed to sync ${connector.name}: ${errorMessage}`)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 * index }}
      className="group relative p-6 rounded-2xl border border-sam-border bg-sam-surface/30 hover:border-sam-accent/50 hover:bg-sam-surface/40 transition-all duration-300"
    >
      {/* Header with Icon, Name, and Button */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-sam-surface flex items-center justify-center text-sam-text group-hover:text-sam-accent transition-colors flex-shrink-0">
            {connector.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {connector.autoLiveSync && (
                <span className="text-xs font-mono text-sam-accent bg-sam-accent/10 px-2 py-0.5 rounded">
                  Auto Live-sync
                </span>
              )}
              <h3 className="text-lg font-display font-semibold text-sam-text">
                {connector.name}
              </h3>
            </div>
            {isConnected && (
              <p className="text-xs text-sam-text-dim font-mono mt-1">
                {connectedEmail || (connector.id === 'github' && 'Repositories connected')}
              </p>
            )}
          </div>
        </div>
        <div className="ml-3 flex-shrink-0">
          {connector.available ? (
            isConnected ? (
              connector.autoLiveSync ? (
                <button 
                  onClick={handleResync}
                  disabled={isSyncing || isSynced}
                  className={`px-4 py-2 rounded-lg border font-display font-semibold text-sm transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                    isSynced
                      ? 'border-green-500 bg-green-500/10 text-green-500'
                      : 'border-sam-accent text-sam-accent hover:bg-sam-accent/10'
                  }`}
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : isSynced ? (
                    <>
                      <Check className="w-4 h-4" />
                      Synced
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Resync
                    </>
                  )}
                </button>
              ) : (
                <button 
                  disabled
                  className="px-4 py-2 rounded-lg border border-green-500 bg-green-500/10 text-green-500 font-display font-semibold text-sm whitespace-nowrap flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Connected
                </button>
              )
            ) : (
              <button 
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-4 py-2 rounded-lg border border-sam-accent text-sam-accent font-display font-semibold text-sm hover:bg-sam-accent/10 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </button>
            )
          ) : (
            <button 
              disabled
              className="px-4 py-2 rounded-lg bg-sam-surface border border-sam-border text-sam-text-dim font-display font-medium text-sm cursor-not-allowed opacity-60 whitespace-nowrap"
            >
              Coming Soon
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-sam-text-dim font-body leading-relaxed">
        {connector.description}
      </p>

      {/* GitHub Repository Selection Dialog */}
      {connector.id === 'github' && showGithubDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowGithubDialog(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-sam-surface border border-sam-border rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold text-sam-text">Select GitHub Repositories</h2>
              <button
                onClick={() => setShowGithubDialog(false)}
                className="p-2 rounded-lg hover:bg-sam-surface/50 text-sam-text-dim hover:text-sam-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingRepos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-sam-accent" />
                <span className="ml-3 text-sam-text-dim">Loading repositories...</span>
              </div>
            ) : githubRepos.length === 0 ? (
              <div className="text-center py-12 text-sam-text-dim">
                No repositories found
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto mb-6 space-y-2">
                  {githubRepos.map((repo) => (
                    <label
                      key={repo.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-sam-border hover:bg-sam-surface/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRepos.has(repo.full_name)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedRepos)
                          if (e.target.checked) {
                            newSelected.add(repo.full_name)
                          } else {
                            newSelected.delete(repo.full_name)
                          }
                          setSelectedRepos(newSelected)
                        }}
                        className="mt-1 w-4 h-4 rounded border-sam-border text-sam-accent focus:ring-sam-accent focus:ring-2"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold text-sam-text">{repo.name}</span>
                          {repo.private && (
                            <span className="text-xs px-2 py-0.5 rounded bg-sam-surface border border-sam-border text-sam-text-dim">
                              Private
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-sam-text-dim font-mono">{repo.full_name}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-sam-border">
                  <span className="text-sm text-sam-text-dim">
                    {selectedRepos.size} repository(ies) selected
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowGithubDialog(false)}
                      className="px-4 py-2 rounded-lg border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleGithubConnect}
                      disabled={isConnecting || selectedRepos.size === 0}
                      className="px-6 py-2 rounded-lg bg-sam-accent text-sam-bg font-display font-semibold hover:bg-sam-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

function SetupProgressView({ 
  setupStatus, 
  logs,
  onReset 
}: { 
  setupStatus: SetupStatus | null
  logs: Array<{ time: Date; message: string; type: 'info' | 'success' | 'error' }>
  onReset: () => void
}) {
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null)
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(false)
  
  // Poll for screenshots if VM is created
  useEffect(() => {
    if (!setupStatus?.orgoComputerId || !setupStatus?.vmCreated) {
      return
    }

    const fetchScreenshot = async () => {
      try {
        const res = await fetch('/api/setup/screenshot')
        if (res.ok) {
          const data = await res.json()
          // Handle both base64 image and image URL
          if (data.image && data.image.length > 0) {
            setCurrentScreenshot(data.image)
          } else if (data.imageUrl) {
            // If we got a URL, use it directly
            setCurrentScreenshot(data.imageUrl)
          } else if (data.error) {
            // Only log non-503 errors (503 means VM is starting, which is expected)
            if (res.status !== 503) {
              console.error('Screenshot API error:', data.error)
            }
          }
        } else {
          // 503 (Service Unavailable) means VM is starting - this is expected, don't log as error
          if (res.status === 503) {
            // VM is still starting, this is normal - don't log as error
            return
          }
          
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
          // Only log non-503 errors
          if (res.status !== 503) {
            console.error('Failed to fetch screenshot:', errorData.error)
          }
        }
      } catch (error) {
        // Network errors are also expected during VM startup
        console.error('Failed to fetch screenshot:', error)
        // Don't clear the existing screenshot on transient errors
      }
    }

    // Initial fetch
    fetchScreenshot()

    // Poll every 500ms for smooth video-like stream
    const interval = setInterval(fetchScreenshot, 500)

    return () => clearInterval(interval)
  }, [setupStatus?.orgoComputerId, setupStatus?.vmCreated])
  const steps = [
    { 
      id: 'provisioning', 
      label: 'Provisioning VM', 
      icon: Server,
      check: () => setupStatus?.vmCreated || false,
      active: () => setupStatus?.status === 'provisioning' || (setupStatus?.status === 'creating_repo' && !setupStatus?.vmCreated)
    },
    { 
      id: 'creating_repo', 
      label: 'Creating Vault Repo', 
      icon: GitBranch,
      check: () => setupStatus?.repoCreated || false,
      active: () => setupStatus?.status === 'creating_repo' || (setupStatus?.status === 'configuring_vm' && !setupStatus?.repoCreated)
    },
    { 
      id: 'configuring_vm', 
      label: 'Configuring VM', 
      icon: Terminal,
      check: () => setupStatus?.status === 'ready',
      active: () => setupStatus?.status === 'configuring_vm',
      subSteps: [
        { label: 'Clone repository', check: () => setupStatus?.repoCloned || false },
        { label: 'Configure Git sync', check: () => setupStatus?.gitSyncConfigured || false },
      ]
    },
    { 
      id: 'complete', 
      label: 'Setup Complete', 
      icon: CheckCircle2,
      check: () => setupStatus?.status === 'ready' || false,
      active: () => setupStatus?.status === 'ready'
    },
  ]

  const getStepStatus = (step: typeof steps[0]) => {
    if (step.check()) return 'complete'
    if (step.active()) return 'active'
    return 'pending'
  }

  const currentStepIndex = steps.findIndex(s => s.active())
  const progressPercentage = currentStepIndex >= 0 
    ? ((currentStepIndex + 1) / steps.length) * 100
    : setupStatus?.status === 'ready' ? 100 : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* VM Stream on Left */}
      <div className="rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur overflow-hidden">
        <div className="px-6 py-4 border-b border-sam-border bg-sam-surface/50 flex items-center justify-between">
        <div>
            <h3 className="text-lg font-display font-bold text-sam-text">VM Screen</h3>
            <p className="text-xs text-sam-text-dim font-mono">Live view</p>
          </div>
          {setupStatus?.orgoComputerUrl && (
            <a
              href={setupStatus.orgoComputerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sam-accent hover:underline flex items-center gap-1"
            >
              Open in Orgo
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="aspect-video bg-sam-bg flex items-center justify-center relative">
          {setupStatus?.vmCreated && setupStatus?.orgoComputerId ? (
            currentScreenshot ? (
              <img 
                src={currentScreenshot.startsWith('http') ? currentScreenshot : `data:image/png;base64,${currentScreenshot}`}
                alt="VM Screen"
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.error('Failed to load screenshot image')
                  setCurrentScreenshot(null)
                }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-sam-text-dim">
                <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
                <p className="text-sm font-mono">Loading VM screen...</p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-3 text-sam-text-dim">
              <Server className="w-12 h-12" />
              <p className="text-sm font-mono">VM not created yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Progress Card on Right (Collapsible) */}
      <div className="rounded-2xl border border-sam-border bg-sam-surface/50 backdrop-blur overflow-hidden">
        <div 
          className="px-6 py-4 border-b border-sam-border bg-sam-surface/50 flex items-center justify-between cursor-pointer hover:bg-sam-surface/70 transition-colors"
          onClick={() => setIsProgressCollapsed(!isProgressCollapsed)}
        >
          <div>
            <h2 className="text-lg font-display font-bold mb-1">Setup Progress</h2>
            <p className="text-xs text-sam-text-dim font-mono">
            {setupStatus?.status === 'ready' 
                ? 'Completed successfully!' 
              : setupStatus?.status === 'failed'
                ? 'Encountered an error'
                : `${Math.round(progressPercentage)}% complete`}
          </p>
        </div>
          <div className="flex items-center gap-3">
        {setupStatus?.status === 'ready' && (
          <button
                onClick={(e) => {
                  e.stopPropagation()
                  onReset()
                }}
                className="px-3 py-1.5 rounded-lg border border-sam-border text-sam-text-dim hover:border-sam-accent hover:text-sam-accent transition-all font-display font-medium text-xs"
          >
            Reset
          </button>
        )}
            {isProgressCollapsed ? (
              <ChevronDown className="w-5 h-5 text-sam-text-dim" />
            ) : (
              <ChevronUp className="w-5 h-5 text-sam-text-dim" />
        )}
          </div>
      </div>

        {!isProgressCollapsed && (
          <div className="p-6 overflow-y-auto max-h-[calc(100vh-300px)]">

      {/* Progress Bar */}
            <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-mono text-sam-text-dim">Progress</span>
          <span className="text-sm font-mono text-sam-text-dim">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="w-full h-2 bg-sam-surface rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-sam-accent rounded-full"
          />
        </div>
      </div>

      {/* Setup Steps */}
            <div className="space-y-4 mb-6">
        {steps.map((step, index) => {
          const status = getStepStatus(step)
          const isComplete = status === 'complete'
          const isActive = status === 'active'
          
          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-lg border transition-all ${
                isActive 
                  ? 'border-sam-accent bg-sam-accent/10' 
                  : isComplete
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-sam-border bg-sam-surface/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isComplete
                    ? 'bg-green-500/20 text-green-500'
                    : isActive
                    ? 'bg-sam-accent/20 text-sam-accent'
                    : 'bg-sam-surface text-sam-text-dim'
                }`}>
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className={`font-display font-semibold ${
                    isActive ? 'text-sam-accent' : isComplete ? 'text-green-500' : 'text-sam-text-dim'
                  }`}>
                    {step.label}
                  </h3>
                  {step.subSteps && (isActive || isComplete) && (
                    <div className="mt-2 space-y-1 ml-12">
                      {step.subSteps.map((subStep, subIndex) => (
                        <div key={subIndex} className="flex items-center gap-2 text-sm">
                          {subStep.check() ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-sam-border" />
                          )}
                          <span className={subStep.check() ? 'text-sam-text' : 'text-sam-text-dim'}>
                            {subStep.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Error Message */}
      {setupStatus?.errorMessage && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-6 p-4 rounded-lg bg-sam-error/10 border border-sam-error/30 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-sam-error flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sam-error text-sm font-semibold mb-1">Setup Error</p>
            <p className="text-sam-error text-sm">{setupStatus.errorMessage}</p>
          </div>
        </motion.div>
      )}

      {/* Setup Logs */}
      <div className="border border-sam-border rounded-lg bg-sam-bg overflow-hidden">
        <div className="px-4 py-3 border-b border-sam-border bg-sam-surface/50">
          <h3 className="text-sm font-display font-semibold text-sam-text">Setup Logs</h3>
        </div>
        <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-sam-text-dim">Waiting for setup to start...</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2 ${
                    log.type === 'error' 
                      ? 'text-sam-error' 
                      : log.type === 'success'
                      ? 'text-green-500'
                      : 'text-sam-text-dim'
                  }`}
                >
                  <span className="text-sam-text-dim/50 flex-shrink-0">
                    {log.time.toLocaleTimeString()}
                  </span>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Links */}
            {setupStatus && setupStatus.vaultRepoUrl && (
              <div className="mt-6">
            <a
                  href={setupStatus.vaultRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-sam-accent hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
                  View Vault Repository
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ComputerConnectedView({ 
  setupStatus, 
  onStatusUpdate,
  onDelete 
}: { 
  setupStatus: SetupStatus
  onStatusUpdate?: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(null)
  const [showTelegramConfig, setShowTelegramConfig] = useState(false)
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [telegramUserId, setTelegramUserId] = useState('')
  const [isConfiguringTelegram, setIsConfiguringTelegram] = useState(false)
  const [telegramError, setTelegramError] = useState<string | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<any>(null)
  const [isCheckingGateway, setIsCheckingGateway] = useState(false)
  const [isStartingGateway, setIsStartingGateway] = useState(false)
  const [showGatewayLogs, setShowGatewayLogs] = useState(false)

  // Poll for screenshots continuously
  useEffect(() => {
    if (!setupStatus?.orgoComputerId || !setupStatus?.vmCreated) {
      return
    }

    let consecutive404s = 0
    const max404s = 3 // Stop polling after 3 consecutive 404s
    let intervalId: NodeJS.Timeout | null = null

    const fetchScreenshot = async () => {
      try {
        const res = await fetch('/api/setup/screenshot')
        if (res.ok) {
          const data = await res.json()
          // Reset 404 counter on success
          consecutive404s = 0
          // Handle both base64 image and image URL
          if (data.image && data.image.length > 0) {
            setCurrentScreenshot(data.image)
          } else if (data.imageUrl) {
            // If we got a URL, use it directly
            setCurrentScreenshot(data.imageUrl)
          } else if (data.error) {
            // Only log non-503 errors (503 means VM is starting, which is expected)
            if (res.status !== 503) {
              console.error('Screenshot API error:', data.error)
            }
          }
        } else {
          // 404 means computer was deleted - stop polling after a few attempts
          if (res.status === 404) {
            consecutive404s++
            const errorData = await res.json().catch(() => ({ error: 'Computer not found' }))
            if (errorData.deleted || consecutive404s >= max404s) {
              console.log('Computer was deleted, stopping screenshot polling')
              // Clear screenshot and stop polling
              setCurrentScreenshot(null)
              if (intervalId) {
                clearInterval(intervalId)
                intervalId = null
              }
              // The status check will detect the reset state and update the UI
              return
            }
            return
          }
          
          // 503 (Service Unavailable) means VM is starting - this is expected, don't log as error
          if (res.status === 503) {
            // VM is still starting, this is normal - don't log as error
            return
          }
          
          // Reset 404 counter on other errors
          consecutive404s = 0
          
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
          // Only log non-503, non-404 errors
          if (res.status !== 503 && res.status !== 404) {
            console.error('Failed to fetch screenshot:', errorData.error)
          }
        }
      } catch (error) {
        // Network errors are also expected during VM startup
        console.error('Failed to fetch screenshot:', error)
        // Don't clear the existing screenshot on transient errors
      }
    }

    // Initial fetch
    fetchScreenshot()

    // Poll every 500ms for smooth video-like stream
    intervalId = setInterval(() => {
      fetchScreenshot().catch(() => {
        // Handle errors in polling
      })
    }, 500)
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [setupStatus?.orgoComputerId, setupStatus?.vmCreated])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete your computer? This will reset your setup and you will need to start over.')) {
      return
    }

    setIsDeleting(true)
    try {
      await onDelete()
    } catch (error) {
      console.error('Delete error:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* VM Stream (Left Column - 2/3 width) */}
      <div className="lg:col-span-2 bg-sam-surface/50 border border-sam-border rounded-2xl p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold text-sam-text">VM Screen</h2>
          {setupStatus?.orgoComputerUrl && (
            <a
              href={setupStatus.orgoComputerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-sam-accent hover:underline"
            >
              Open in Orgo
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="aspect-video bg-sam-bg flex items-center justify-center relative flex-1 rounded-lg overflow-hidden">
          {setupStatus?.vmCreated && setupStatus?.orgoComputerId ? (
            currentScreenshot ? (
              <img 
                src={currentScreenshot.startsWith('http') ? currentScreenshot : `data:image/png;base64,${currentScreenshot}`}
                alt="VM Screen"
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.error('Failed to load screenshot image')
                  setCurrentScreenshot(null) // Clear on error to show loading/error state
                }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-sam-text-dim">
                <Loader2 className="w-8 h-8 animate-spin text-sam-accent" />
                <p className="text-sm font-mono">Loading VM screen...</p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-3 text-sam-text-dim">
              <Server className="w-8 h-8" />
              <p className="text-sm font-mono">VM not yet created</p>
            </div>
          )}
        </div>
      </div>

      {/* Computer Connected Card (Right Column - 1/3 width) */}
      <div className="lg:col-span-1 p-6 rounded-2xl border border-sam-accent/30 bg-sam-accent/5 backdrop-blur flex flex-col">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-12 h-12 rounded-xl bg-sam-accent/20 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-sam-accent" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-display font-bold mb-1">
                <span className="text-gradient">Computer Connected</span>
              </h2>
              <p className="text-sm text-sam-text-dim mb-4">
                Your VM is running and ready to use.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {setupStatus.orgoComputerUrl && (
            <a
              href={setupStatus.orgoComputerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border bg-sam-surface hover:border-sam-accent transition-all w-full"
            >
              <Server className="w-4 h-4 text-sam-accent" />
              <span className="font-mono text-sm">Open VM Console</span>
              <ExternalLink className="w-4 h-4 text-sam-text-dim ml-auto" />
            </a>
          )}
          {setupStatus.vaultRepoUrl && (
            <a
              href={setupStatus.vaultRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sam-border bg-sam-surface hover:border-sam-accent transition-all w-full"
            >
              <GitBranch className="w-4 h-4 text-sam-accent" />
              <span className="font-mono text-sm">View Vault Repository</span>
              <ExternalLink className="w-4 h-4 text-sam-text-dim ml-auto" />
            </a>
          )}
        </div>
        
        <div className="pt-4 border-t border-sam-border/50 mb-4">
          <h3 className="font-display font-semibold mb-3 text-sm text-sam-text">Setup Complete</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span className="text-sam-text-dim">VM Created</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span className="text-sam-text-dim">Repository Ready</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              <span className="text-sam-text-dim">Git Sync Configured</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {setupStatus.telegramConfigured && setupStatus.gatewayStarted ? (
                <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-3 h-3 text-sam-text-dim flex-shrink-0" />
              )}
              <span className={setupStatus.telegramConfigured && setupStatus.gatewayStarted ? 'text-sam-text-dim' : 'text-sam-text-dim'}>
                Telegram {setupStatus.telegramConfigured && setupStatus.gatewayStarted ? 'Connected' : 'Not Configured'}
              </span>
            </div>
          </div>
        </div>

        {/* Telegram Configuration */}
        {!setupStatus.telegramConfigured ? (
          <div className="mb-4 p-4 rounded-lg border border-sam-border bg-sam-surface/30">
            {!showTelegramConfig ? (
              <button
                onClick={() => setShowTelegramConfig(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-sam-accent text-sam-accent hover:bg-sam-accent/10 transition-all font-display font-medium text-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Configure Telegram
              </button>
            ) : (
              <div className="space-y-3">
                <h4 className="text-sm font-display font-semibold text-sam-text mb-2">Configure Telegram</h4>
                {telegramError && (
                  <div className="p-2 rounded bg-sam-error/10 border border-sam-error/30 text-sam-error text-xs">
                    {telegramError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-mono text-sam-text-dim mb-1">
                    Bot Token <span className="text-sam-error">*</span>
                  </label>
                  <input
                    type="password"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="1234567890:ABCdef..."
                    className="w-full px-3 py-2 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-xs transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-sam-text-dim mb-1">
                    User ID <span className="text-sam-text-dim text-xs">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={telegramUserId}
                    onChange={(e) => setTelegramUserId(e.target.value)}
                    placeholder="123456789"
                    className="w-full px-3 py-2 rounded-lg bg-sam-bg border border-sam-border focus:border-sam-accent outline-none font-mono text-xs transition-colors"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!telegramBotToken.trim()) {
                        setTelegramError('Bot token is required')
                        return
                      }
                      setIsConfiguringTelegram(true)
                      setTelegramError(null)
                      try {
                        const res = await fetch('/api/setup/configure-telegram', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            telegramBotToken: telegramBotToken.trim(),
                            telegramUserId: telegramUserId.trim() || undefined,
                          }),
                        })
                        if (!res.ok) {
                          const data = await res.json()
                          throw new Error(data.error || 'Failed to configure Telegram')
                        }
                        const data = await res.json()
                        setShowTelegramConfig(false)
                        setTelegramBotToken('')
                        setTelegramUserId('')
                        // Refresh status
                        if (onStatusUpdate) {
                          await onStatusUpdate()
                        } else {
                          window.location.reload()
                        }
                      } catch (error) {
                        setTelegramError(error instanceof Error ? error.message : 'Failed to configure Telegram')
                      } finally {
                        setIsConfiguringTelegram(false)
                      }
                    }}
                    disabled={isConfiguringTelegram || !telegramBotToken.trim()}
                    className="flex-1 px-3 py-2 rounded-lg bg-sam-accent text-sam-bg hover:bg-sam-accent-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all font-display font-medium text-xs flex items-center justify-center gap-2"
                  >
                    {isConfiguringTelegram ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Configuring...
                      </>
                    ) : (
                      'Configure'
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowTelegramConfig(false)
                      setTelegramBotToken('')
                      setTelegramUserId('')
                      setTelegramError(null)
                    }}
                    className="px-3 py-2 rounded-lg border border-sam-border text-sam-text-dim hover:border-sam-error/50 hover:text-sam-error transition-all font-display font-medium text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4 p-3 rounded-lg border border-green-500/30 bg-green-500/10">
            <div className="flex items-center gap-2 text-xs text-green-500">
              <CheckCircle2 className="w-4 h-4" />
              <span>Telegram connected and gateway running</span>
            </div>
          </div>
        )}

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="mt-auto px-4 py-2 rounded-lg border border-sam-error/50 bg-sam-error/10 text-sam-error hover:bg-sam-error/20 transition-all font-display font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Delete Computer
            </>
          )}
        </button>
      </div>
    </div>
  )
}

