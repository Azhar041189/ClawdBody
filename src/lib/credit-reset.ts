import { prisma } from '@/lib/prisma'
import { getOpenRouterKeyInfo, updateOpenRouterKeyLimit } from '@/lib/openrouter-provisioning'

const MONTHLY_ALLOWANCE_USD = 15

/**
 * Reset monthly credits for one user: set OpenRouter limit to current usage + $15.
 * Top-up balance carries over (we add usage + 15 + remaining top-up to set the cap).
 */
export async function resetMonthlyCredits(userId: string): Promise<void> {
  const llmCredit = await prisma.llmCredit.findUnique({
    where: { userId },
  })
  if (!llmCredit) return

  const keyInfo = await getOpenRouterKeyInfo(llmCredit.openRouterKeyHash)
  const currentUsageUsd = keyInfo.usage ?? 0
  // New limit = current usage + $15 allowance + any remaining headroom (carries over top-up)
  const limitRemainingUsd = keyInfo.limit_remaining ?? 0
  const newLimitUsd = currentUsageUsd + MONTHLY_ALLOWANCE_USD + Math.max(0, limitRemainingUsd)

  await updateOpenRouterKeyLimit(llmCredit.openRouterKeyHash, newLimitUsd)

  const periodStart = new Date()
  const periodEnd = new Date(periodStart)
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1)

  await prisma.llmCredit.update({
    where: { userId },
    data: {
      currentLimitCents: Math.round(newLimitUsd * 100),
      periodStart,
      periodEnd,
      status: 'active',
      lastUsageCheckAt: new Date(),
    },
  })

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'monthly_reset',
      amountCents: MONTHLY_ALLOWANCE_USD * 100,
      description: 'Monthly $15 allowance reset',
    },
  })
}

/**
 * Reset all users whose periodEnd has passed.
 */
export async function resetAllMonthlyCredits(): Promise<number> {
  const now = new Date()
  const due = await prisma.llmCredit.findMany({
    where: { periodEnd: { lte: now } },
  })
  for (const c of due) {
    try {
      await resetMonthlyCredits(c.userId)
    } catch (err) {
      console.error(`[credit-reset] resetMonthlyCredits failed for ${c.userId}:`, err)
    }
  }
  return due.length
}
