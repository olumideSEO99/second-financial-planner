from flask import Flask, request, jsonify, render_template
import os, re
import requests

app = Flask(__name__)
MONTH_RE = re.compile(r"^\d{4}-\d{2}$")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    r = requests.get(
        f"{REST_URL}/transactions",
        headers=HEADERS,
        params={"select": "*", "order": "created_at.desc"},
    )
    r.raise_for_status()
    return jsonify(r.json())


@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    tx = request.json
    if tx.get("type") not in ("income", "expense"):
        return jsonify({"error": "type must be 'income' or 'expense'"}), 400
    try:
        amount = float(tx.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "amount must be a number"}), 400
    if amount <= 0:
        return jsonify({"error": "amount must be greater than 0"}), 400

    row = {
        "type": tx["type"],
        "amount": amount,
        "category": tx.get("category"),
        "description": tx.get("description"),
        "date": tx.get("date"),
    }
    r = requests.post(
        f"{REST_URL}/transactions",
        headers={**HEADERS, "Prefer": "return=representation"},
        json=row,
    )
    r.raise_for_status()
    return jsonify(r.json()[0]), 201


@app.route("/api/transactions/<tx_id>", methods=["DELETE"])
def delete_transaction(tx_id):
    r = requests.delete(
        f"{REST_URL}/transactions",
        headers=HEADERS,
        params={"id": f"eq.{tx_id}"},
    )
    r.raise_for_status()
    return jsonify({"ok": True})


@app.route("/api/budgets", methods=["GET"])
def get_budgets():
    r = requests.get(
        f"{REST_URL}/budgets",
        headers=HEADERS,
        params={"select": "month,limit_amount"},
    )
    r.raise_for_status()
    return jsonify({row["month"]: row["limit_amount"] for row in r.json()})


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

    r = requests.post(
        f"{REST_URL}/budgets",
        headers={**HEADERS, "Prefer": "resolution=merge-duplicates"},
        json={"month": month, "limit_amount": limit},
    )
    r.raise_for_status()
    return jsonify({"month": month, "limit": limit}), 201


if __name__ == "__main__":
    app.run(debug=True, port=8081)
