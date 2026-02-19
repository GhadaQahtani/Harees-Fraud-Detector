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

// ---- NEW: remember user "proceed" decisions per tab+url ----
function allowKey(tabId, url) {
  return `${tabId}::${url}`;
}

async function isAllowed(tabId, url) {
  const key = allowKey(tabId, url);
  const data = await chrome.storage.local.get({ allowlist: {} });
  return !!data.allowlist[key];
}

async function setAllowed(tabId, url) {
  const key = allowKey(tabId, url);
  const data = await chrome.storage.local.get({ allowlist: {} });
  data.allowlist[key] = { ts: new Date().toISOString() };
  await chrome.storage.local.set({ allowlist: data.allowlist });
}

async function clearAllowedForTab(tabId) {
  const data = await chrome.storage.local.get({ allowlist: {} });
  const allowlist = data.allowlist || {};
  for (const k of Object.keys(allowlist)) {
    if (k.startsWith(`${tabId}::`)) delete allowlist[k];
  }
  await chrome.storage.local.set({ allowlist });
}

// Clear allowlist when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  clearAllowedForTab(tabId).catch(() => {});
});

chrome.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url;
  if (!url.startsWith("http")) return;

  const tabId = details.tabId;

  // ✅ If user already chose Proceed for this tab+url, do not block again
  if (await isAllowed(tabId, url)) {
    // Still call backend so popup/history can show latest verdict
    let verdict;
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, pageSignals: null })
      });
      verdict = await res.json();
    } catch (e) {
      verdict = { status: "Server Offline", color: "warning", reason: "Backend not reachable" };
    }
    verdict.url = url;
    chrome.storage.local.set({ lastVerdict: { ...verdict, ts: new Date().toISOString() } });
    return;
  }

  // 1) Block interaction
  await safeSend(tabId, { type: "HAREES_BLOCK", url });

  // 2) Get page signals
  let pageSignals = null;
  try {
    pageSignals = await chrome.tabs.sendMessage(tabId, { type: "HAREES_GET_SIGNALS" });
  } catch (e) {
    // content script might not be ready; continue with URL-only
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

  // 5) Save latest verdict
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

  // ✅ If user proceeds, remember it for this tab+url
  if (msg.action === "proceed" && sender?.tab?.id && msg.url) {
    setAllowed(sender.tab.id, msg.url).catch(() => {});
  }

  // ✅ Strong "Leave Site": close the tab
  if (msg.action === "leave" && sender?.tab?.id) {
    chrome.tabs.remove(sender.tab.id);
  }

  sendResponse?.({ ok: true });
});

