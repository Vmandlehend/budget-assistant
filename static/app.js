const fmt = (n) => `$${Number(n).toFixed(2)}`;

const now = new Date();
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const monthPicker = document.getElementById("monthPicker");
monthPicker.value = defaultMonth;

let budgets = {};
let currentMonth = defaultMonth;

async function loadBudgets() {
  const res = await fetch("/api/budgets");
  budgets = await res.json();
  renderBudgetForm();
  populateCategorySelect();
}

async function loadSummary() {
  const res = await fetch(`/api/summary?month=${currentMonth}`);
  const data = await res.json();

  document.getElementById("totalBudget").textContent = fmt(data.total_budget);
  document.getElementById("totalSpent").textContent = fmt(data.total_spent);

  const rem = document.getElementById("totalRemaining");
  rem.textContent = fmt(data.total_remaining);
  rem.style.color = data.total_remaining < 0 ? "#ef4444" : data.total_remaining < data.total_budget * 0.1 ? "#f59e0b" : "#22c55e";

  renderCategories(data.categories);
}

async function loadExpenses() {
  const res = await fetch(`/api/expenses?month=${currentMonth}`);
  const expenses = await res.json();
  renderExpenses(expenses);
  document.getElementById("expenseMonth").textContent = `(${currentMonth})`;
}

function renderCategories(categories) {
  const grid = document.getElementById("categoryGrid");
  grid.innerHTML = "";

  categories.forEach((cat) => {
    const pct = Math.min(cat.percent, 100);
    const statusClass = cat.percent >= 100 ? "status-over" : cat.percent >= 80 ? "status-warn" : "status-ok";
    const overText = cat.remaining < 0 ? `Over by ${fmt(Math.abs(cat.remaining))}` : `${fmt(cat.remaining)} left`;

    const card = document.createElement("div");
    card.className = "cat-card";
    card.innerHTML = `
      <div class="cat-header">
        <span class="cat-name">${cat.category}</span>
        <span class="cat-amounts">${fmt(cat.spent)} / ${fmt(cat.budget)}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${statusClass}" style="width: ${pct}%"></div>
      </div>
      <div class="cat-remaining ${cat.remaining < 0 ? "over" : ""}">${cat.percent.toFixed(1)}% used &mdash; ${overText}</div>
    `;
    grid.appendChild(card);
  });
}

function renderExpenses(expenses) {
  const tbody = document.getElementById("expenseBody");
  tbody.innerHTML = "";

  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  sorted.forEach((e) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.date}</td>
      <td>${e.description}</td>
      <td>${e.category}</td>
      <td>${fmt(e.amount)}</td>
      <td><button class="delete-btn" data-id="${e.id}" title="Delete">&#x2715;</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/expenses/${btn.dataset.id}`, { method: "DELETE" });
      refresh();
    });
  });
}

function renderBudgetForm() {
  const container = document.getElementById("budgetInputs");
  container.innerHTML = "";
  Object.entries(budgets).forEach(([cat, amount]) => {
    const div = document.createElement("div");
    div.className = "budget-field";
    div.innerHTML = `
      <label>${cat}</label>
      <input type="number" name="${cat}" value="${amount}" min="0" step="1" />
    `;
    container.appendChild(div);
  });
}

function populateCategorySelect() {
  const sel = document.getElementById("expCategory");
  sel.innerHTML = "";
  Object.keys(budgets).forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });
}

document.getElementById("expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    date: document.getElementById("expDate").value,
    description: document.getElementById("expDesc").value,
    category: document.getElementById("expCategory").value,
    amount: document.getElementById("expAmount").value,
  };
  await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  e.target.reset();
  document.getElementById("expDate").value = new Date().toISOString().split("T")[0];
  refresh();
});

document.getElementById("budgetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const inputs = e.target.querySelectorAll("input[name]");
  const updated = {};
  inputs.forEach((inp) => { updated[inp.name] = parseFloat(inp.value) || 0; });
  await fetch("/api/budgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  budgets = updated;
  refresh();
});

document.getElementById("csvUpload").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById("uploadStatus");
  status.textContent = "Uploading...";

  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/expenses/upload", { method: "POST", body: form });
  const data = await res.json();
  status.textContent = `Added ${data.added} expense(s)`;
  e.target.value = "";
  refresh();
});

monthPicker.addEventListener("change", () => {
  currentMonth = monthPicker.value;
  refresh();
});

async function refresh() {
  await Promise.all([loadSummary(), loadExpenses()]);
}

// Set today's date as default in the expense form
document.getElementById("expDate").value = new Date().toISOString().split("T")[0];

// Init
loadBudgets().then(refresh);
