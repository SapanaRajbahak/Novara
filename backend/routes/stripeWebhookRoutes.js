
const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { prisma } = require('../config/db');
const { getSignupBonusForPlan, normalizePlan } = require('../services/subscriptionBenefitsService');
require('dotenv').config();

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // Stripe signature verification
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log event type and session id
  const data = event.data.object;
  const sessionId = data.id || data.object || 'unknown';
  console.log(`[Stripe Webhook] Event: ${event.type} | Session: ${sessionId}`);

  // Defensive: Helper to check for duplicate processing
  async function isSessionProcessed(sessionId) {
    try {
      const tx = await prisma.walletTransaction.findUnique({
        where: { stripeSessionId: sessionId },
      });
      return !!tx;
    } catch (err) {
      console.error('[Stripe Webhook] Error checking session processed:', err);
      return false;
    }
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const meta = data.metadata || {};
      const { purchaseType, userId, plan, coins } = meta;

      console.log('[Stripe Webhook] checkout.session.completed metadata:', meta);

      if (!userId) {
        console.error('[Stripe Webhook] Missing userId in metadata');
        return res.status(400).send('Missing userId');
      }

      if (!purchaseType) {
        console.error('[Stripe Webhook] Missing purchaseType in metadata');
        return res.status(400).send('Missing purchaseType');
      }

      if (purchaseType === 'coins') {
        if (await isSessionProcessed(data.id)) {
          console.log('[Stripe Webhook] Session already processed:', data.id);
          return res.status(200).send('Already processed');
        }

        const coinAmount = parseInt(coins, 10);
        if (Number.isNaN(coinAmount) || coinAmount <= 0) {
          console.error('[Stripe Webhook] Invalid coins value:', coins);
          return res.status(400).send('Invalid coins metadata');
        }

        try {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: userId },
              data: { coins: { increment: coinAmount } },
            }),
            prisma.walletTransaction.create({
              data: {
                userId,
                type: 'PURCHASE',
                coins: coinAmount,
                source: 'STRIPE',
                stripeSessionId: data.id,
              },
            }),
          ]);
          console.log(`[Stripe Webhook] Added ${coinAmount} coins to user ${userId}`);
        } catch (dbErr) {
          console.error('[Stripe Webhook] Prisma error during coin purchase:', dbErr);
          return res.status(500).send('Database error during coin purchase');
        }
      }

      if (purchaseType === 'subscription') {
        try {
          const normalizedPlan = normalizePlan(plan);
          const signupBonusCoins = getSignupBonusForPlan(normalizedPlan);
          const bonusReferenceId = `subscription_signup_bonus:${normalizedPlan || 'unknown'}:${data.id}`;
          const subscription = data.subscription
            ? await stripe.subscriptions.retrieve(data.subscription)
            : null;

          await prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: userId },
              data: {
                isSubscribed: true,
                subscriptionPlan: normalizedPlan || plan,
                subscriptionStatus: 'active',
                stripeCustomerId: data.customer || null,
                subscriptionCurrentPeriodEnd: subscription
                  ? new Date(subscription.current_period_end * 1000)
                  : null,
              },
            });

            if (signupBonusCoins > 0) {
              const existingBonus = await tx.walletTransaction.findFirst({
                where: {
                  userId,
                  type: 'SUBSCRIPTION_SIGNUP_BONUS',
                  referenceId: bonusReferenceId,
                },
                select: { id: true },
              });

              if (!existingBonus) {
                await tx.user.update({
                  where: { id: userId },
                  data: { coins: { increment: signupBonusCoins } },
                });

                await tx.walletTransaction.create({
                  data: {
                    userId,
                    type: 'SUBSCRIPTION_SIGNUP_BONUS',
                    amount: signupBonusCoins,
                    coins: signupBonusCoins,
                    source: 'STRIPE',
                    description: `${normalizedPlan || plan} plan signup bonus`,
                    referenceId: bonusReferenceId,
                  },
                });
              }
            }
          });

          console.log(`[Stripe Webhook] Activated subscription for user ${userId}`);
        } catch (dbErr) {
          console.error('[Stripe Webhook] Prisma error during subscription:', dbErr);
          return res.status(500).send('Database error during subscription');
        }
      }
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const sub = data;
      try {
        await prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer },
          data: {
            subscriptionStatus: sub.status,
            subscriptionCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
            isSubscribed: sub.status === 'active' || sub.status === 'trialing',
          },
        });
        console.log(`[Stripe Webhook] Subscription synced for customer ${sub.customer}`);
      } catch (dbErr) {
        console.error('[Stripe Webhook] Prisma error during subscription sync:', dbErr);
        return res.status(500).send('Database error during subscription sync');
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = data;
      try {
        await prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer },
          data: {
            isSubscribed: false,
            subscriptionStatus: 'canceled',
            subscriptionPlan: null,
            subscriptionCurrentPeriodEnd: null,
          },
        });
        console.log(`[Stripe Webhook] Subscription canceled for customer ${sub.customer}`);
      } catch (dbErr) {
        console.error('[Stripe Webhook] Prisma error during subscription cancel:', dbErr);
        return res.status(500).send('Database error during subscription cancel');
      }
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('[Stripe Webhook] Handler error:', err);
    return res.status(500).send('Webhook handler failed');
  }
});

module.exports = router;
