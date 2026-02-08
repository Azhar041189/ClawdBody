import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/user/first-time
 * Checks if the current user is a first-time free user (not Pro and has no VMs)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is Pro or has seen welcome page
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        isPro: true,
        hasSeenWelcomePage: true,
      },
    })

    if (user?.isPro || user?.hasSeenWelcomePage) {
      return NextResponse.json({ isFirstTimeFree: false })
    }

    // First-time free user = not Pro AND hasn't seen welcome page
    const isFirstTimeFree = true

    return NextResponse.json({ isFirstTimeFree })
  } catch (error: any) {
    console.error('Error checking first-time status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
