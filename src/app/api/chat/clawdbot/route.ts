/**
 * Clawdbot Chat API
 * 
 * Proxies chat messages to the Clawdbot agent running on the VM.
 * Uses `clawdbot agent --local --session-id <userId> --message "..."` to communicate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findSetupStateDecrypted, findFirstVMDecrypted } from '@/lib/prisma-encrypted'
import { OrgoClient } from '@/lib/orgo'
import { SSHTerminalProvider } from '@/lib/terminal/ssh-terminal'
import { E2BClient } from '@/lib/e2b'

export const maxDuration = 300 // 5 minutes max for long responses

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, vmId, sessionId } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get the setup state to determine VM provider and credentials
    const setupState = await findSetupStateDecrypted({ userId: session.user.id })
    
    if (!setupState) {
      return NextResponse.json({ error: 'Setup not found' }, { status: 404 })
    }

    // Determine the VM provider - check VM record first if vmId provided
    let vmProvider = setupState.vmProvider
    let vm: {
      provider: string
      orgoComputerId?: string | null
      awsPublicIp?: string | null
      awsPrivateKey?: string | null
      e2bSandboxId?: string | null
    } | null = null
    
    if (vmId) {
      // Use decrypted helper to get the private key in plaintext
      const fullVm = await findFirstVMDecrypted({ 
        where: { id: vmId, userId: session.user.id }
      })
      if (fullVm) {
        vm = {
          provider: fullVm.provider,
          orgoComputerId: fullVm.orgoComputerId,
          awsPublicIp: fullVm.awsPublicIp,
          awsPrivateKey: fullVm.awsPrivateKey,
          e2bSandboxId: fullVm.e2bSandboxId,
        }
        vmProvider = fullVm.provider
      }
    }
    
    // Fallback: detect provider from available credentials
    if (!vmProvider) {
      if (setupState.awsInstanceId || setupState.awsPublicIp) {
        vmProvider = 'aws'
      } else if (setupState.e2bApiKey && vm?.e2bSandboxId) {
        vmProvider = 'e2b'
      } else if (setupState.orgoComputerId) {
        vmProvider = 'orgo'
      } else {
        return NextResponse.json({ error: 'No VM configured' }, { status: 400 })
      }
    }
    
    // Use user's session ID or a default session for the chat
    const chatSessionId = sessionId || `web-${session.user.id.slice(0, 8)}`
    
    // Escape the message for shell command (handle quotes and special chars)
    const escapedMessage = message
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
    
    // Get the Claude API key for the agent
    const claudeApiKey = setupState.claudeApiKey
    if (!claudeApiKey) {
      return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 })
    }
    
    // Build the clawdbot command
    const clawdbotCommand = `clawdbot agent --local --session-id "${chatSessionId}" --message "${escapedMessage}"`
    
    // Wrap command to source NVM and set ANTHROPIC_API_KEY for the agent
    const wrappedCommand = `
source ~/.bashrc 2>/dev/null || true
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export ANTHROPIC_API_KEY="${claudeApiKey}"
${clawdbotCommand}
`.trim()

    let result: { output: string; exitCode?: number }

    if (vmProvider === 'orgo') {
      // Execute via Orgo API
      const orgoApiKey = setupState.orgoApiKey
      if (!orgoApiKey) {
        return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 400 })
      }

      const computerId = vm?.orgoComputerId || setupState.orgoComputerId

      if (!computerId) {
        return NextResponse.json({ error: 'Orgo computer not found' }, { status: 404 })
      }

      const client = new OrgoClient(orgoApiKey)
      const orgoResult = await client.bash(computerId, wrappedCommand, 300000) // 5 min timeout
      result = { output: orgoResult.output || '', exitCode: orgoResult.exit_code }

    } else if (vmProvider === 'aws') {
      // Execute via SSH on AWS
      const publicIp = vm?.awsPublicIp || setupState.awsPublicIp
      const privateKey = vm?.awsPrivateKey || setupState.awsPrivateKey
      
      if (!publicIp || !privateKey) {
        return NextResponse.json({ error: 'AWS instance not properly configured' }, { status: 400 })
      }

      // Create SSH terminal provider for AWS
      const sshProvider = new SSHTerminalProvider({
        sessionId: `chat-${chatSessionId}`,
        provider: 'aws',
        host: publicIp,
        port: 22,
        username: 'ubuntu',
        privateKey: privateKey,
      })

      const sshResult = await sshProvider.execute(wrappedCommand)
      await sshProvider.disconnect()
      
      // Combine stdout and stderr - clawdbot may output to either
      const combinedOutput = [sshResult.stdout, sshResult.stderr]
        .filter(Boolean)
        .join('\n')
        .trim()
      
      result = { 
        output: combinedOutput || sshResult.error || '', 
        exitCode: sshResult.success ? 0 : 1 
      }
      
      console.log('SSH result:', { 
        success: sshResult.success, 
        stdoutLen: sshResult.stdout?.length, 
        stderrLen: sshResult.stderr?.length,
        error: sshResult.error 
      })

    } else if (vmProvider === 'e2b') {
      // Execute via E2B
      const e2bApiKey = setupState.e2bApiKey
      const sandboxId = vm?.e2bSandboxId

      if (!e2bApiKey || !sandboxId) {
        return NextResponse.json({ error: 'E2B not configured - sandbox ID not found' }, { status: 400 })
      }

      const e2bClient = new E2BClient(e2bApiKey)
      const sandbox = await e2bClient.connectToSandbox(sandboxId)
      
      if (!sandbox) {
        return NextResponse.json({ error: 'E2B sandbox not found or expired' }, { status: 404 })
      }

      const e2bResult = await e2bClient.executeCommand(sandbox, wrappedCommand)
      result = { output: e2bResult.stdout || e2bResult.stderr || '', exitCode: e2bResult.exitCode }

    } else {
      return NextResponse.json({ error: `Unsupported VM provider: ${vmProvider}` }, { status: 400 })
    }

    // Parse the response - Clawdbot typically outputs the response directly
    const rawOutput = result.output || ''
    
    // If no output at all, return helpful debug info
    if (!rawOutput.trim()) {
      console.log('Clawdbot returned empty output. Exit code:', result.exitCode)
      return NextResponse.json({
        success: true,
        response: `Command executed but returned no output. Exit code: ${result.exitCode ?? 'unknown'}. The agent may still be processing or there was an error.`,
        sessionId: chatSessionId,
        exitCode: result.exitCode,
        debug: { rawOutput, vmProvider },
      })
    }
    
    // Remove ANSI escape codes
    let response = rawOutput.replace(/\x1b\[[0-9;]*m/g, '')
    
    // Remove the Clawdbot banner line (starts with 🦞)
    const lines = response.split('\n')
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim()
      // Skip banner lines
      if (trimmed.startsWith('🦞')) return false
      if (trimmed.includes('Clawdbot 20')) return false
      return true
    })
    
    // Find where the actual response starts (after any empty lines at start)
    let startIndex = 0
    while (startIndex < filteredLines.length && filteredLines[startIndex].trim() === '') {
      startIndex++
    }
    
    response = filteredLines.slice(startIndex).join('\n').trim()
    
    // If filtering removed everything, return the raw output instead
    if (!response && rawOutput.trim()) {
      response = rawOutput.trim()
    }

    return NextResponse.json({
      success: true,
      response,
      sessionId: chatSessionId,
      exitCode: result.exitCode,
    })

  } catch (error) {
    console.error('Clawdbot chat error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}
