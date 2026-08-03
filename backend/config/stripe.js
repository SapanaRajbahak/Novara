// config/stripe.js
// Stripe configuration for Novara backend
// Initializes Stripe using STRIPE_SECRET_KEY from .env

const Stripe = require('stripe');
const dotenv = require('dotenv');
const dotenvResult = dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in .env');
}

function normalizeStripeMode(value) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized !== 'test' && normalized !== 'live') {
    throw new Error("STRIPE_MODE must be either 'test' or 'live'");
  }

  return normalized;
}

function detectKeyMode(secretKey) {
  if (secretKey.startsWith('sk_live_')) {
    return 'live';
  }

  if (secretKey.startsWith('sk_test_')) {
    return 'test';
  }

  throw new Error('STRIPE_SECRET_KEY must start with sk_test_ or sk_live_');
}

const configuredMode = normalizeStripeMode(process.env.STRIPE_MODE);
const keyMode = detectKeyMode(process.env.STRIPE_SECRET_KEY);
const envFileKey = dotenvResult?.parsed?.STRIPE_SECRET_KEY;

function detectKeySource(runtimeKey, parsedKey) {
  if (!parsedKey) {
    return 'runtime-env-only';
  }

  if (runtimeKey === parsedKey) {
    return 'env-file-or-same-runtime';
  }

  return 'runtime-env-overrode-env-file';
}

const keySource = detectKeySource(process.env.STRIPE_SECRET_KEY, envFileKey);

if (configuredMode && configuredMode !== keyMode) {
  throw new Error(
    `Stripe mode mismatch: STRIPE_MODE=${configuredMode} but STRIPE_SECRET_KEY is a ${keyMode} key`
  );
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

stripe.__novara = {
  keyMode,
  configuredMode: configuredMode || 'unset',
  keySource,
};

if (process.env.STRIPE_DEBUG === '1') {
  console.log('[Stripe Config] runtime key mode:', keyMode.toUpperCase());
  console.log('[Stripe Config] STRIPE_MODE:', configuredMode ? configuredMode.toUpperCase() : 'UNSET');
  console.log('[Stripe Config] key source:', keySource);
}

module.exports = stripe;
