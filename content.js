// Harees Fraud Detector - content.js (MV3)
// Responsibilities:
// 1) Block page interaction (overlay)
// 2) Show warning with Leave/Proceed actions
// 3) Provide page "signals" to support content-based scanning
// 4) Notify background about the user's action (for history logging)

(() => {
  const OVERLAY_ID = "harees-overlay-root";
  let currentVerdict = null; // cache last verdict { level/color/status/score/reason, url }

  // ---- Overlay UI ----
  function ensureOverlay() {
    let root = document.getElementById(OVERLAY_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = OVERLAY_ID;

    // Full-screen blocking overlay
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      display: "none", // hidden by default
      background: "rgba(0,0,0,0.45)",
      backdropFilter: "blur(2px)",
    });

    // Modal container
    const modal = document.createElement("div");
    Object.assign(modal.style, {
      width: "min(520px, calc(100vw - 32px))",
      margin: "10vh auto 0",
      background: "#fff",
      borderRadius: "16px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      padding: "18px",
      fontFamily: "Segoe UI, Arial, sans-serif",
      color: "#212529",
      lineHeight: "1.4",
    });

    const title = document.createElement("div");
    title.id = "harees-title";
    Object.assign(title.style, {
      fontSize: "18px",
      fontWeight: "800",
      marginBottom: "8px",
    });
    title.textContent = "Harees Security";

    const statusPill = document.createElement("div");
    statusPill.id = "harees-status-pill";
    Object.assign(statusPill.style, {
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: "999px",
      fontWeight: "800",
      fontSize: "12px",
      marginBottom: "10px",
      color: "#fff",
      background: "#6c757d",
    });
    statusPill.textContent = "Checking...";

    const urlBox = document.createElement("div");
    urlBox.id = "harees-url";
    Object.assign(urlBox.style, {
      fontSize: "12px",
      color: "#495057",
      background: "#f1f3f5",
      borderRadius: "10px",
      padding: "10px",
      wordBreak: "break-all",
      margin: "10px 0",
      border: "1px solid #e9ecef",
    });
    urlBox.textContent = location.href;

    const reason = document.createElement("div");
    reason.id = "harees-reason";
    Object.assign(reason.style, {
      fontSize: "13px",
      color: "#343a40",
      background: "#ffffff",
      borderRadius: "10px",
      padding: "10px",
      border: "1px solid #dee2e6",
      marginBottom: "12px",
    });
    reason.textContent = "Analyzing this website…";

    const hint = document.createElement("div");
    hint.id = "harees-hint";
    Object.assign(hint.style, {
      fontSize: "12px",
      color: "#6c757d",
      marginBottom: "14px",
    });
    hint.textContent =
      "For your safety, interaction is temporarily blocked until a decision is made.";

    // Buttons row
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
      marginTop: "8px",
    });

    const leaveBtn = document.createElement("button");
    leaveBtn.id = "harees-leave";
    leaveBtn.type = "button";
    leaveBtn.textContent = "Leave Site";
    Object.assign(leaveBtn.style, buttonStyle("#dc3545", "#fff"));

    const proceedBtn = document.createElement("button");
    proceedBtn.id = "harees-proceed";
    proceedBtn.type = "button";
    proceedBtn.textContent = "Proceed Anyway";
    Object.assign(proceedBtn.style, buttonStyle("#ffc107", "#212529"));

    // Secondary: allow user to minimize if you want (optional)
    const small = document.createElement("div");
    Object.assign(small.style, {
      marginTop: "10px",
      fontSize: "11px",
      color: "#adb5bd",
      textAlign: "center",
    });
    small.textContent = "Harees Fraud Detector";

    btnRow.appendChild(leaveBtn);
    btnRow.appendChild(proceedBtn);

    modal.appendChild(title);
    modal.appendChild(statusPill);
    modal.appendChild(urlBox);
    modal.appendChild(reason);
    modal.appendChild(hint);
    modal.appendChild(btnRow);
    modal.appendChild(small);

    // Ensure overlay blocks all pointer events
    // By default, overlay catches pointer events; modal is interactive.
    root.appendChild(modal);
    document.documentElement.appendChild(root);

    // Button handlers
    leaveBtn.addEventListener("click", () => {
      sendUserAction("leave");
      // Try safest navigation away
      window.location.href = "about:blank";
    });

    proceedBtn.addEventListener("click", () => {
      sendUserAction("proceed");
      hideOverlay();
    });

    // Prevent keyboard shortcuts on page while blocked (basic)
    window.addEventListener(
      "keydown",
      (e) => {
        const rootNow = document.getElementById(OVERLAY_ID);
        if (rootNow && rootNow.style.display !== "none") {
          // allow Esc? (optional) - keep blocked for UC-1, so prevent.
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true
    );

    return root;
  }

  function buttonStyle(bg, fg) {
    return {
      width: "100%",
      border: "none",
      borderRadius: "12px",
      padding: "10px 12px",
      fontSize: "13px",
      fontWeight: "800",
      cursor: "pointer",
      background: bg,
      color: fg,
    };
  }

  function showOverlayChecking(url) {
    const root = ensureOverlay();
    root.style.display = "block";

    setPill("Checking…", "info");
    setUrl(url);
    setReason("Analyzing this website…");
  }

  function showOverlayWarning(verdict) {
    const root = ensureOverlay();
    root.style.display = "block";

    // Support both "color" and "level" fields
    const level = normalizeLevel(verdict);
    currentVerdict = verdict;

    if (level === "danger") {
      setPill("Dangerous", "danger");
    } else if (level === "warning") {
      setPill("Suspicious", "warning");
    } else {
      setPill("Checking…", "info");
    }

    setUrl(verdict.url || location.href);
    setReason(verdict.reason || "This website looks suspicious. Be careful with payments and passwords.");
  }

  function hideOverlay() {
    const root = document.getElementById(OVERLAY_ID);
    if (root) root.style.display = "none";
  }

  function setPill(text, type) {
    const pill = document.getElementById("harees-status-pill");
    if (!pill) return;
    pill.textContent = text;

    // pill colors
    const map = {
      danger: "#dc3545",
      warning: "#ffc107",
      safe: "#28a745",
      info: "#6c757d",
    };
    pill.style.background = map[type] || map.info;
    pill.style.color = type === "warning" ? "#212529" : "#fff";
  }

  function setUrl(url) {
    const urlBox = document.getElementById("harees-url");
    if (urlBox) urlBox.textContent = url;
  }

  function setReason(text) {
    const reason = document.getElementById("harees-reason");
    if (reason) reason.textContent = text;
  }

  function normalizeLevel(v) {
    const c = (v?.color || v?.level || v?.status || "").toString().toLowerCase();
    if (c.includes("danger")) return "danger";
    if (c.includes("warn") || c.includes("susp")) return "warning";
    if (c.includes("safe")) return "safe";
    return "info";
  }

  // ---- Page content signals (for backend) ----
  function getPageSignals() {
    // Keep it lightweight: only small samples, no personal data.
    const title = document.title || "";
    const hostname = location.hostname;

    const forms = Array.from(document.forms || []).slice(0, 10).map((f) => {
      const hasPassword = !!f.querySelector('input[type="password"]');
      const hasCard = !!f.querySelector('input[name*="card" i], input[autocomplete*="cc-" i]');
      return { hasPassword, hasCard };
    });

    // Small text hints: sample visible text (trimmed)
    const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const textSample = bodyText.slice(0, 800); // sample only

    // Presence of common phishing cues
    const cues = [
      "verify your account",
      "urgent",
      "login",
      "password",
      "bank",
      "payment",
      "otp",
      "one-time password",
      "تأكيد",
      "تحقق",
      "كلمة المرور",
      "الدفع",
      "حسابك",
    ];
    const cuesFound = cues.filter((c) => bodyText.toLowerCase().includes(c.toLowerCase())).slice(0, 10);

    return {
      url: location.href,
      hostname,
      title,
      forms,
      cuesFound,
      textSample,
    };
  }

  // ---- Notify background (history logging) ----
  function sendUserAction(action) {
    const verdict = currentVerdict || {};
    const payload = {
      type: "HAREES_USER_ACTION",
      action, // "leave" | "proceed"
      url: verdict.url || location.href,
      level: normalizeLevel(verdict),
      score: verdict.score ?? null,
      reason: verdict.reason ?? "",
    };
    chrome.runtime.sendMessage(payload);
  }

  // ---- Message bridge: background/popup -> content ----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.type) return;

    if (msg.type === "HAREES_BLOCK") {
      currentVerdict = { url: msg.url || location.href, color: "info" };
      showOverlayChecking(msg.url || location.href);
      sendResponse?.({ ok: true });
      return;
    }

    if (msg.type === "HAREES_SHOW_WARNING") {
      // msg.verdict expected: { url, color/level/status, score, reason }
      currentVerdict = msg.verdict || { url: location.href };
      showOverlayWarning({ ...(msg.verdict || {}), url: msg.verdict?.url || location.href });
      sendResponse?.({ ok: true });
      return;
    }

    if (msg.type === "HAREES_UNBLOCK") {
      hideOverlay();
      sendResponse?.({ ok: true });
      return;
    }

    if (msg.type === "HAREES_GET_SIGNALS") {
      sendResponse(getPageSignals());
      return true; // keep channel open (safe)
    }
  });

  // Optional: if you want to block right away until background verdict arrives:
  // showOverlayChecking(location.href);
})();

