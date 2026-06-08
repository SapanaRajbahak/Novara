// backend/utils/email.js
const fetch = require('node-fetch');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const APP_URL = process.env.APP_URL;

async function sendVerificationEmail(email, token) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.log('[Email] Resend not configured — skipping verification email for:', email);
    return;
  }
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;
  const html = `
    <div style="font-family:Manrope,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:12px;border:1px solid #eee">
      <h2 style="color:#2d2d2d">Verify your email for Novara</h2>
      <p style="color:#444">Click the button below to verify your email and activate your account.</p>
      <a href="${verifyUrl}" style="display:inline-block;margin:24px 0;padding:12px 32px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Verify Email</a>
      <p style="color:#444">Or copy and paste this link in your browser:<br><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p style="color:#888;font-size:14px">This link will expire in 1 hour. If you did not sign up, you can ignore this email.</p>
    </div>
  `;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: 'Verify your Novara account',
      html,
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }
}

module.exports = { sendVerificationEmail };
