import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAllTemplates, type Template } from '@/lib/templates'

/**
 * GET /api/templates - List all available templates
 * 
 * Returns both built-in templates (from code) and user-uploaded templates (from DB)
 * Supports pagination for "show more" functionality
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')
    const category = searchParams.get('category') || undefined

    // Get built-in templates
    let templates = getAllTemplates()
    
    // Filter by category if specified
    if (category) {
      templates = templates.filter(t => t.category === category)
    }
    
    // TODO: Merge with user-uploaded templates from database
    // This will be implemented when we enable user uploads
    // const dbTemplates = await prisma.marketplaceTemplate.findMany({
    //   where: { isPublic: true, isVerified: true, category: category || undefined },
    //   orderBy: { deployCount: 'desc' },
    // })
    // templates = [...templates, ...convertDbTemplates(dbTemplates)]
    
    // Get total count before pagination
    const total = templates.length
    
    // Apply pagination
    const paginatedTemplates = templates.slice(offset, offset + limit)
    
    // Return templates with pagination info
    return NextResponse.json({
      templates: paginatedTemplates,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    })
  } catch (error) {
    console.error('[Templates] Error listing templates:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list templates' },
      { status: 500 }
    )
  }
}
