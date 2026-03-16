const ADMIN_AUTH_KEY = "novelread.admin.auth";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("adminEmail");
const passInput = document.getElementById("adminPass");

function getNextPath() {
  const params = new URLSearchParams(window.location.search);
  return params.get("next") || "admin.html";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const pass = passInput.value;

  if (!email || pass.length < 4) {
    window.alert("Please provide valid credentials.");
    return;
  }

  localStorage.setItem(ADMIN_AUTH_KEY, "1");
  window.location.href = getNextPath();
});
