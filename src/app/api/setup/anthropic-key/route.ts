import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'

/**
 * GET /api/setup/anthropic-key
 * Check if user has a stored LLM API key and return masked version
 * (Legacy endpoint - kept for backward compatibility, uses unified llmApiKey)
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { llmApiKey: true, llmProvider: true },
    })

    if (!setupState?.llmApiKey) {
      return NextResponse.json({
        hasKey: false,
        maskedKey: null,
      })
    }

    // Decrypt and mask the key for display
    try {
      const decryptedKey = decrypt(setupState.llmApiKey)
      // Mask the key: show first 12 chars and last 4 chars
      const maskedKey = decryptedKey.length > 16
        ? `${decryptedKey.slice(0, 12)}...${decryptedKey.slice(-4)}`
        : '***'

      return NextResponse.json({
        hasKey: true,
        maskedKey,
        provider: setupState.llmProvider,
      })
    } catch (decryptError) {
      // Key exists but couldn't be decrypted - treat as no key
      return NextResponse.json({
        hasKey: false,
        maskedKey: null,
      })
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get API key status' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/setup/anthropic-key
 * Update/set the LLM API key (for Anthropic, auto-detect provider)
 * (Legacy endpoint - kept for backward compatibility)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is Pro and has a managed key - block modification
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPro: true },
    })

    const existingSetupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { isManagedLlmApiKey: true },
    })

    // Block Pro users from modifying managed keys
    if (user?.isPro && existingSetupState?.isManagedLlmApiKey) {
      return NextResponse.json({ 
        error: 'Cannot modify managed API key. This key is provided by ClawdBody as part of your Pro subscription.',
        isManaged: true,
      }, { status: 403 })
    }

    const body = await request.json()
    const apiKey = body.claudeApiKey || body.apiKey

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // Detect provider from key prefix
    let provider = 'anthropic'
    let defaultModel = 'claude-sonnet-4-5'
    
    if (apiKey.startsWith('sk-or-')) {
      provider = 'openrouter'
      defaultModel = 'anthropic/claude-3.5-sonnet'
    } else if (apiKey.startsWith('sk-ant-')) {
      provider = 'anthropic'
      defaultModel = 'claude-sonnet-4-5'
    } else if (apiKey.startsWith('sk-')) {
      provider = 'openai'
      defaultModel = 'gpt-4o'
    }

    // Encrypt and store the key
    const encryptedKey = encrypt(apiKey)

    await prisma.setupState.upsert({
      where: { userId: session.user.id },
      update: { 
        llmApiKey: encryptedKey,
        llmProvider: provider,
        llmModel: defaultModel,
        isManagedLlmApiKey: false, // User-provided keys are not managed
      },
      create: {
        userId: session.user.id,
        llmApiKey: encryptedKey,
        llmProvider: provider,
        llmModel: defaultModel,
        isManagedLlmApiKey: false, // User-provided keys are not managed
        status: 'pending',
      },
    })

    // Mask the key for response
    const maskedKey = apiKey.length > 16
      ? `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}`
      : '***'

    return NextResponse.json({
      success: true,
      maskedKey,
      provider,
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to save API key' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/setup/anthropic-key
 * Remove the stored LLM API key
 * (Legacy endpoint - kept for backward compatibility)
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is Pro and has a managed key - block deletion
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPro: true },
    })

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { isManagedLlmApiKey: true },
    })

    if (!setupState) {
      return NextResponse.json({ success: true }) // Nothing to delete
    }

    // Block Pro users from deleting managed keys
    if (user?.isPro && setupState.isManagedLlmApiKey) {
      return NextResponse.json({ 
        error: 'Cannot delete managed API key. This key is provided by ClawdBody as part of your Pro subscription.',
        isManaged: true,
      }, { status: 403 })
    }

    await prisma.setupState.update({
      where: { userId: session.user.id },
      data: { 
        llmApiKey: null,
        llmProvider: null,
        llmModel: null,
        isManagedLlmApiKey: false, // Reset managed flag when deleting
      },
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}
