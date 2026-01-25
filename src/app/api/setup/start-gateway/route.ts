import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'
import { VMSetup } from '@/lib/vm-setup'

export async function POST(request: NextRequest) {
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

    if (!setupState.telegramConfigured) {
      return NextResponse.json({ error: 'Telegram is not configured. Please configure Telegram first.' }, { status: 400 })
    }

    const orgoApiKey = process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
    }

    const claudeApiKey = setupState.claudeApiKey
    if (!claudeApiKey) {
      return NextResponse.json({ error: 'Claude API key not found' }, { status: 400 })
    }

    // Get Telegram token from config file on VM
    const orgoClient = new OrgoClient(orgoApiKey)
    const tokenResult = await orgoClient.bash(
      setupState.orgoComputerId,
      "grep -o '\"botToken\": \"[^\"]*\"' ~/.clawdbot/clawdbot.json | cut -d'\"' -f4 || echo ''"
    )

    const telegramBotToken = tokenResult.output.trim()
    if (!telegramBotToken) {
      return NextResponse.json({ error: 'Telegram bot token not found in config' }, { status: 400 })
    }

    const vmSetup = new VMSetup(orgoClient, setupState.orgoComputerId)

    // Kill any existing gateway process first
    await orgoClient.bash(
      setupState.orgoComputerId,
      "pkill -f 'clawdbot gateway' || true"
    )

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Start the gateway
    const gatewaySuccess = await vmSetup.startClawdbotGateway(claudeApiKey, telegramBotToken)

    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: { gatewayStarted: gatewaySuccess },
    })

    return NextResponse.json({
      success: gatewaySuccess,
      message: gatewaySuccess 
        ? 'Gateway started successfully' 
        : 'Gateway may still be starting. Check logs for details.',
    })

  } catch (error) {
    console.error('Start gateway error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start gateway' },
      { status: 500 }
    )
  }
}
