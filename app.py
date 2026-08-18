from flask import Flask, request, jsonify, render_template
import json, os, re, uuid
from datetime import datetime

app = Flask(__name__)
DATA_FILE = os.path.join(os.path.dirname(__file__), "data.json")
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")

def load():
    if not os.path.exists(DATA_FILE):
        return {"transactions": [], "budgets": {}}
    with open(DATA_FILE) as f:
        data = json.load(f)
    data.setdefault("budgets", {})
    return data

def save(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    return jsonify(load()["transactions"])

@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    tx = request.json
    if tx.get("type") not in ("income", "expense"):
        return jsonify({"error": "type must be 'income' or 'expense'"}), 400

    data = load()
    tx["id"] = str(uuid.uuid4())
    tx["amount"] = float(tx.get("amount", 0))
    tx.setdefault("date", datetime.now().strftime("%Y-%m-%d"))
    data["transactions"].insert(0, tx)
    save(data)
    return jsonify(tx), 201

@app.route("/api/transactions/<tx_id>", methods=["DELETE"])
def delete_transaction(tx_id):
    data = load()
    data["transactions"] = [t for t in data["transactions"] if t["id"] != tx_id]
    save(data)
    return jsonify({"ok": True})

@app.route("/api/budgets", methods=["GET"])
def get_budgets():
    return jsonify(load()["budgets"])

@app.route("/api/budgets", methods=["POST"])
def set_budget():
    body = request.json
    month = body.get("month", "")
    if not MONTH_RE.match(month):
        return jsonify({"error": "month must be in 'YYYY-MM' format"}), 400
    try:
        limit = float(body.get("limit"))
    except (TypeError, ValueError):
        return jsonify({"error": "limit must be a number"}), 400
    if limit < 0:
        return jsonify({"error": "limit must be >= 0"}), 400

    data = load()
    data["budgets"][month] = limit
    save(data)
    return jsonify({"month": month, "limit": limit}), 201

if __name__ == "__main__":
    app.run(debug=True, port=8081)
