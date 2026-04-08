// routes/stripeWebhookRoutes.js
// Stripe webhook endpoint for Novara

const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const prisma = require('../config/prisma');
const dotenv = require('dotenv');
dotenv.config();

// Use express.raw for this route in server.js
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Helper: Prevent duplicate processing
  async function isSessionProcessed(sessionId) {
    const tx = await prisma.walletTransaction.findUnique({ where: { stripeSessionId: sessionId } });
    return !!tx;
  }

  // Handle events
  const data = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const { purchaseType, userId, plan, pack, coins } = data.metadata || {};
    if (!userId) return res.status(400).send('Missing userId');
    if (await isSessionProcessed(data.id)) return res.status(200).send('Already processed');

    if (purchaseType === 'coins') {
      // Add coins to user, create WalletTransaction
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { coins: { increment: parseInt(coins, 10) } },
        }),
        prisma.walletTransaction.create({
          data: {
            userId,
            type: 'PURCHASE',
            coins: parseInt(coins, 10),
            source: 'STRIPE',
            stripeSessionId: data.id,
          },
        }),
      ]);
    } else if (purchaseType === 'subscription') {
      // Mark user as subscribed
      await prisma.user.update({
        where: { id: userId },
        data: {
          isSubscribed: true,
          subscriptionPlan: plan,
          subscriptionStatus: 'active',
          stripeCustomerId: data.customer,
          subscriptionCurrentPeriodEnd: new Date(data.subscription ? (await stripe.subscriptions.retrieve(data.subscription)).current_period_end * 1000 : Date.now()),
        },
      });
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = data;
    await prisma.user.updateMany({
      where: { stripeCustomerId: sub.customer },
      data: {
        subscriptionStatus: sub.status,
        subscriptionCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
        isSubscribed: sub.status === 'active',
      },
    });
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = data;
    await prisma.user.updateMany({
      where: { stripeCustomerId: sub.customer },
      data: {
        isSubscribed: false,
        subscriptionStatus: 'canceled',
      },
    });
  }

  res.status(200).send('ok');
});

module.exports = router;
