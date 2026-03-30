const ADMIN_AUTH_KEY = "novara.admin.auth";
function resolveApiBaseUrl() {
  const explicitBase = window.localStorage.getItem("Novara.apiBaseUrl");
  if (explicitBase) {
    return explicitBase.replace(/\/$/, "");
  }

  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5002`;
}

const API_BASE_URL = resolveApiBaseUrl();

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("adminEmail");
const passInput = document.getElementById("adminPass");

function getNextPath() {
  const params = new URLSearchParams(window.location.search);
  const rawNext = String(params.get("next") || "admin.html").trim();

  if (!rawNext) {
    return "admin.html";
  }

  if (/^https?:\/\//i.test(rawNext)) {
    return "admin.html";
  }

  const routeMap = {
    "/admin/dashboard": "admin.html",
    "/admin/books/upload": "admin-upload.html",
  };

  if (routeMap[rawNext]) {
    return routeMap[rawNext];
  }

  return rawNext.startsWith("/") ? rawNext.slice(1) : rawNext;
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

