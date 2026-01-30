import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/chat/clawdbot/messages - Load chat messages for a session
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vmId = searchParams.get('vmId')
    const sessionId = searchParams.get('sessionId')

    // Build the where clause
    const where: any = {
      userId: session.user.id,
    }

    if (vmId) {
      where.vmId = vmId
    }

    if (sessionId) {
      where.sessionId = sessionId
    }

    // Get messages ordered by creation time
    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100, // Limit to last 100 messages
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Failed to load chat messages:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load messages' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/chat/clawdbot/messages - Save a chat message
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { vmId, sessionId, role, content } = await request.json()

    if (!sessionId || !role || !content) {
      return NextResponse.json(
        { error: 'sessionId, role, and content are required' },
        { status: 400 }
      )
    }

    // Validate role
    if (!['user', 'assistant', 'error'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // If vmId is provided, verify it belongs to the user
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })
      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }
    }

    // Create the message
    const message = await prisma.chatMessage.create({
      data: {
        userId: session.user.id,
        vmId: vmId || null,
        sessionId,
        role,
        content,
      },
    })

    return NextResponse.json({ success: true, message })
  } catch (error) {
    console.error('Failed to save chat message:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save message' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/chat/clawdbot/messages - Delete chat messages
 * Can delete by vmId, sessionId, or specific message id
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const vmId = searchParams.get('vmId')
    const sessionId = searchParams.get('sessionId')
    const messageId = searchParams.get('messageId')

    // Build the where clause - always filter by userId for security
    const where: any = {
      userId: session.user.id,
    }

    if (messageId) {
      // Delete specific message
      where.id = messageId
    } else if (vmId) {
      // Delete all messages for a VM
      where.vmId = vmId
    } else if (sessionId) {
      // Delete all messages for a session
      where.sessionId = sessionId
    } else {
      return NextResponse.json(
        { error: 'Provide vmId, sessionId, or messageId to delete' },
        { status: 400 }
      )
    }

    const result = await prisma.chatMessage.deleteMany({ where })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    })
  } catch (error) {
    console.error('Failed to delete chat messages:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete messages' },
      { status: 500 }
    )
  }
}
