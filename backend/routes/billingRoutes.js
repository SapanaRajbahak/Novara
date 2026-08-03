// routes/billingRoutes.js
// Billing endpoints for Stripe Checkout (subscription + coins)

const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { requireAuth } = require('../middleware/auth');
const APP_URL = (process.env.APP_URL || 'https://novara-6s67.onrender.com').replace(/\/+$/, '');
const STRIPE_DEBUG_ENABLED = process.env.STRIPE_DEBUG === '1';

function logStripeCheckoutError(context, err) {
  console.error(`[Billing] ${context} failed`, {
    type: err?.type,
    code: err?.code,
    message: err?.message,
    requestId: err?.requestId,
    statusCode: err?.statusCode,
    rawType: err?.rawType,
    declineCode: err?.declineCode,
  });
}

async function logStripeCheckoutDebug(context, priceId) {
  if (!STRIPE_DEBUG_ENABLED) {
    return;
  }

  const keyMode = stripe.__novara?.keyMode || 'unknown';
  const keySource = stripe.__novara?.keySource || 'unknown';

  try {
    const price = await stripe.prices.retrieve(priceId);
    console.log(`[Billing Debug] ${context}`, {
      keyMode: keyMode.toUpperCase(),
      keySource,
      priceId,
      priceLiveMode: price.livemode ? 'LIVE' : 'TEST',
    });
  } catch (error) {
    console.log(`[Billing Debug] ${context} price lookup failed`, {
      keyMode: keyMode.toUpperCase(),
      keySource,
      priceId,
      errorType: error?.type,
      errorCode: error?.code,
      errorMessage: error?.message,
    });
  }
}

// Map plan to Stripe price IDs (from env)
const PLAN_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
  yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY,
};

const COIN_PRICE_500 = process.env.STRIPE_COIN_PRICE_ID || process.env.STRIPE_PRICE_COINS_500;

if (
  process.env.STRIPE_COIN_PRICE_ID
  && process.env.STRIPE_PRICE_COINS_500
  && process.env.STRIPE_COIN_PRICE_ID !== process.env.STRIPE_PRICE_COINS_500
) {
  console.warn('[Billing] STRIPE_COIN_PRICE_ID differs from STRIPE_PRICE_COINS_500; checkout will use STRIPE_COIN_PRICE_ID for coins_500');
}

// Map coin packs to Stripe price IDs and coin amounts
const COIN_PACKS = {
  coins_500:  { priceId: COIN_PRICE_500,  coins: 500 },
  coins_1200: { priceId: process.env.STRIPE_PRICE_COINS_1200, coins: 1200 },
  coins_2600: { priceId: process.env.STRIPE_PRICE_COINS_2600, coins: 2600 },
};

// POST /api/billing/create-subscription-checkout
router.post('/create-subscription-checkout', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const user = req.session.user;
  if (!PLAN_PRICE_IDS[plan]) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  try {
    await logStripeCheckoutDebug('create-subscription-checkout', PLAN_PRICE_IDS[plan]);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PLAN_PRICE_IDS[plan], quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        purchaseType: 'subscription',
        plan,
      },
      success_url: `${APP_URL}/reader/reader-monetization.html?checkout=success`,
      cancel_url: `${APP_URL}/reader/reader-monetization.html?checkout=cancel`,
    });
    if (STRIPE_DEBUG_ENABLED) {
      console.log('[Billing Debug] create-subscription-checkout session mode:', session.livemode ? 'LIVE' : 'TEST');
    }
    res.json({ url: session.url });
  } catch (err) {
    logStripeCheckoutError('create-subscription-checkout', err);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

// POST /api/billing/create-coin-checkout
router.post('/create-coin-checkout', requireAuth, async (req, res) => {
  const { pack } = req.body;
  const user = req.session.user;
  const packInfo = COIN_PACKS[pack];
  if (!packInfo) {
    return res.status(400).json({ error: 'Invalid coin pack' });
  }
  try {
    await logStripeCheckoutDebug('create-coin-checkout', packInfo.priceId);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: packInfo.priceId, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        purchaseType: 'coins',
        pack,
        coins: packInfo.coins,
      },
      success_url: `${APP_URL}/reader/reader-monetization.html?checkout=success`,
      cancel_url: `${APP_URL}/reader/reader-monetization.html?checkout=cancel`,
    });
    if (STRIPE_DEBUG_ENABLED) {
      console.log('[Billing Debug] create-coin-checkout session mode:', session.livemode ? 'LIVE' : 'TEST');
    }
    res.json({ url: session.url });
  } catch (err) {
    logStripeCheckoutError('create-coin-checkout', err);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

module.exports = router;
