import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { session_id } = await req.json()

    if (!session_id) {
      return NextResponse.json({ isPro: false, error: 'No session_id provided' }, { status: 400 })
    }

    // Verify the Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id)

    if (
      checkoutSession.payment_status === 'paid' &&
      checkoutSession.metadata?.userId === session.user.id
    ) {
      // Update user to Pro in the database
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          isPro: true,
          stripeCustomerId: checkoutSession.customer as string,
          stripeSubscriptionId: checkoutSession.subscription as string,
        },
      })

      return NextResponse.json({ isPro: true })
    }

    // Also check if user is already Pro in DB (webhook may have already processed)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.isPro) {
      return NextResponse.json({ isPro: true })
    }

    return NextResponse.json({ isPro: false })
  } catch (error: any) {
    console.error('Verify Session Error:', error)
    return NextResponse.json(
      { isPro: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
