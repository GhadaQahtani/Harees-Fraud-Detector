const API_URL = "http://127.0.0.1:5000/analyze";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeSend(tabId, message, tries = 10) {
  for (let i = 0; i < tries; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch (e) {
      await sleep(120);
    }
  }
  return false;
}

// Listen for page load
chrome.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url;
  if (!url.startsWith("http")) return; // skip internal pages

  const tabId = details.tabId;

  await safeSend(tabId, { type: "HAREES_BLOCK", url });

  let pageSignals = null;
  try {
    pageSignals = await chrome.tabs.sendMessage(tabId, { type: "HAREES_GET_SIGNALS" });
  } catch (e) {}

  let verdict;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, pageSignals })
    });
    verdict = await res.json();
  } catch (e) {
    verdict = { status: "Server Offline", color: "warning", reason: "Backend not reachable" };
  }

  verdict.url = url;

  // Show warning/unblock
  if (verdict.color === "safe") {
    await safeSend(tabId, { type: "HAREES_UNBLOCK", verdict });
  } else {
    await safeSend(tabId, { type: "HAREES_SHOW_WARNING", verdict });
  }

  // Save latest verdict
  chrome.storage.local.set({ lastVerdict: { ...verdict, ts: new Date().toISOString() } });

  // Add to history for all verdicts
  const record = {
    url: verdict.url,
    level: verdict.status,
    score: verdict.score ?? null,
    reason: verdict.reason ?? "",
    action: verdict.color === "safe" ? "auto" : "pending",
    date: new Date().toLocaleDateString(),
    ts: new Date().toISOString()
  };

  chrome.storage.local.get({ history: [] }, (data) => {
    const history = [record, ...data.history].slice(0, 200);
    chrome.storage.local.set({ history });
  });
});

// Listen to user actions (Leave/Proceed)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "HAREES_USER_ACTION") return;

  const record = {
    url: msg.url,
    level: msg.level,
    score: msg.score ?? null,
    reason: msg.reason ?? "",
    action: msg.action,
    date: new Date().toLocaleDateString(),
    ts: new Date().toISOString()
  };

  chrome.storage.local.get({ history: [] }, (data) => {
    const history = [record, ...data.history].slice(0, 200);
    chrome.storage.local.set({ history });
  });

  if (msg.action === "leave" && sender?.tab?.id) {
    chrome.tabs.remove(sender.tab.id);
  }

  sendResponse?.({ ok: true });
});