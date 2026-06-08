(function initializeAdminDashboardSwitcher() {
  const container = document.getElementById("dashboardSwitcher");
  if (!container) {
    return;
  }

  if (!window.NovaraSession || typeof window.NovaraSession.renderDashboardSwitcher !== "function") {
    container.innerHTML = "";
    return;
  }

  window.NovaraSession.renderDashboardSwitcher(container, {
    currentDashboard: "admin",
    readerHref: "/reader/dashboard.html",
    writerHref: "/writer/writer-dashboard.html",
    adminHref: "/admin/admin.html",
  });
})();
