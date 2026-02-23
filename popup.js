// popup.js (UC2 - Manual URL Check + strict Invalid URL handling)
const API_URL = "http://127.0.0.1:5000/analyze";

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("manual-check");
  const input = document.getElementById("url-input");

  if (btn) btn.addEventListener("click", runAnalysis);

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runAnalysis();
    });
  }

  // اختياري: تحليل عند فتح الـ popup (يفحص التبويب الحالي إذا الحقل فاضي)
  runAnalysis();
});

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

function isIp(host) {
  // IPv4 بسيط (يكفي لاحتياجنا)
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function normalizeUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return null;

  // إذا كتب example.com بدون بروتوكول
  const withScheme =
    v.startsWith("http://") || v.startsWith("https://") ? v : "https://" + v;

  try {
    const u = new URL(withScheme);

    // نسمح فقط بـ http/https
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;

    const host = u.hostname.toLowerCase();

    // ✅ شرط "واقعي": يحتوي نقطة أو localhost أو IP
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

  // تجاهل روابط غير ويب مثل chrome:// و file://
  if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) return null;

  return tab.url;
}

async function runAnalysis() {
  const urlDisplay = document.getElementById("url-display");
  const input = document.getElementById("url-input");

  updateUI("Analyzing...", "info");
  updateReason("Preparing URL...");

  // 1) UC2: خذ مدخل المستخدم (إن وجد)
  const raw = (input?.value || "").trim();
  let targetUrl = normalizeUrl(raw);

  // ✅ إذا المستخدم كتب شيء لكنه غير صالح → Invalid URL فورًا
  if (raw && !targetUrl) {
    updateUI("Invalid URL", "warning");
    updateReason("Please enter a valid URL (e.g., https://example.com).");
    if (urlDisplay) urlDisplay.textContent = "N/A";
    return;
  }

  // 2) إذا الحقل فاضي → افحص التبويب الحالي
  if (!targetUrl) {
    const tabUrl = await getActiveTabUrl();
    if (!tabUrl) {
      updateUI("Please enter a valid URL.", "warning");
      updateReason("URL is empty and no valid active tab found.");
      if (urlDisplay) urlDisplay.textContent = "N/A";
      return;
    }
    targetUrl = tabUrl;
  }

  // عرض الدومين في Current Site
  if (urlDisplay) {
    try {
      urlDisplay.textContent = new URL(targetUrl).hostname;
    } catch {
      urlDisplay.textContent = targetUrl;
    }
  }

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

    // app.py يرجّع عادة: status, color, reason, score
    updateUI(data.status || "Unknown", data.color || "info");
    updateReason(data.reason || "No details provided.");

  } catch (error) {
    updateUI("Server Offline / Blocked", "info");
    updateReason("Backend not reachable.");
    console.error("Fetch failed:", error);
  }
}