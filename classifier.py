import csv
import os

# ---------- Load Dataset from links.csv ----------
dataset = {}
current_dir = os.path.dirname(os.path.abspath(__file__))
csv_path = os.path.join(current_dir, "links.csv")

with open(csv_path, newline="", encoding="utf-8") as file:
    reader = csv.DictReader(file)
    for row in reader:
        url = row["URL"].strip().lower().rstrip("/")
        category = row["Category"].strip().lower()
        dataset[url] = category

# ---------- Keywords ----------
suspicious_keywords = [
    "login", "verify", "account", "update", "secure", "bank", "confirm", "free"
]

dangerous_keywords = [
    "malware", "phishing", "virus", "fraud", "scam"
]

# ✅ MUST be above classify_url
def normalize_url_for_dataset(url: str) -> str:
    return url.strip().lower().rstrip("/")


def classify_url(url: str):
    url_lower = url.strip().lower()

    # UC-9 safety score: higher = safer
    safety_score = 0.5
    reason_parts = []

    url_key = normalize_url_for_dataset(url_lower)
    dataset_label = None

    # 1) Dataset (strong signal)
    if url_key in dataset:
        dataset_label = dataset[url_key]

        if dataset_label == "official":
            safety_score = 0.9
            reason_parts.append("Official trusted website (dataset)")
        elif dataset_label == "suspicious":
            safety_score = 0.6
            reason_parts.append("Found in suspicious dataset")
        elif dataset_label == "malicious":
            safety_score = 0.1
            reason_parts.append("Known malicious website (dataset)")

    # 2) Apply heuristic checks ONLY for unknown URLs
    if dataset_label is None:
        for word in dangerous_keywords:
            if word in url_lower:
                safety_score -= 0.35
                reason_parts.append(f"Dangerous keyword: {word}")

        for word in suspicious_keywords:
            if word in url_lower:
                safety_score -= 0.20
                reason_parts.append(f"Suspicious keyword: {word}")

        if "@" in url_lower:
            safety_score -= 0.25
            reason_parts.append("Contains @ symbol")

        if url_lower.startswith("https://"):
            safety_score += 0.05
            reason_parts.append("HTTPS present")

    # Clamp to [0, 1]
    safety_score = max(0.0, min(safety_score, 1.0))

    # 3) UC-9 thresholds (from your image)
    if safety_score > 0.8:
        status, color = "Safe", "safe"
    elif safety_score >= 0.4:
        status, color = "Suspicious", "warning"
    else:
        status, color = "Dangerous", "danger"

    reason = " | ".join(reason_parts) if reason_parts else "Unknown website, caution recommended"

    return {
        "status": status,
        "color": color,
        "reason": reason,
        "score": round(safety_score, 2),
    }
