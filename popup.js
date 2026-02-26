// UC2 Manual Check + On-load analysis + UC5 Alert History
const API_URL = "http://127.0.0.1:5000/analyze";

// ------------------------ Startup / Event Bindings ------------------------
document.addEventListener("DOMContentLoaded", () => {
  // UC2 elements (must exist in popup.html for UC2)
  const btnAnalyze = document.getElementById("manual-check");
  const urlInput = document.getElementById("url-input");
  const btnHistory = document.getElementById("view-history");

  // Bind UC2 actions
  if (btnAnalyze) btnAnalyze.addEventListener("click", runAnalysis);
  if (urlInput) {
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runAnalysis();
    });
  }

  // Bind UC5 action (only if button exists)
  if (btnHistory) btnHistory.addEventListener("click", loadHistory);

  // Do analysis on popup open (same behavior as your old code)
  runAnalysis();
});

// ------------------------ UI Helpers ------------------------
function updateUI(message, className) {
  const statusDiv = document.getElementById("status");
  if (!statusDiv) return;
  statusDiv.textContent = message;
  statusDiv.className = "status-box " + className; // safe / warning / danger / info
}

function updateReason(text) {
  const reasonDiv = document.getElementById("reason");
  if (!reasonDiv) return;
  reasonDiv.textContent = text || "";
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url || "N/A";
  }
}

// ------------------------ UC2 Helpers (Strict URL Validation) ------------------------
function isIp(host) {
  // Simple IPv4 check
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function normalizeUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return null;

  // Add scheme if missing
  const withScheme =
    v.startsWith("http://") || v.startsWith("https://") ? v : "https://" + v;

  try {
    const u = new URL(withScheme);

    // Allow only http/https
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    const host = u.hostname.toLowerCase();

    // "Realistic" host: has dot OR localhost OR IP
    const looksLikeDomain = host.includes(".");
    const looksLikeLocal = host === "localhost";
    const looksLikeIp = isIp(host);

    if (!looksLikeDomain && !looksLikeLocal && !looksLikeIp) return null;

    return u.toString();
  } catch {
    return null;
  }
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;

  // Skip non-web pages (chrome://, about:, edge://, file://)
  if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) return null;

  return tab.url;
}

// ------------------------ UC2 Main: Run Analysis ------------------------
async function runAnalysis() {
  const urlDisplay = document.getElementById("url-display");
  const input = document.getElementById("url-input");

  updateUI("Analyzing...", "info");
  updateReason("Preparing URL...");

  // 1) User input (UC2)
  const raw = (input?.value || "").trim();
  let targetUrl = normalizeUrl(raw);

  // If user typed something but it's invalid -> show Invalid immediately (no fallback)
  if (raw && !targetUrl) {
    updateUI("Invalid URL", "warning");
    updateReason("Please enter a valid URL (e.g., https://example.com).");
    if (urlDisplay) urlDisplay.textContent = "N/A";
    return;
  }

  // 2) If input empty -> fallback to active tab (old behavior)
  if (!targetUrl) {
    const tabUrl = await getActiveTabUrl();
    if (!tabUrl) {
      updateUI("Open a website (http/https) or enter a URL", "info");
      updateReason("No valid active tab found and input is empty.");
      if (urlDisplay) urlDisplay.textContent = "N/A";
      return;
    }
    targetUrl = tabUrl;
  }

  // Show hostname
  if (urlDisplay) urlDisplay.textContent = safeHostname(targetUrl);

  updateReason("Sending URL for analysis...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl }),
    });

    if (!response.ok) {
      const txt = await response.text();
      updateUI("Analysis failed", "warning");
      updateReason(`HTTP ${response.status}: ${txt}`);
      return;
    }

    const data = await response.json();

    // Show result
    updateUI(data.status || "Unknown", data.color || "info");

    // Show reason if backend sends it
    updateReason(data.reason || "No details provided.");

  } catch (error) {
    updateUI("Server Offline / Blocked", "info");
    updateReason("Backend not reachable.");
    console.error("Fetch failed:", error);
  }
}

// ------------------------ UC-5 Alert History ------------------------
let showingAll = false; // Track if showing all alerts

function loadHistory() {
  const historyBox = document.getElementById("history-section");
  const detailsBox = document.getElementById("details-section");

  if (!historyBox) return;
  if (detailsBox) detailsBox.innerHTML = "";

  if (!navigator.onLine) {
    historyBox.innerText = "Alert history unavailable offline";
    return;
  }

  chrome.storage.local.get("history", (data) => {
    const history = data.history || [];

    if (history.length === 0) {
      historyBox.innerText = "No alerts found";
      return;
    }

    showingAll = false; // Reset to show last 5 first
    displayHistory(history);
  });
}

function displayHistory(history) {
  const container = document.getElementById("history-section");
  if (!container) return;

  container.innerHTML = "";

  const toShow = showingAll ? history : history.slice(0, 5);

  toShow.forEach((alert) => {
    const item = document.createElement("div");

    // Styling
    item.style.padding = "6px";
    item.style.borderBottom = "1px solid #dee2e6";
    item.style.cursor = "pointer";

    // Color class for hover effect
    let colorClass = "info";
    const lvl = (alert.level || "").toLowerCase();
    if (lvl === "safe") colorClass = "safe";
    if (lvl === "warning") colorClass = "warning";
    if (lvl === "danger") colorClass = "danger";

    const host = safeHostname(alert.url);
    const levelText = alert.level || "N/A";
    const dateText = alert.date || "N/A";

    item.innerHTML = `<b>${host}</b> - ${levelText} - ${dateText}`;

    // Hover color (guard if class not found)
    item.addEventListener("mouseenter", () => {
      const refEl = document.querySelector(`.${colorClass}`);
      const bg = refEl ? getComputedStyle(refEl).backgroundColor : "";
      if (bg) item.style.backgroundColor = bg;
      item.style.color = colorClass === "warning" ? "#212529" : "#fff";
    });

    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "";
      item.style.color = "";
    });

    item.addEventListener("click", () => {
      showDetails(alert);
    });

    container.appendChild(item);
  });

  // Add "Load More" button if there are more than 5 and not showing all
  if (!showingAll && history.length > 5) {
    const moreBtn = document.createElement("button");
    moreBtn.textContent = "Load More";
    moreBtn.style.marginTop = "5px";
    moreBtn.addEventListener("click", () => {
      showingAll = true;
      displayHistory(history);
    });
    container.appendChild(moreBtn);
  }
}

function showDetails(alert) {
  const box = document.getElementById("details-section");
  if (!box) return;

  const url = alert.url || "N/A";
  const level = alert.level || "N/A";
  const action = alert.action || "N/A";
  const date = alert.date || "N/A";
  const reason = alert.reason || "N/A";

  box.innerHTML = `
    <hr>
    <b>URL:</b> ${url}<br>
    <b>Risk Level:</b> ${level}<br>
    <b>Action Taken:</b> ${action}<br>
    <b>Date:</b> ${date}<br>
    <b>Reason:</b> ${reason}
  `;
}