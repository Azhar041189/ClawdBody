import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get setup state to find computer ID
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.orgoComputerId) {
      return NextResponse.json({ error: 'No computer to delete' }, { status: 404 })
    }

    // Get Orgo API key from environment
    const orgoApiKey = process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
    }

    const orgoClient = new OrgoClient(orgoApiKey)

    // Try to delete the computer from Orgo (may fail if already deleted)
    try {
      await orgoClient.deleteComputer(setupState.orgoComputerId)
      console.log(`Successfully deleted Orgo computer: ${setupState.orgoComputerId}`)
    } catch (error: any) {
      // Computer might already be deleted (404), or there was another error
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // If it's a 404, the computer is already deleted - this is fine
      if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('Computer not found')) {
        console.log(`Computer ${setupState.orgoComputerId} already deleted from Orgo (404), continuing with state reset`)
      } else {
        // Other errors (timeout, network, etc.) - log but still reset state
        console.warn(`Error deleting computer from Orgo (will still reset state):`, errorMessage)
      }
      // Continue with state reset regardless - the computer is gone from our perspective
    }

    // Reset setup state to initial state (but keep API key for convenience)
    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: {
        status: 'pending',
        orgoProjectId: null,
        orgoComputerId: null,
        orgoComputerUrl: null,
        vmStatus: null,
        vmCreated: false,
        repoCreated: false,
        repoCloned: false,
        gitSyncConfigured: false,
        errorMessage: null,
      },
    })

    return NextResponse.json({ 
      success: true,
      message: 'Computer deleted successfully'
    })

  } catch (error) {
    console.error('Delete computer error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete computer' },
      { status: 500 }
    )
  }
}

