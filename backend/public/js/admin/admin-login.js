const ADMIN_AUTH_KEY = "novara.admin.auth";
const API_BASE_URL = (window.NovaraSession && window.NovaraSession.API_BASE_URL) || "https://novara-6s67.onrender.com";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("adminEmail");
const passInput = document.getElementById("adminPass");

function getNextPath() {
  // Always land on admin dashboard for admin login
  return "/admin/admin.html";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const pass = passInput.value;

  if (!email || pass.length < 4) {
    window.alert("Please provide valid credentials.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signin`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password: pass }),
    });

    const payload = await response.json().catch(() => ({ success: false }));
    if (!response.ok || !payload.success || !payload.user || payload.user.role !== "ADMIN") {
      window.alert("Admin credentials are invalid.");
      return;
    }

    localStorage.setItem(ADMIN_AUTH_KEY, "1");
    window.location.href = getNextPath();
  } catch (error) {
    window.alert("Unable to sign in right now.");
  }
});


