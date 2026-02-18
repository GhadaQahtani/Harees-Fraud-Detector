import csv
from urllib.parse import urlparse

# =========================
# Load Dataset (Domain-based)
# =========================

dataset = {}

with open("links.csv", newline="", encoding="utf-8") as file:
    reader = csv.DictReader(file)
    for row in reader:
        url = row["URL"].strip().lower()
        category = row["Category"].strip().lower()

        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "")
        dataset[domain] = category


# =========================
# Keywords
# =========================

suspicious_keywords = [
    "login", "verify", "account", "update",
    "secure", "bank", "confirm", "free"
]

dangerous_keywords = [
    "malware", "phishing", "virus",
    "fraud", "scam"
]


# =========================
# Classification Function
# =========================

def classify_url(url):

    url_lower = url.lower()
    parsed = urlparse(url_lower)
    domain = parsed.netloc.replace("www.", "")

    score = 0.0

    # -------------------------
    # 1) Dataset Influence
    # -------------------------
    if domain in dataset:
        category = dataset[domain]

        if category == "official":
            score -= 0.3
        elif category == "suspicious":
            score += 0.4
        elif category == "malicious":
            score += 0.6

    # -------------------------
    # 2) Dangerous Keywords (max 0.5)
    # -------------------------
    danger_hits = sum(1 for word in dangerous_keywords if word in url_lower)
    score += min(danger_hits * 0.3, 0.5)

    # -------------------------
    # 3) Suspicious Keywords (max 0.4)
    # -------------------------
    susp_hits = sum(1 for word in suspicious_keywords if word in url_lower)
    score += min(susp_hits * 0.2, 0.4)

    # -------------------------
    # 4) URL Structure Checks
    # -------------------------
    if "@" in url_lower:
        score += 0.25

    if url_lower.count("-") >= 3:
        score += 0.2

    if len(url_lower) > 75:
        score += 0.2

    # -------------------------
    # 5) HTTPS Check
    # -------------------------
    if url_lower.startswith("https://"):
        score -= 0.05
    else:
        score += 0.1

    # -------------------------
    # Normalize
    # -------------------------
    score = max(0.0, min(score, 1.0))

    # -------------------------
    # Final Decision
    # -------------------------
    if score >= 0.7:
        status = "Dangerous"
        color = "danger"
        reason = "High risk detected"

    elif score >= 0.3:
        status = "Suspicious"
        color = "warning"
        reason = "Moderate risk detected"

    else:
        status = "Safe"
        color = "safe"
        reason = "Low risk URL"

    return {
        "status": status,
        "color": color,
        "reason": reason,
        "score": round(score, 2)
    }