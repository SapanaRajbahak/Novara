// config/stripe.js
// Stripe configuration for Novara backend
// Initializes Stripe using STRIPE_SECRET_KEY from .env

const Stripe = require('stripe');
const dotenv = require('dotenv');
dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in .env');
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

module.exports = stripe;
