import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      return new NextResponse('User not found', { status: 404 })
    }

    if (!user.stripeSubscriptionId) {
      return NextResponse.json({ 
        isCancelling: false,
        periodEndDate: null,
      })
    }

    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)

    // Check if subscription is scheduled for cancellation
    const isCancelling = subscription.cancel_at_period_end || false
    const periodEndDate = subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null

    return NextResponse.json({ 
      isCancelling,
      periodEndDate,
    })
  } catch (error: any) {
    console.error('Subscription Status Error:', error)
    return new NextResponse(
      error.message || 'Internal Server Error',
      { status: 500 }
    )
  }
}
