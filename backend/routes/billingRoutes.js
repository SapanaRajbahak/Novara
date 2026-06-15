// routes/billingRoutes.js
// Billing endpoints for Stripe Checkout (subscription + coins)

const express = require('express');
const router = express.Router();
const stripe = require('../config/stripe');
const { requireAuth } = require('../middleware/auth');
const APP_URL = (process.env.APP_URL || 'https://novara-6s67.onrender.com').replace(/\/+$/, '');

// Map plan to Stripe price IDs (from env)
const PLAN_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
  yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY,
};

// Map coin packs to Stripe price IDs and coin amounts
const COIN_PACKS = {
  coins_500:  { priceId: process.env.STRIPE_PRICE_COINS_500,  coins: 500 },
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
    res.json({ url: session.url });
  } catch (err) {
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
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});

module.exports = router;
