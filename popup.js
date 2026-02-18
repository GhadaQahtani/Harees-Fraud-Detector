document.addEventListener("DOMContentLoaded", async () => {
  const urlDisplay = document.getElementById("url-display");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    updateUI("No active tab URL", "info");
    urlDisplay.textContent = "N/A";
    return;
  }

  // Skip non-web pages (chrome://, about:, edge://)
  if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) {
    updateUI("Open a website (http/https)", "info");
    urlDisplay.textContent = tab.url;
    return;
  }

  urlDisplay.textContent = new URL(tab.url).hostname;

  try {
    const response = await fetch("http://127.0.0.1:5000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url })
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`HTTP ${response.status}: ${txt}`);
    }

    const data = await response.json();
    updateUI(data.status, data.color);

  } catch (error) {
    updateUI("Server Offline / Blocked", "info");
    console.error("Fetch failed:", error);
  }
});

function updateUI(message, className) {
  const statusDiv = document.getElementById("status");
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = "status-box " + className;
  }
}
