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

    const { telegramBotToken, telegramUserId } = await request.json()

    if (!telegramBotToken) {
      return NextResponse.json({ error: 'Telegram bot token is required' }, { status: 400 })
    }

    // Get setup state
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.orgoComputerId) {
      return NextResponse.json({ error: 'VM not found. Please complete setup first.' }, { status: 404 })
    }

    if (setupState.status !== 'ready') {
      return NextResponse.json({ error: 'VM setup is not complete yet' }, { status: 400 })
    }

    // Get Orgo API key
    const orgoApiKey = process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      return NextResponse.json({ error: 'Orgo API key not configured on server' }, { status: 500 })
    }

    // Get Claude API key from setup state
    const claudeApiKey = setupState.claudeApiKey
    if (!claudeApiKey) {
      return NextResponse.json({ error: 'Claude API key not found' }, { status: 400 })
    }

    // Configure Telegram on the VM
    const orgoClient = new OrgoClient(orgoApiKey)
    const vmSetup = new VMSetup(orgoClient, setupState.orgoComputerId)

    // Get Clawdbot version (check if it's installed)
    if (!setupState.clawdbotInstalled) {
      return NextResponse.json({ error: 'Clawdbot is not installed. Please complete setup first.' }, { status: 400 })
    }

    // Get Clawdbot version from VM
    let clawdbotVersion = '2026.1.22' // Default version
    try {
      const versionResult = await orgoClient.bash(
        setupState.orgoComputerId,
        'cat ~/.nvm/versions/node/*/lib/node_modules/clawdbot/package.json 2>/dev/null | grep -o \'"version": "[^"]*"\' | head -1 | cut -d\'"\' -f4'
      )
      if (versionResult.exit_code === 0 && versionResult.output.trim()) {
        clawdbotVersion = versionResult.output.trim()
      }
    } catch (error) {
      console.warn('Could not get Clawdbot version, using default:', error)
    }

    // Configure Telegram
    const telegramSuccess = await vmSetup.setupClawdbotTelegram({
      claudeApiKey,
      telegramBotToken,
      telegramUserId,
      clawdbotVersion,
      heartbeatIntervalMinutes: 30,
    })

    if (!telegramSuccess) {
      return NextResponse.json({ error: 'Failed to configure Telegram' }, { status: 500 })
    }

    // Update status
    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: { telegramConfigured: true },
    })

    // Start the gateway
    const gatewaySuccess = await vmSetup.startClawdbotGateway(claudeApiKey, telegramBotToken)

    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: { gatewayStarted: gatewaySuccess },
    })

    return NextResponse.json({ 
      success: true,
      telegramConfigured: telegramSuccess,
      gatewayStarted: gatewaySuccess,
      message: gatewaySuccess 
        ? 'Telegram configured and gateway started successfully' 
        : 'Telegram configured but gateway may still be starting'
    })

  } catch (error) {
    console.error('Configure Telegram error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to configure Telegram' },
      { status: 500 }
    )
  }
}
