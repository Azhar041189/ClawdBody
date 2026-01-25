import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.orgoComputerId) {
      return NextResponse.json({ error: 'VM not found' }, { status: 404 })
    }

    const orgoApiKey = process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
    }

    const orgoClient = new OrgoClient(orgoApiKey)

    // Check if process is running
    const processCheck = await orgoClient.bash(
      setupState.orgoComputerId,
      "pgrep -f 'clawdbot gateway' > /dev/null && echo 'RUNNING' || echo 'NOT_RUNNING'"
    )

    const isRunning = processCheck.output.trim().includes('RUNNING')

    // Get process details if running
    let processDetails = null
    if (isRunning) {
      const psResult = await orgoClient.bash(
        setupState.orgoComputerId,
        "ps aux | grep 'clawdbot gateway' | grep -v grep"
      )
      processDetails = psResult.output.trim()
    }

    // Get last 50 lines of log
    const logResult = await orgoClient.bash(
      setupState.orgoComputerId,
      'tail -50 /tmp/clawdbot.log 2>/dev/null || echo "No log file found"'
    )

    // Check if startup script exists
    const scriptCheck = await orgoClient.bash(
      setupState.orgoComputerId,
      'test -f /tmp/start-clawdbot.sh && echo "EXISTS" || echo "NOT_FOUND"'
    )

    // Check port
    const portCheck = await orgoClient.bash(
      setupState.orgoComputerId,
      'netstat -tlnp 2>/dev/null | grep 18789 || ss -tlnp 2>/dev/null | grep 18789 || echo "PORT_NOT_LISTENING"'
    )

    return NextResponse.json({
      isRunning,
      processDetails: processDetails || null,
      log: logResult.output.trim(),
      startupScriptExists: scriptCheck.output.trim().includes('EXISTS'),
      portStatus: portCheck.output.trim(),
      configured: setupState.telegramConfigured || false,
    })

  } catch (error) {
    console.error('Gateway status check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check gateway status' },
      { status: 500 }
    )
  }
}
