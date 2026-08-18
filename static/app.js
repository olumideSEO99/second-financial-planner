/* ── STATE ───────────────────────────────────────────────── */
const state = {
  transactions: [],
  budgets: {},
  txType: 'income',
};

/* ── CATEGORIES ─────────────────────────────────────────────
   Single source of truth for both the form's category options
   and the chart's color/label mapping. Expense categories keep
   a fixed slot color (colorLight/colorDark) — the slot is tied
   to the category, never to its position in a sorted list. */
const CATEGORIES = {
  income: [
    { key: 'salary',     label: 'Salary',     var: '--inc-series-1' },
    { key: 'freelance',  label: 'Freelance',  var: '--inc-series-2' },
    { key: 'investment', label: 'Investment', var: '--inc-series-3' },
    { key: 'gift',       label: 'Gift',       var: '--inc-series-4' },
    { key: 'other',      label: 'Other',      var: '--inc-series-5' },
  ],
  expense: [
    { key: 'food',          label: 'Food',         var: '--series-1' },
    { key: 'rent',          label: 'Rent',          var: '--series-2' },
    { key: 'transport',     label: 'Transport',     var: '--series-3' },
    { key: 'utilities',     label: 'Utilities',     var: '--series-4' },
    { key: 'entertainment', label: 'Entertainment', var: '--series-5' },
    { key: 'settlement',    label: 'Settlement',    var: '--series-6' },
    { key: 'shopping',      label: 'Shopping',      var: '--series-7' },
    { key: 'other',         label: 'Other',         var: '--series-8' },
  ],
};

/* ── API HELPERS ─────────────────────────────────────────── */
async function handle(r) {
  let body = null;
  try { body = await r.json(); } catch (_) { /* no body */ }
  if (!r.ok) throw new Error((body && body.error) || `Request failed (${r.status})`);
  return body;
}
const api = {
  async get(url)        { return handle(await fetch(url)); },
  async post(url, body) { return handle(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); },
  async del(url)         { return handle(await fetch(url, { method: 'DELETE' })); },
};

/* ── TOAST ───────────────────────────────────────────────── */
function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ── BUDGET ──────────────────────────────────────────────── */
const Budget = {
  async load() {
    try {
      state.transactions = await api.get('/api/transactions');
      this.render();
    } catch (err) {
      document.getElementById('transactions-list').innerHTML =
        `<div class="empty-msg empty-msg-error">Couldn't load transactions. ${esc(err.message || '')}</div>`;
      toast('Couldn\'t load transactions', true);
    }
  },

  render() {
    this.renderSummary();
    this.renderList();
    Chart.render();
    this.renderCategoryGroups();
    MonthlyBudget.render();
  },

  renderSummary() {
    const income  = state.transactions.filter(t => t.type === 'income').reduce((s, t) => s + +t.amount, 0);
    const expense = state.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + +t.amount, 0);
    const balance = income - expense;

    document.getElementById('total-income').textContent = fmt(income);
    document.getElementById('total-expenses').textContent = fmt(expense);
    const balEl = document.getElementById('balance');
    balEl.textContent = fmt(balance);
    balEl.classList.toggle('negative', balance < 0);
  },

  renderList() {
    const filter = document.getElementById('budget-filter').value;
    const list = filter === 'all' ? state.transactions : state.transactions.filter(t => t.type === filter);
    const container = document.getElementById('transactions-list');

    if (!list.length) {
      container.innerHTML = '<div class="empty-msg">No transactions yet</div>';
      return;
    }

    container.innerHTML = list.map(t => {
      const cat = categoryOf(t);
      return `
      <div class="tx-item" data-id="${t.id}">
        <div class="tx-info">
          <div class="tx-desc-row">
            <span class="tx-desc">${esc(t.description || cat.label)}</span>
            <span class="cat-tag cat-tag-${t.type}" style="--tag-color:var(${cat.var})">${esc(cat.label)}</span>
          </div>
          <div class="tx-meta">${t.date}</div>
        </div>
        <span class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</span>
        <button class="delete-btn" data-id="${t.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    `;
    }).join('');

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api.del(`/api/transactions/${btn.dataset.id}`);
          state.transactions = state.transactions.filter(t => t.id !== btn.dataset.id);
          this.render();
          toast('Transaction deleted');
        } catch (err) {
          toast(err.message || 'Could not delete transaction', true);
        }
      });
    });
  },

  renderCategoryGroups() {
    const container = document.getElementById('category-groups');

    if (!state.transactions.length) {
      container.innerHTML = '<div class="empty-msg">No transactions yet</div>';
      return;
    }

    // Fixed order: expense categories first, then income — same categories
    // never move groups regardless of how many transactions land in them.
    const groups = [];
    ['expense', 'income'].forEach(type => {
      CATEGORIES[type].forEach(cat => {
        const txs = state.transactions.filter(t => t.type === type && t.category === cat.key);
        if (txs.length) groups.push({ type, cat, txs, total: txs.reduce((s, t) => s + +t.amount, 0) });
      });
    });

    container.innerHTML = groups.map(g => `
      <div class="category-group">
        <div class="category-group-header">
          <span class="tx-dot ${g.type}"></span>
          <span class="category-group-label">${esc(g.cat.label)}</span>
          <span class="category-group-count">${g.txs.length}</span>
          <span class="category-group-total ${g.type}">${g.type === 'income' ? '+' : '-'}${fmt(g.total)}</span>
        </div>
        <div class="category-group-list">
          ${g.txs.map(t => `
            <div class="category-tx-row">
              <span class="category-tx-date">${t.date}</span>
              <span class="category-tx-desc">${esc(t.description || g.cat.label)}</span>
              <span class="category-tx-amount ${g.type}">${g.type === 'income' ? '+' : '-'}${fmt(t.amount)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  },

  populateCategoryOptions() {
    const sel = document.getElementById('tx-category');
    sel.innerHTML = CATEGORIES[state.txType].map(c => `<option value="${c.key}">${esc(c.label)}</option>`).join('');
  },

  bindForm() {
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.txType = btn.dataset.val;
        document.getElementById('tx-type').value = state.txType;
        this.populateCategoryOptions();
      });
    });

    this.populateCategoryOptions();
    document.getElementById('tx-date').value = today();

    document.getElementById('budget-form').addEventListener('submit', async e => {
      e.preventDefault();
      const amountInput = document.getElementById('tx-amount');
      const amount = parseFloat(amountInput.value);
      if (isNaN(amount) || amount <= 0) {
        toast('Enter an amount greater than 0', true);
        amountInput.focus();
        return;
      }
      const tx = {
        type: state.txType,
        amount,
        category: document.getElementById('tx-category').value,
        description: document.getElementById('tx-desc').value,
        date: document.getElementById('tx-date').value,
      };
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const saved = await api.post('/api/transactions', tx);
        state.transactions.unshift(saved);
        this.render();
        e.target.reset();
        document.getElementById('tx-date').value = today();
        this.populateCategoryOptions();
        toast('Transaction added ✓');
      } catch (err) {
        toast(err.message || 'Could not add transaction', true);
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById('budget-filter').addEventListener('change', () => this.renderList());
  },
};

/* ── CHART: horizontal bar, spending by category ────────── */
const Chart = {
  computeTotals() {
    const totals = {};
    state.transactions
      .filter(t => t.type === 'expense')
      .forEach(t => { totals[t.category] = (totals[t.category] || 0) + +t.amount; });

    const total = Object.values(totals).reduce((s, v) => s + v, 0);
    if (total === 0) return { total: 0, rows: [] };

    const rows = CATEGORIES.expense
      .filter(c => totals[c.key] > 0)
      .map(c => ({ ...c, amount: totals[c.key], pct: totals[c.key] / total * 100 }))
      .sort((a, b) => b.amount - a.amount);

    return { total, rows };
  },

  render() {
    const { total, rows } = this.computeTotals();
    const container = document.getElementById('chart-container');

    if (total === 0) {
      container.innerHTML = '<div class="empty-msg">No expenses yet — add one to see your breakdown</div>';
      return;
    }

    container.innerHTML = rows.map(r => `
      <div class="bar-row" tabindex="0" aria-label="${esc(r.label)}: ${fmt(r.amount)}, ${r.pct.toFixed(0)} percent">
        <span class="bar-cat-label">${esc(r.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${r.pct}%;background:var(${r.var})"></span></span>
        <span class="bar-value">${fmt(r.amount)} · ${r.pct.toFixed(0)}%</span>
      </div>
    `).join('');
  },
};

/* ── MONTHLY BUDGET ──────────────────────────────────────── */
const MonthlyBudget = {
  async load() {
    try {
      state.budgets = await api.get('/api/budgets');
      this.render();
    } catch (err) {
      toast('Couldn\'t load budget', true);
    }
  },

  spentThisMonth() {
    const month = currentMonth();
    return state.transactions
      .filter(t => t.type === 'expense' && (t.date || '').slice(0, 7) === month)
      .reduce((s, t) => s + +t.amount, 0);
  },

  render() {
    const month = currentMonth();
    document.getElementById('budget-month-title').textContent = `Monthly Budget — ${monthLabel(month)}`;

    const input = document.getElementById('budget-limit-input');
    const limit = state.budgets[month];
    if (document.activeElement !== input) {
      input.value = limit != null ? limit : '';
    }

    const container = document.getElementById('budget-progress');
    if (limit == null) {
      container.innerHTML = '<div class="empty-msg">No budget set for this month yet — enter one above</div>';
      return;
    }

    const spent = this.spentThisMonth();
    const pct = limit > 0 ? (spent / limit * 100) : (spent > 0 ? 100 : 0);
    const over = spent > limit;

    container.innerHTML = `
      <div class="budget-progress-track">
        <div class="budget-progress-fill ${over ? 'over' : ''}" style="width:${Math.min(pct, 100)}%"></div>
      </div>
      <div class="budget-progress-text ${over ? 'over' : ''}">
        ${fmt(spent)} of ${fmt(limit)} spent (${pct.toFixed(0)}%)${over ? ' · Over budget!' : ''}
      </div>
    `;
  },

  bindForm() {
    document.getElementById('budget-limit-form').addEventListener('submit', async e => {
      e.preventDefault();
      const input = document.getElementById('budget-limit-input');
      const limit = parseFloat(input.value);
      if (isNaN(limit) || limit < 0) {
        toast('Enter a valid budget amount', true);
        input.focus();
        return;
      }
      try {
        const month = currentMonth();
        await api.post('/api/budgets', { month, limit });
        state.budgets[month] = limit;
        this.render();
        toast('Budget saved ✓');
      } catch (err) {
        toast(err.message || 'Could not save budget', true);
      }
    });
  },
};

/* ── UTILS ───────────────────────────────────────────────── */
function categoryOf(t) {
  const list = CATEGORIES[t.type] || [];
  const match = list.find(c => c.key === t.category);
  return match || { key: t.category, label: t.category || 'Other', var: '--muted' };
}
function fmt(n) {
  return '$' + (+n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Budget.bindForm();
  MonthlyBudget.bindForm();
  Budget.load();
  MonthlyBudget.load();
});
