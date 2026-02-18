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

chrome.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url;
  // Skip internal chrome pages
  if (!url.startsWith("http")) return;

  const tabId = details.tabId;

  // 1) Block interaction
  await safeSend(tabId, { type: "HAREES_BLOCK", url });

  // 2) Get page signals
  let pageSignals = null;
  try {
    pageSignals = await chrome.tabs.sendMessage(tabId, { type: "HAREES_GET_SIGNALS" });
  } catch (e) {
    // content script might not be ready yet; continue with URL-only
  }

  // 3) Call backend
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

  // 4) Show warning or unblock
  if (verdict.color === "safe") {
    await safeSend(tabId, { type: "HAREES_UNBLOCK", verdict });
  } else {
    await safeSend(tabId, { type: "HAREES_SHOW_WARNING", verdict });
  }

  // 5) Save latest verdict (popup can read it)
  chrome.storage.local.set({ lastVerdict: { ...verdict, ts: new Date().toISOString() } });
});

// Receive Leave/Proceed from content.js and store history
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "HAREES_USER_ACTION") return;

  const record = {
    url: msg.url,
    level: msg.level,
    score: msg.score ?? null,
    reason: msg.reason ?? "",
    action: msg.action,
    ts: new Date().toISOString()
  };

  chrome.storage.local.get({ history: [] }, (data) => {
    const history = [record, ...data.history].slice(0, 200);
    chrome.storage.local.set({ history });
  });

  // ✅ Strong "Leave Site": close the tab (reliable)
  if (msg.action === "leave" && sender?.tab?.id) {
    chrome.tabs.remove(sender.tab.id);
  }

  sendResponse?.({ ok: true });
});
