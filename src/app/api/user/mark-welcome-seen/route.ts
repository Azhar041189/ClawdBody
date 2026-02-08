import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/user/mark-welcome-seen
 * Marks that the user has seen the welcome page
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Mark user as having seen the welcome page
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        hasSeenWelcomePage: true,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error marking welcome page as seen:', error)
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
