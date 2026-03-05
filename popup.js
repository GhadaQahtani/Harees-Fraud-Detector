const API_URL = "http://127.0.0.1:5000/analyze";

// ------------------ Startup ------------------
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("manual-check")?.addEventListener("click", runAnalysis);
    document.getElementById("url-input")?.addEventListener("keydown", e => {
        if (e.key === "Enter") runAnalysis();
    });
    document.getElementById("view-history")?.addEventListener("click", loadHistory);

    runAnalysis();
});

// ------------------ Helpers ------------------
function normalizeStatus(status) {
    if (!status) return "safe";
    status = status.toLowerCase();
    if (status.includes("danger")) return "danger";
    if (status.includes("suspicious") || status.includes("warning")) return "suspicious";
    return "safe";
}

function updateUI(message, statusClass) {
    const box = document.getElementById("status");
    box.textContent = message;
    box.className = "status-box " + statusClass;
}

function updateReason(text) {
    document.getElementById("reason").textContent = text || "";
}

function safeHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url || "N/A";
    }
}

function normalizeUrl(raw) {
    const v = (raw || "").trim();
    if (!v) return null;
    const withScheme = v.startsWith("http://") || v.startsWith("https://") ? v : "https://" + v;
    try {
        const u = new URL(withScheme);
        if (!["http:", "https:"].includes(u.protocol)) return null;
        return u.toString();
    } catch {
        return null;
    }
}

async function getActiveTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) return null;
    return tab.url;
}

// ------------------ Main Analysis ------------------
async function runAnalysis() {
    const input = document.getElementById("url-input");
    const urlDisplay = document.getElementById("url-display");

    updateUI("Analyzing...", "info");
    updateReason("Preparing URL...");

    const raw = (input?.value || "").trim();
    let url = normalizeUrl(raw);

    if (raw && !url) {
        updateUI("Invalid URL", "warning");
        updateReason("Please enter a valid URL (e.g., https://example.com).");
        if (urlDisplay) urlDisplay.textContent = "N/A";
        return;
    }

    if (!url) {
        const tabUrl = await getActiveTabUrl();
        if (!tabUrl) {
            updateUI("Open a website (http/https) or enter a URL", "info");
            updateReason("No valid active tab found and input is empty.");
            if (urlDisplay) urlDisplay.textContent = "N/A";
            return;
        }
        url = tabUrl;
    }

    urlDisplay.textContent = safeHostname(url);
    updateReason("Sending URL for analysis...");

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            const txt = await response.text();
            updateUI("Analysis failed", "warning");
            updateReason(`HTTP ${response.status}: ${txt}`);
            return;
        }

        const data = await response.json();

        const status = normalizeStatus(data.status);
        updateUI(status.toUpperCase(), status);
        updateReason(data.reason || "No details provided.");

        saveToHistory({
            url,
            status,
            reason: data.reason || "N/A",
            date: new Date().toLocaleString(),
            action: status === "danger" ? "Blocked" : "Allowed"
        });

    } catch (err) {
        updateUI("Server Offline", "danger");
        updateReason("Backend not reachable.");
        console.error(err);
    }
}

// ------------------ History ------------------
function saveToHistory(entry) {
    chrome.storage.local.get(["history"], data => {
        const history = data.history || [];
        history.unshift(entry);
        chrome.storage.local.set({ history });
    });
}

let showingAll = false;

function loadHistory() {
    const historyBox = document.getElementById("history-section");
    const detailsBox = document.getElementById("details-section");

    if (!historyBox) return;
    if (detailsBox) detailsBox.innerHTML = "";

    chrome.storage.local.get(["history"], data => {
        const history = data.history || [];
        showingAll = false;
        displayHistory(history);
    });
}

function displayHistory(history) {
    const container = document.getElementById("history-section");
    container.innerHTML = "";

    if (!history.length) {
        container.innerHTML = "<p>No alerts found</p>";
        return;
    }

    const toShow = showingAll ? history : history.slice(0, 5);

    toShow.forEach(item => {
        const div = document.createElement("div");
        const status = normalizeStatus(item.status);
        div.className = "history-item " + status;
        div.innerHTML = `<strong>${safeHostname(item.url)}</strong><br>${status.toUpperCase()} - ${item.date}`;
        div.addEventListener("click", () => showDetails(item));
        container.appendChild(div);
    });

    if (!showingAll && history.length > 5) {
        const btn = document.createElement("button");
        btn.textContent = "Load More";
        btn.className = "load-more-btn";
        btn.addEventListener("click", () => {
            showingAll = true;
            displayHistory(history);
        });
        container.appendChild(btn);
    }
}

function showDetails(item) {
    const box = document.getElementById("details-section");
    if (!box) return;

    const url = item.url || "N/A";
    const riskLevel = item.status || "N/A";  
    const action = item.action || "N/A";
    const date = item.date || "N/A";
    const reason = item.reason || "N/A";

    box.innerHTML = `
        <hr>
        <b>URL:</b> ${url}<br>
        <b>Risk Level:</b> ${riskLevel}<br>
        <b>Action Taken:</b> ${action}<br>
        <b>Date:</b> ${date}<br>
        <b>Reason:</b> ${reason}
    `;
}
