(function initContactForm(global) {
  const form = global.document.getElementById("contactForm");
  const messageEl = global.document.getElementById("contactFormMessage");
  if (!form || !messageEl) return;

  const session = global.NovaraSession;
  const apiBase = session && typeof session.resolveApiBaseUrl === "function"
    ? session.resolveApiBaseUrl()
    : (global.location && global.location.origin) || "";

  function setMessage(text, type) {
    messageEl.textContent = text || "";
    messageEl.classList.remove("success", "error");
    if (type) messageEl.classList.add(type);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      subject: String(formData.get("subject") || "").trim(),
      message: String(formData.get("message") || "").trim(),
      category: String(formData.get("category") || "general").trim(),
    };

    try {
      const response = await fetch(`${apiBase}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to send your message. Please try again.");
      }

      form.reset();
      setMessage("Thank you. Your message has been sent. We typically respond within 1–2 business days.", "success");
    } catch (error) {
      setMessage(error.message || "Something went wrong. Please email support@readnovara.ca directly.", "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
})(window);
