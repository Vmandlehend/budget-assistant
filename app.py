import json
import csv
import io
from datetime import datetime
from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

EXPENSES_FILE = "data/expenses.json"
BUDGETS_FILE = "data/budgets.json"


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/budgets", methods=["GET"])
def get_budgets():
    return jsonify(load_json(BUDGETS_FILE))


@app.route("/api/budgets", methods=["POST"])
def set_budgets():
    budgets = request.get_json()
    save_json(BUDGETS_FILE, budgets)
    return jsonify({"status": "ok"})


@app.route("/api/expenses", methods=["GET"])
def get_expenses():
    month = request.args.get("month")  # format: YYYY-MM
    expenses = load_json(EXPENSES_FILE)
    if month:
        expenses = [e for e in expenses if e["date"].startswith(month)]
    return jsonify(expenses)


@app.route("/api/expenses", methods=["POST"])
def add_expense():
    data = request.get_json()
    expenses = load_json(EXPENSES_FILE)
    expense = {
        "id": int(datetime.now().timestamp() * 1000),
        "date": data["date"],
        "description": data["description"],
        "category": data["category"],
        "amount": float(data["amount"]),
    }
    expenses.append(expense)
    save_json(EXPENSES_FILE, expenses)
    return jsonify(expense)


@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    expenses = load_json(EXPENSES_FILE)
    expenses = [e for e in expenses if e["id"] != expense_id]
    save_json(EXPENSES_FILE, expenses)
    return jsonify({"status": "ok"})


@app.route("/api/expenses/upload", methods=["POST"])
def upload_csv():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file provided"}), 400

    content = file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))

    expenses = load_json(EXPENSES_FILE)
    budgets = load_json(BUDGETS_FILE)
    categories = list(budgets.keys())
    added = []

    for row in reader:
        # Normalize keys (strip whitespace, lowercase)
        row = {k.strip().lower(): v.strip() for k, v in row.items()}

        date = row.get("date", "")
        description = row.get("description", row.get("name", row.get("merchant", "")))
        amount_str = row.get("amount", row.get("debit", "0")).replace("$", "").replace(",", "")
        category = row.get("category", "Other")

        try:
            amount = abs(float(amount_str))
        except ValueError:
            continue

        if not date or amount == 0:
            continue

        # Match category to known categories
        if category not in categories:
            category = "Other"

        expense = {
            "id": int(datetime.now().timestamp() * 1000) + len(added),
            "date": date,
            "description": description,
            "category": category,
            "amount": amount,
        }
        expenses.append(expense)
        added.append(expense)

    save_json(EXPENSES_FILE, expenses)
    return jsonify({"added": len(added), "expenses": added})


@app.route("/api/summary", methods=["GET"])
def summary():
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    expenses = load_json(EXPENSES_FILE)
    budgets = load_json(BUDGETS_FILE)

    monthly = [e for e in expenses if e["date"].startswith(month)]

    spent = {}
    for e in monthly:
        cat = e["category"]
        spent[cat] = spent.get(cat, 0) + e["amount"]

    result = []
    for cat, budget in budgets.items():
        s = round(spent.get(cat, 0), 2)
        result.append({
            "category": cat,
            "budget": budget,
            "spent": s,
            "remaining": round(budget - s, 2),
            "percent": round((s / budget * 100) if budget > 0 else 0, 1),
        })

    total_budget = sum(budgets.values())
    total_spent = round(sum(spent.values()), 2)

    return jsonify({
        "month": month,
        "categories": result,
        "total_budget": total_budget,
        "total_spent": total_spent,
        "total_remaining": round(total_budget - total_spent, 2),
    })


if __name__ == "__main__":
    app.run(debug=False, port=8080)
