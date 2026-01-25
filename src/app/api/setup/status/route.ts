import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState) {
      return NextResponse.json({
        status: 'pending',
        vmCreated: false,
        repoCreated: false,
        repoCloned: false,
        gitSyncConfigured: false,
        clawdbotInstalled: false,
        telegramConfigured: false,
        gatewayStarted: false,
      })
    }

    // Don't verify computer existence on every status check - this is too aggressive
    // The screenshot endpoint will handle 404s appropriately
    // Only trust the database state - if the computer was deleted, the screenshot endpoint
    // will fail consistently and the frontend can handle that gracefully
    // This prevents false resets due to transient API issues or rate limiting
    // 
    // If you need to verify computer existence, do it explicitly via a separate endpoint
    // or only when the screenshot endpoint consistently fails with 404

    return NextResponse.json({
      status: setupState.status,
      vmCreated: setupState.vmCreated,
      repoCreated: setupState.repoCreated,
      repoCloned: setupState.repoCloned,
      gitSyncConfigured: setupState.gitSyncConfigured,
      clawdbotInstalled: setupState.clawdbotInstalled,
      telegramConfigured: setupState.telegramConfigured,
      gatewayStarted: setupState.gatewayStarted,
      orgoComputerId: setupState.orgoComputerId,
      orgoComputerUrl: setupState.orgoComputerUrl,
      vaultRepoUrl: setupState.vaultRepoUrl,
      errorMessage: setupState.errorMessage,
    })

  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    )
  }
}


