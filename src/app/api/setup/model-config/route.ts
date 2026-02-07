import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'
import { detectProvider, getProviderById, getAmbiguousProviders, getSupportedProvidersText, getKeyFormatsHelp, LLM_PROVIDERS } from '@/lib/llm-providers'
import { OrgoClient } from '@/lib/orgo'
import { VMSetup } from '@/lib/vm-setup'

/**
 * GET /api/setup/model-config
 * Get current model configuration and API key status
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { 
        llmApiKey: true, 
        llmProvider: true,
        llmModel: true,
      },
    })

    let maskedKey: string | undefined
    let provider: string | undefined
    let model: string | undefined

    if (setupState?.llmApiKey) {
      try {
        const decryptedKey = decrypt(setupState.llmApiKey)
        maskedKey = decryptedKey.length > 16
          ? `${decryptedKey.slice(0, 12)}...${decryptedKey.slice(-4)}`
          : '***'
        provider = setupState.llmProvider || undefined
        model = setupState.llmModel || undefined
      } catch {}
    }

    return NextResponse.json({
      hasApiKey: !!maskedKey,
      maskedKey,
      provider,
      model,
      supportedProviders: getSupportedProvidersText(),
      keyFormats: getKeyFormatsHelp(),
    })

  } catch (error) {
    console.error('Failed to get model config:', error)
    return NextResponse.json(
      { error: 'Failed to get model configuration' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/setup/model-config
 * Update API key (provider is auto-detected, or can be manually specified for ambiguous keys)
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
    const { apiKey, model, providerId } = body as {
      apiKey?: string
      model?: string
      providerId?: string  // Optional: for manually selecting provider when key is ambiguous
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    const trimmedKey = apiKey.trim()

    // Check if key is ambiguous (e.g., sk- could be OpenAI or Moonshot)
    const ambiguousProviders = getAmbiguousProviders(trimmedKey)
    
    let finalProvider
    
    if (ambiguousProviders.length > 0 && !providerId) {
      // Key is ambiguous and user hasn't selected a provider
      return NextResponse.json({
        ambiguous: true,
        message: 'This API key could belong to multiple providers. Please select one:',
        providers: ambiguousProviders.map(p => ({
          id: p.id,
          name: p.name,
          defaultModel: p.defaultModel,
        })),
      }, { status: 200 })  // 200 because it's not an error, just needs more info
    }
    
    if (providerId) {
      // User manually selected a provider
      finalProvider = getProviderById(providerId)
      if (!finalProvider) {
        return NextResponse.json({
          error: `Invalid provider: ${providerId}`,
          supportedProviders: getSupportedProvidersText(),
        }, { status: 400 })
      }
    } else {
      // Auto-detect provider from API key
      finalProvider = detectProvider(trimmedKey)
    }

    if (!finalProvider) {
      return NextResponse.json({
        error: 'Could not detect provider from API key',
        help: 'Supported API key formats:',
        keyFormats: getKeyFormatsHelp(),
        supportedProviders: getSupportedProvidersText(),
      }, { status: 400 })
    }

    // Use provided model or default for the provider
    const finalModel = model || finalProvider.defaultModel

    const updateData = {
      llmApiKey: encrypt(trimmedKey),
      llmProvider: finalProvider.id,
      llmModel: finalModel,
      isManagedLlmApiKey: false, // User-provided keys are not managed
    }

    // Get current setup state to check for VM
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { 
        orgoApiKey: true, 
        orgoComputerId: true, 
        vmProvider: true,
      },
    })

    await prisma.setupState.upsert({
      where: { userId: session.user.id },
      update: updateData,
      create: {
        userId: session.user.id,
        ...updateData,
        status: 'pending',
      },
    })

    // Also sync the API key to the VM's .bashrc (for Orgo VMs)
    // This is done async and non-blocking so the API response is fast
    if (setupState?.vmProvider === 'orgo' && setupState.orgoApiKey && setupState.orgoComputerId) {
      const syncToVM = async () => {
        try {
          const orgoApiKey = decrypt(setupState.orgoApiKey!)
          const orgoClient = new OrgoClient(orgoApiKey)
          const vmSetup = new VMSetup(orgoClient, setupState.orgoComputerId!)
          await vmSetup.storeApiKey(trimmedKey, finalProvider.id)
          console.log(`[model-config] Synced API key to VM ${setupState.orgoComputerId}`)
        } catch (err) {
          console.error('[model-config] Failed to sync API key to VM:', err)
        }
      }
      // Don't await - sync happens in background
      syncToVM()
    }

    // Mask the key for response
    const maskedKey = trimmedKey.length > 16
      ? `${trimmedKey.slice(0, 12)}...${trimmedKey.slice(-4)}`
      : '***'

    return NextResponse.json({
      success: true,
      provider: finalProvider.id,
      providerName: finalProvider.name,
      model: finalModel,
      maskedKey,
      vmSyncInitiated: !!(setupState?.vmProvider === 'orgo' && setupState.orgoComputerId),
    })

  } catch (error) {
    console.error('Failed to update model config:', error)
    return NextResponse.json(
      { error: 'Failed to update model configuration' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/setup/model-config
 * Remove the API key
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
    console.error('Failed to delete API key:', error)
    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}
