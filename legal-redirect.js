async function redirectLegalPage() {
  var currentScript = document.currentScript;
  if (!currentScript) {
    var scripts = document.getElementsByTagName("script");
    currentScript = scripts[scripts.length - 1] || null;
  }
  var path = "/";

  if (currentScript) {
    var configuredPath = currentScript.getAttribute("data-path");
    if (configuredPath) {
      path = configuredPath;
    }
  }

  var message = document.getElementById("redirectMessage");
  if (message) {
    message.textContent = "Redirecting...";
  }

  var search = window.location.search || "";
  var hash = window.location.hash || "";
  var suffix = search + hash;
  var hostname = window.location.hostname || "";
  var isLocal =
    window.location.protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";

  if (!isLocal) {
    window.location.replace(window.location.origin + path + suffix);
    return;
  }

  var candidates = ["http://localhost:5002", "http://localhost:5001"];
  for (var i = 0; i < candidates.length; i += 1) {
    var base = candidates[i];
    try {
      var response = await fetch(base + "/health", {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
      });

      if (response && response.ok) {
        window.location.replace(base + path + suffix);
        return;
      }
    } catch (error) {
      // Try the next local backend.
    }
  }

  window.location.replace(candidates[0] + path + suffix);
}

redirectLegalPage();
