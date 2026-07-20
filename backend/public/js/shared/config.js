// config.js
// Shared frontend config for API base URL
window.APP_CONFIG = {
  API_BASE_URL: (window.NovaraSession && window.NovaraSession.API_BASE_URL) || window.location.origin || "https://readnovara.ca"
};
