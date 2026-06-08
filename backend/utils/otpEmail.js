const { Resend } = require("resend");

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY_MISSING");
  }
  return new Resend(apiKey);
}

async function sendOtpEmail(email, otpCode) {
  const resend = getResendClient();

  const from = process.env.OTP_EMAIL_FROM || process.env.EMAIL_FROM || "Novara <no-reply@readnovara.ca>";
  const subject = "Your verification code";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.4;color:#111;max-width:560px">
      <h2 style="margin:0 0 12px">Your verification code</h2>
      <p style="margin:0 0 12px">Use the code below to verify your email address.</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:16px 0">${otpCode}</p>
      <p style="margin:0 0 12px">This code expires in 10 minutes.</p>
      <p style="margin:0;color:#666">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  const text = [
    "Your verification code",
    "",
    `Code: ${otpCode}`,
    "This code expires in 10 minutes.",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const result = await resend.emails.send({
    from,
    to: email,
    subject,
    html,
    text,
  });

  if (result && result.error) {
    const message = result.error.message || "Failed to send OTP email.";
    const sendError = new Error(message);
    sendError.code = result.error.name || "RESEND_SEND_ERROR";
    throw sendError;
  }
}

module.exports = {
  sendOtpEmail,
};
