const { sendContactEmail } = require("../utils/contactEmail");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_CATEGORIES = new Set([
  "general",
  "account",
  "billing",
  "author",
  "copyright",
  "business",
]);

async function submitContact(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const subject = String(req.body.subject || "").trim();
    const message = String(req.body.message || "").trim();
    const category = String(req.body.category || "general").trim().toLowerCase();

    if (!name || name.length < 2) {
      return res.status(400).json({ success: false, error: "Please enter your name." });
    }

    if (!email || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ success: false, error: "Please enter a valid email address." });
    }

    if (!subject || subject.length < 3) {
      return res.status(400).json({ success: false, error: "Please enter a subject." });
    }

    if (!message || message.length < 10) {
      return res.status(400).json({ success: false, error: "Please enter a message of at least 10 characters." });
    }

    if (message.length > 5000) {
      return res.status(400).json({ success: false, error: "Message is too long." });
    }

    const normalizedCategory = ALLOWED_CATEGORIES.has(category) ? category : "general";

    await sendContactEmail({
      name,
      email,
      subject,
      message,
      category: normalizedCategory,
    });

    return res.json({
      success: true,
      message: "Your message has been received.",
    });
  } catch (error) {
    console.error("submitContact error:", error.message || error);
    return res.status(500).json({
      success: false,
      error: "Unable to send your message right now. Please email support@readnovara.ca.",
    });
  }
}

module.exports = { submitContact };
