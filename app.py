from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.get("/health")
def health():
    return jsonify({"ok": True}), 200

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()

    if not url:
        return jsonify({
            "status": "Bad Request",
            "color": "warning",
            "reason": "Missing 'url' in request body",
            "score": 0.5
        }), 400

    # TEMP logic
    if "login" in url.lower():
        result = {"status": "Suspicious", "color": "warning", "reason": "Login keyword detected", "score": 0.6}
    else:
        result = {"status": "Safe", "color": "safe", "reason": "No risk detected", "score": 0.1}

    return jsonify(result), 200

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)