const { Resend } = require("resend");

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendContactEmail({ name, email, subject, message, category }) {
  const resend = getResendClient();
  const to = process.env.CONTACT_EMAIL || "support@readnovara.ca";
  const from = process.env.EMAIL_FROM || "Novara <no-reply@readnovara.ca>";

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const safeCategory = escapeHtml(category);

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:640px">
      <h2 style="margin:0 0 12px">Novara Contact Form</h2>
      <p><strong>Category:</strong> ${safeCategory}</p>
      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> ${safeEmail}</p>
      <p><strong>Subject:</strong> ${safeSubject}</p>
      <hr />
      <p style="white-space:pre-wrap">${safeMessage}</p>
    </div>
  `;

  if (!resend) {
    console.log("[Contact] Resend not configured — logged submission:", {
      name,
      email,
      subject,
      category,
    });
    return { delivered: false, logged: true };
  }

  const result = await resend.emails.send({
    from,
    to,
    replyTo: email,
    subject: `[Novara Contact] ${subject}`,
    html,
    text: `Category: ${category}\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
  });

  if (result && result.error) {
    throw new Error(result.error.message || "Failed to send contact email.");
  }

  return { delivered: true, logged: true };
}

module.exports = { sendContactEmail };
