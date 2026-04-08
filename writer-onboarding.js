const elements = {
  dashboardSwitcher: document.getElementById("dashboardSwitcher"),
  form: document.getElementById("writerOnboardingForm"),
  penName: document.getElementById("penName"),
  bio: document.getElementById("bio"),
  preferredGenres: document.getElementById("preferredGenres"),
  formMessage: document.getElementById("formMessage"),
  submitBtn: document.getElementById("submitBtn"),
};

function setMessage(message, tone) {
  elements.formMessage.textContent = message;
  elements.formMessage.className = tone ? `message is-${tone}` : "message";
}

function normalizeGenres(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadUserState() {
  const user = window.NovaraSession ? await window.NovaraSession.fetchCurrentUser() : null;

  if (!user) {
    setMessage("Sign in with your reader account to enable writer access.", "error");
    elements.submitBtn.disabled = true;
    return;
  }

  if (user.role === "ADMIN") {
    setMessage("Admin accounts stay separate from writer onboarding.", "error");
    elements.submitBtn.disabled = true;
    return;
  }

  if (window.NovaraSession.canUseWriter(user)) {
    window.NovaraSession.renderDashboardSwitcher(elements.dashboardSwitcher, {
      currentDashboard: "writer",
      readerHref: "reader-dashboard.html",
      writerHref: "writer-dashboard.html",
    });
    window.location.href = "writer-dashboard.html";
    return;
  }

  elements.penName.value = user.writerProfile && user.writerProfile.penName ? user.writerProfile.penName : user.name;
  elements.bio.value = user.writerProfile && user.writerProfile.bio ? user.writerProfile.bio : "";
  elements.preferredGenres.value = user.writerProfile && Array.isArray(user.writerProfile.preferredGenres)
    ? user.writerProfile.preferredGenres.join(", ")
    : "";
}

async function handleSubmit(event) {
  event.preventDefault();

  const payload = {
    penName: elements.penName.value.trim(),
    bio: elements.bio.value.trim(),
    preferredGenres: normalizeGenres(elements.preferredGenres.value),
  };

  if (!payload.penName || !payload.bio || payload.preferredGenres.length === 0) {
    setMessage("Pen name, bio, and at least one preferred genre are required.", "error");
    return;
  }

  elements.submitBtn.disabled = true;
  setMessage("Enabling writer access...", "success");

  try {
    await window.NovaraSession.enableWriterAccess(payload);
    setMessage("Writer access enabled. Redirecting to your dashboard...", "success");
    window.setTimeout(() => {
      window.location.href = "writer-dashboard.html";
    }, 240);
  } catch (error) {
    setMessage(error.message || "Unable to enable writer access.", "error");
    elements.submitBtn.disabled = false;
  }
}

elements.form.addEventListener("submit", handleSubmit);
loadUserState();