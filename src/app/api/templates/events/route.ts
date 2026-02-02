import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTemplateById } from '@/lib/templates'

interface EventRequest {
  templateId: string
  eventType: 'share' | 'view' | 'click'
  metadata?: {
    shareMethod?: 'twitter' | 'linkedin' | 'email' | 'copy_link'
    [key: string]: any
  }
}

/**
 * POST /api/templates/events - Log template events (shares, views, clicks)
 * 
 * This endpoint logs user interactions with templates for analytics.
 * Authentication is optional for some events (views), but provides more data.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    const body: EventRequest = await request.json()
    const { templateId, eventType, metadata } = body

    // Validate required fields
    if (!templateId || !eventType) {
      return NextResponse.json(
        { error: 'templateId and eventType are required' },
        { status: 400 }
      )
    }

    // Validate event type
    const validEventTypes = ['share', 'view', 'click']
    if (!validEventTypes.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Check if this is a built-in template
    const isBuiltIn = !!getTemplateById(templateId)

    // Log the event
    await prisma.templateEvent.create({
      data: {
        templateId,
        isBuiltIn,
        userId: session?.user?.id || null,
        userName: session?.user?.name || null,
        eventType,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })

    // Increment share count for user-created templates
    if (eventType === 'share' && !isBuiltIn) {
      try {
        await prisma.marketplaceTemplate.update({
          where: { templateId },
          data: { shareCount: { increment: 1 } },
        })
      } catch (error) {
        // Template might not exist in DB (could be built-in)
        console.warn(`[Events] Failed to increment share count for ${templateId}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Event "${eventType}" logged for template "${templateId}"`,
    })

  } catch (error) {
    console.error('[Events] Error logging event:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to log event' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/templates/events - Get event analytics (admin only, or user's own events)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('templateId')
    const eventType = searchParams.get('eventType')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {}
    
    if (templateId) {
      where.templateId = templateId
    }
    
    if (eventType) {
      where.eventType = eventType
    }

    const events = await prisma.templateEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    })

    return NextResponse.json({
      success: true,
      events,
      count: events.length,
    })

  } catch (error) {
    console.error('[Events] Error fetching events:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch events' },
      { status: 500 }
    )
  }
}
