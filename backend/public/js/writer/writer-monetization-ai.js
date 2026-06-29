// DATA is populated from the real API; defaults prevent chart errors before data arrives
const _nowDate = new Date();
const _defaultLabels = [];
for (let _i = 5; _i >= 0; _i--) {
  const _d = new Date(_nowDate.getFullYear(), _nowDate.getMonth() - _i, 1);
  _defaultLabels.push(_d.toLocaleString(undefined, { month: 'short' }));
}
let DATA = {
  revenue: _defaultLabels.map(() => 0),
  reads: _defaultLabels.map(() => 0),
  unlocks: _defaultLabels.map(() => 0),
  labels: _defaultLabels
};

let TRANSACTIONS = [];

const TYPE_MAP = {
  unlock: ['unlock', 'Unlock'],
  sub: ['sub', 'Sub Share'],
  bonus: ['bonus', 'Bonus'],
  payout: ['payout', 'Payout'],
  tip: ['tip', 'Tip']
};

let mainChart;
let currentChartType = 'revenue';

function initMainChart() {
  const ctx = document.getElementById('mainChart').getContext('2d');
  mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: DATA.labels,
      datasets: [{
        data: DATA.revenue,
        borderColor: '#8a6a2a',
        backgroundColor: 'rgba(138,106,42,0.06)',
        borderWidth: 1.5,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#8a6a2a',
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#faf8f4',
          borderColor: 'rgba(60,45,20,0.15)',
          borderWidth: 1,
          titleColor: '#9a8e7a',
          bodyColor: '#1e1a14',
          bodyFont: { size: 12, weight: '600' },
          padding: 8,
          callbacks: {
            label: (ctx) => currentChartType === 'revenue' ? ` $${ctx.raw}` : ` ${ctx.raw}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(60,45,20,0.05)' },
          ticks: { color: '#9a8e7a', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(60,45,20,0.05)' },
          ticks: {
            color: '#9a8e7a',
            font: { size: 11 },
            callback: (value) => currentChartType === 'revenue' ? `$${value}` : value
          },
          border: { dash: [3, 3], color: 'transparent' }
        }
      }
    }
  });
}

let donutChart;
function initDonutChart() {
  const ctx = document.getElementById('donutChart').getContext('2d');
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Referral Earnings', 'Coins', 'AI Credits', 'Reads'],
      datasets: [{
        data: [1, 1, 1, 1],
        backgroundColor: ['#b08838', '#5a4a8a', '#8a3a2a', '#2d5a3d'],
        borderColor: '#faf8f4',
        borderWidth: 3,
        hoverBorderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#faf8f4',
          borderColor: 'rgba(60,45,20,0.15)',
          borderWidth: 1,
          titleColor: '#9a8e7a',
          bodyColor: '#1e1a14',
          callbacks: {
            label: (c) => {
              const d = c.chart.data.datasets[0].data;
              const t = d.reduce((a, b) => a + b, 0);
              return t > 0 ? ` ${c.label}: ${Math.round((c.raw / t) * 100)}%` : ` ${c.label}: N/A`;
            }
          }
        }
      }
    }
  });
}

function switchChart(type, el) {
  document.querySelectorAll('.chart-tab').forEach((tab) => tab.classList.remove('active'));
  el.classList.add('active');
  currentChartType = type;

  const colors = {
    revenue: '#8a6a2a',
    reads: '#2a4a7a',
    unlocks: '#5a4a8a'
  };

  mainChart.data.datasets[0].data = DATA[type];
  mainChart.data.datasets[0].borderColor = colors[type];
  mainChart.data.datasets[0].backgroundColor = `${colors[type]}18`;
  mainChart.update('active');
}

function renderTxns(filter = 'all') {
  document.getElementById('txnBody').innerHTML = TRANSACTIONS
    .filter((txn) => filter === 'all' || txn.type === filter)
    .map((txn) => {
      const [cls, label] = TYPE_MAP[txn.type];
      return `<tr>
        <td style="color:var(--text3)">${txn.date}</td>
        <td><span class="txn-type ${cls}">${label}</span></td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${txn.book}</td>
        <td class="txn-amount ${txn.cls}">${txn.amount}</td>
      </tr>`;
    })
    .join('');
}

function filterTxns(value) {
  renderTxns(value);
}

function loadMoreTxns() {
  alert('Full transaction history export available.');
}

// ── Payout State ──────────────────────────────────────────────────────────────
let _payoutMethodData = null; // null = not loaded yet, false = not connected, object = connected

async function loadPayoutCard() {
  try {
    const base = resolveApiBaseUrl();
    const [methodResp, historyResp] = await Promise.all([
      fetch(`${base}/api/writer/payout/method`, { credentials: 'include', cache: 'no-store' }),
      fetch(`${base}/api/writer/payout/history`, { credentials: 'include', cache: 'no-store' }),
    ]);
    const methodData = methodResp.ok ? await methodResp.json() : null;
    const historyData = historyResp.ok ? await historyResp.json() : null;

    _payoutMethodData = (methodData && methodData.success && methodData.method) ? methodData.method : false;
    renderPayoutCard(_payoutMethodData, historyData && historyData.success ? historyData.requests : []);
  } catch (e) {
    // show no-method state
    _payoutMethodData = false;
    renderPayoutCard(false, []);
  }
}

function renderPayoutCard(method, history) {
  const noWarn = document.getElementById('noMethodWarning');
  const methodDisplay = document.getElementById('payoutMethodDisplay');
  const withdrawBtn = document.getElementById('withdrawBtn');

  if (method) {
    if (noWarn) noWarn.style.display = 'none';
    if (methodDisplay) {
      methodDisplay.style.display = 'flex';
      const icon = document.getElementById('payoutMethodIcon');
      const label = document.getElementById('payoutMethodLabel');
      const type = document.getElementById('payoutMethodType');
      if (icon) icon.textContent = method.method === 'stripe' ? 'ST' : method.method === 'paypal' ? 'PP' : 'BK';
      if (label) label.textContent = method.label;
      if (type) type.textContent = method.method === 'stripe' ? 'Stripe' : method.method === 'paypal' ? 'PayPal' : 'bank account';
    }
    if (withdrawBtn) withdrawBtn.disabled = false;
  } else {
    if (noWarn) noWarn.style.display = 'block';
    if (methodDisplay) methodDisplay.style.display = 'none';
    if (withdrawBtn) withdrawBtn.disabled = false; // clicking opens setup
  }

  // Render payout history
  const histEl = document.getElementById('payoutHistory');
  if (histEl) {
    if (!history || history.length === 0) {
      histEl.innerHTML = '';
      return;
    }
    const rows = history.map(r => {
      const date = new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const statusCls = r.status === 'PAID' ? 'paid' : r.status === 'REJECTED' ? 'rejected' : 'pending';
      const statusLabel = r.status === 'PAID' ? 'Paid' : r.status === 'REJECTED' ? 'Rejected' : 'Pending';
      return `<div class="payout-history-row">
        <span style="color:var(--text2)">${date}</span>
        <span style="font-weight:600;color:var(--text)">$${Number(r.amount).toFixed(2)}</span>
        <span class="payout-status ${statusCls}">${statusLabel}</span>
      </div>`;
    }).join('');
    histEl.innerHTML = '<div style="font-size:10px;color:var(--text3);margin:10px 0 6px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Payout History</div>' + rows;
  }
}

// ── Payout Setup Wizard ───────────────────────────────────────────────────────
let _setupSelectedMethod = null;

function openPayoutSetup() {
  _setupSelectedMethod = null;
  document.querySelectorAll('input[name="payoutMethod"]').forEach(r => r.checked = false);
  ['setupStep2Error', 'setupStep3Error'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  showSetupStep(1);
  const overlay = document.getElementById('payoutSetupOverlay');
  if (overlay) { overlay.style.display = 'flex'; }
}

function closePayoutSetup() {
  const overlay = document.getElementById('payoutSetupOverlay');
  if (overlay) overlay.style.display = 'none';
}

function showSetupStep(n) {
  [1, 2, 3].forEach(i => {
    const step = document.getElementById(`setupStep${i}`);
    const dot = document.getElementById(`dot${i}`);
    if (step) step.style.display = i === n ? 'block' : 'none';
    if (dot) dot.classList.toggle('active', i === n);
  });
}

function setupGoStep1() { showSetupStep(1); }

async function setupGoStep2() {
  const selected = document.querySelector('input[name="payoutMethod"]:checked');
  if (!selected) { alert('Please choose a payout method.'); return; }
  _setupSelectedMethod = selected.value;

  // Stripe → redirect to Stripe Connect onboarding
  if (_setupSelectedMethod === 'stripe') {
    const btn = document.querySelector('#setupStep1 .btn.btn-green');
    if (btn) { btn.disabled = true; btn.textContent = 'Redirecting to Stripe…'; }
    try {
      const base = resolveApiBaseUrl();
      const resp = await fetch(`${base}/api/writer/payout/stripe-connect/onboard`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await resp.json();
      if (!data.success || !data.url) throw new Error(data.error || 'Could not start Stripe onboarding');
      window.location.href = data.url;
    } catch (e) {
      alert(e.message || 'Failed to connect to Stripe. Please try again.');
      if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
    }
    return;
  }

  // PayPal / Bank → show step 2 form
  ['Stripe', 'Paypal', 'Bank'].forEach(m => {
    const el = document.getElementById(`fields${m}`);
    if (el) el.style.display = m.toLowerCase() === _setupSelectedMethod ? 'block' : 'none';
  });
  const nameEl = document.getElementById('setupMethodName');
  if (nameEl) nameEl.textContent = _setupSelectedMethod === 'paypal' ? 'PayPal' : 'bank';
  showSetupStep(2);
}

function setupGoStep3() {
  const errEl = document.getElementById('setupStep2Error');
  if (errEl) errEl.style.display = 'none';
  let label = '', account = '';
  if (_setupSelectedMethod === 'stripe') {
    const email = (document.getElementById('stripeEmail') || {}).value || '';
    const last4 = (document.getElementById('stripeLast4') || {}).value || '';
    if (!email || !last4 || last4.length < 4) {
      if (errEl) { errEl.textContent = 'Please fill in all Stripe fields.'; errEl.style.display = 'block'; }
      return;
    }
    label = `Stripe \u00b7 **** ${last4}`;
    account = email;
  } else if (_setupSelectedMethod === 'paypal') {
    const email = (document.getElementById('paypalEmail') || {}).value || '';
    if (!email) {
      if (errEl) { errEl.textContent = 'Please enter your PayPal email.'; errEl.style.display = 'block'; }
      return;
    }
    label = `PayPal \u00b7 ${email}`;
    account = email;
  } else {
    const routing = (document.getElementById('bankRouting') || {}).value || '';
    const acct = (document.getElementById('bankAccount') || {}).value || '';
    if (!routing || !acct) {
      if (errEl) { errEl.textContent = 'Please fill in routing and account numbers.'; errEl.style.display = 'block'; }
      return;
    }
    label = `Bank \u00b7 **** ${acct.slice(-4)}`;
    account = `Routing: ${routing}`;
  }
  const reviewMethod = document.getElementById('reviewMethod');
  const reviewAccount = document.getElementById('reviewAccount');
  if (reviewMethod) reviewMethod.textContent = label;
  if (reviewAccount) reviewAccount.textContent = account;
  showSetupStep(3);
}

async function confirmPayoutSetup() {
  const btn = document.getElementById('confirmSetupBtn');
  const errEl = document.getElementById('setupStep3Error');
  if (errEl) errEl.style.display = 'none';
  if (btn) btn.disabled = true;

  let label = '', details = {};
  const reviewMethod = (document.getElementById('reviewMethod') || {}).textContent || '';
  const reviewAccount = (document.getElementById('reviewAccount') || {}).textContent || '';
  label = reviewMethod;
  details = { account: reviewAccount };

  try {
    const base = resolveApiBaseUrl();
    const resp = await fetch(`${base}/api/writer/payout/method`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: _setupSelectedMethod, label, details }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Failed to save');
    _payoutMethodData = data.method;
    renderPayoutCard(_payoutMethodData, null);
    closePayoutSetup();
    // Reload history too
    loadPayoutCard();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Could not save. Try again.'; errEl.style.display = 'block'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Withdraw Modal ────────────────────────────────────────────────────────────
function openWithdrawOrSetup() {
  if (!_payoutMethodData) { openPayoutSetup(); return; }
  // Show withdraw modal
  const overlay = document.getElementById('withdrawOverlay');
  const form = document.getElementById('withdrawForm');
  const success = document.getElementById('withdrawSuccess');
  const errEl = document.getElementById('withdrawError');
  const input = document.getElementById('withdrawAmountInput');
  const availLabel = document.getElementById('withdrawAvailLabel');
  if (form) form.style.display = 'block';
  if (success) success.style.display = 'none';
  if (errEl) errEl.style.display = 'none';
  if (input) input.value = '';
  if (availLabel) availLabel.textContent = `$${_availableToWithdraw.toFixed(2)}`;
  if (overlay) overlay.style.display = 'flex';
}

function closeWithdrawModal() {
  const overlay = document.getElementById('withdrawOverlay');
  if (overlay) overlay.style.display = 'none';
}

function setWithdrawAmount(amt) {
  const input = document.getElementById('withdrawAmountInput');
  if (input) input.value = Math.min(amt, _availableToWithdraw).toFixed(2);
}

function setWithdrawAmountMax() {
  const input = document.getElementById('withdrawAmountInput');
  if (input) input.value = _availableToWithdraw.toFixed(2);
}

async function submitWithdraw() {
  const input = document.getElementById('withdrawAmountInput');
  const errEl = document.getElementById('withdrawError');
  if (errEl) errEl.style.display = 'none';
  const amount = parseFloat((input || {}).value || '0');
  if (!amount || amount <= 0) {
    if (errEl) { errEl.textContent = 'Please enter an amount.'; errEl.style.display = 'block'; } return;
  }
  if (amount > _availableToWithdraw) {
    if (errEl) { errEl.textContent = `Amount exceeds your available balance of $${_availableToWithdraw.toFixed(2)}.`; errEl.style.display = 'block'; } return;
  }
  try {
    const base = resolveApiBaseUrl();
    const resp = await fetch(`${base}/api/writer/payout/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Failed to submit');
    // Deduct locally
    _availableToWithdraw = Math.max(0, _availableToWithdraw - amount);
    const balEl = document.getElementById('payoutBalanceAmount');
    if (balEl) balEl.textContent = `$${_availableToWithdraw.toFixed(2)}`;
    // Show success screen
    const form = document.getElementById('withdrawForm');
    const success = document.getElementById('withdrawSuccess');
    const msg = document.getElementById('withdrawSuccessMsg');
    if (form) form.style.display = 'none';
    if (msg) msg.textContent = `$${amount.toFixed(2)} withdrawal submitted. Arriving in 2-3 business days.`;
    if (success) success.style.display = 'block';
    // Refresh history after a moment
    setTimeout(() => loadPayoutCard(), 800);
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Could not submit. Try again.'; errEl.style.display = 'block'; }
  }
}

function requestPayout() { openWithdrawOrSetup(); }

function exportData() {
  alert('CSV export generated! Check your downloads.');
}

function copyCode(event) {
  const box = document.getElementById("referralLinkBox");
  const link = box ? box.textContent.replace("Copy Link", "").trim() : "https://novara.app/signup";
  navigator.clipboard.writeText(link).catch(() => {});
  const button = event.currentTarget;
  button.textContent = 'Copied!';
  setTimeout(() => {
    button.textContent = 'Copy Link';
  }, 2000);
}

function resolveApiBaseUrl() {
  if (window.NovaraSession && window.NovaraSession.API_BASE_URL) {
    return window.NovaraSession.API_BASE_URL;
  }
  return "https://novara-6s67.onrender.com";
}

function bindReferralCopyButton(link) {
  const button = document.getElementById("refCopyBtn");
  if (!button) {
    return;
  }

  button.onclick = (event) => {
    navigator.clipboard.writeText(link).catch(() => {});
    const el = event.currentTarget;
    el.textContent = "Copied!";
    setTimeout(() => {
      el.textContent = "Copy Link";
    }, 1800);
  };
}

function applyReferralSummary(summary) {
  if (!summary) {
    return;
  }

  const invited = document.getElementById("refStatInvited");
  const completed = document.getElementById("refStatCompleted");
  const earned = document.getElementById("refStatEarned");
  const pending = document.getElementById("refPendingText");
  const rewardConfig = document.getElementById("refRewardConfig");
  const linkBox = document.getElementById("referralLinkBox");

  if (invited) invited.textContent = String(summary.stats.total || 0);
  if (completed) completed.textContent = String(summary.stats.completed || 0);
  if (earned) earned.textContent = `$${Number(summary.stats.totalEarned || 0).toFixed(2)}`;
  if (pending) pending.textContent = `${Number(summary.stats.pending || 0)} referrals pending completion`;
  if (rewardConfig) {
    rewardConfig.textContent = `Earn $${Number(summary.rewardConfig.cashAmount || 0).toFixed(2)} + ${Number(summary.rewardConfig.aiCredits || 0)} AI credits when your referral becomes an active writer.`;
  }

  const link = summary.referralLink || `novara.app/signup?ref=${summary.referralCode || ""}`;
  if (linkBox) {
    linkBox.innerHTML = `${link}<button class="copy-btn" id="refCopyBtn">Copy Link</button>`;
  }
  bindReferralCopyButton(link);
}

function renderRealBooks(books) {
  const container = document.getElementById('topBooksContainer');
  if (!container) return;
  const sorted = [...books].sort((a, b) => (b.reads || 0) - (a.reads || 0)).slice(0, 5);
  if (!sorted.length) {
    container.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:12px 0;">No books yet. Start writing to see your stats here.</p>';
    return;
  }
  const palette = [
    'linear-gradient(135deg,#3a1a5e,#7b3fa0)',
    'linear-gradient(135deg,#1a2e3a,#2a7a8a)',
    'linear-gradient(135deg,#3a2010,#a05020)',
    'linear-gradient(135deg,#1a3a2a,#2a8a5a)',
    'linear-gradient(135deg,#2a1a3e,#5a3a8a)',
  ];
  container.innerHTML = sorted.map((book, i) => {
    const initials = book.title.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const rankCls = i < 2 ? 'book-rank top' : 'book-rank';
    const statusLabel = book.status === 'PUBLISHED' ? '&#x25CF; Live' : '&#x25CB; Draft';
    const statusCls = book.status === 'PUBLISHED' ? 'up' : 'neutral';
    return `<div class="book-item">
      <div class="${rankCls}">${i + 1}</div>
      <div class="book-cover" style="background:${palette[i % palette.length]};">${initials}</div>
      <div class="book-info">
        <div class="book-title">${book.title}</div>
        <div class="book-meta">${book.genre || 'Fiction'} &middot; ${book.chapters || 0} ch &middot; ${(book.reads || 0).toLocaleString()} reads</div>
      </div>
      <div>
        <div class="book-earnings">${(book.reads || 0).toLocaleString()} reads</div>
        <div class="book-trend ${statusCls}">${statusLabel}</div>
      </div>
    </div>`;
  }).join('');
}

let _availableToWithdraw = 0;

async function loadAndApplyDashboard() {
  try {
    const base = resolveApiBaseUrl();
    const resp = await fetch(`${base}/api/writer/dashboard`, { credentials: 'include', cache: 'no-store' });
    if (!resp.ok) return;
    const payload = await resp.json();
    if (!payload.success || !payload.data) return;

    const { stats, monetization, analytics, books } = payload.data;
    const totalEarned = Number(monetization.estimatedRevenue || 0);
    const coins = Number(monetization.coinsEarned || 0);
    const totalReads = Number(stats.totalReads || 0);
    const publishedBooks = Number(stats.publishedBooks || 0);
    const totalBooks = Number(stats.totalBooks || 0);
    const refs = monetization.referrals || {};
    const coinsByType = monetization.coinsByType || {
      gifts: 0,
      chapterUnlocks: 0,
      referrals: 0,
      ads: 0,
      other: 0,
    };

    _availableToWithdraw = totalEarned;

    const el = id => document.getElementById(id);

    if (el('statTotalEarnings')) el('statTotalEarnings').textContent = `$${totalEarned.toFixed(2)}`;
    if (el('statTotalEarningsChange')) {
      el('statTotalEarningsChange').textContent = refs.completed > 0
        ? `From ${refs.completed} referral${refs.completed !== 1 ? 's' : ''}`
        : 'No earnings yet';
      el('statTotalEarningsChange').className = `stat-change ${totalEarned > 0 ? 'up' : 'neutral'}`;
    }

    if (el('statCoins')) el('statCoins').textContent = coins.toLocaleString();
    if (el('statCoinsChange')) el('statCoinsChange').textContent = refs.total > 0
      ? `${refs.total} referral${refs.total !== 1 ? 's' : ''} total`
      : 'Invite writers to earn';

    if (el('statTotalReads')) el('statTotalReads').textContent = totalReads.toLocaleString();
    if (el('statTotalReadsChange')) el('statTotalReadsChange').textContent = totalBooks > 0
      ? `Across ${totalBooks} book${totalBooks !== 1 ? 's' : ''}`
      : 'No books yet';

    if (el('statPublished')) el('statPublished').textContent = publishedBooks;
    if (el('statPublishedChange')) {
      const drafts = totalBooks - publishedBooks;
      el('statPublishedChange').textContent = drafts > 0 ? `${drafts} in draft` : 'All books published';
    }

    if (el('payoutBalanceAmount')) el('payoutBalanceAmount').textContent = `$${totalEarned.toFixed(2)}`;

    // Update chart with real reads-over-time data
    const readsOverTime = analytics.readsOverTime || [];
    if (readsOverTime.length && mainChart) {
      DATA.labels = readsOverTime.map(r => r.month);
      DATA.reads = readsOverTime.map(r => r.value);
      DATA.revenue = readsOverTime.map(() => 0);
      DATA.unlocks = readsOverTime.map(() => 0);
      const readColor = '#2a4a7a';
      mainChart.data.labels = DATA.labels;
      mainChart.data.datasets[0].data = DATA.reads;
      mainChart.data.datasets[0].borderColor = readColor;
      mainChart.data.datasets[0].backgroundColor = `${readColor}18`;
      currentChartType = 'reads';
      mainChart.update();
      document.querySelectorAll('.chart-tab').forEach(t => {
        const onclick = t.getAttribute('onclick') || '';
        t.classList.toggle('active', onclick.includes("'reads'"));
      });
    }

    // Render real books
    if (books && books.length) renderRealBooks(books);

    // ── Revenue Sources ──────────────────────────────────────────
    const aiCredits = Number(refs.totalCreditsEarned || 0);
    const totalFavorites = Number(stats.totalFavorites || 0);
    const totalChapters = Number(stats.totalChapters || 0);

    // Bar widths: each source normalized to its own natural scale
    const revMax = Math.max(totalEarned, 0.01);
    const coinMax = Math.max(coins, 1);
    const creditMax = Math.max(aiCredits, 1);
    const readMax = Math.max(totalReads, 1);

    if (el('revSource1Amount')) el('revSource1Amount').textContent = `$${totalEarned.toFixed(2)}`;
    if (el('revSource1Fill')) el('revSource1Fill').style.width = `${Math.min(100, (totalEarned / revMax) * 100).toFixed(0)}%`;

    if (el('revSource2Amount')) el('revSource2Amount').textContent = `${coins.toLocaleString()} coins`;
    if (el('revSource2Fill')) el('revSource2Fill').style.width = `${Math.min(100, (coins / coinMax) * 100).toFixed(0)}%`;

    if (el('revSource3Amount')) el('revSource3Amount').textContent = `${aiCredits.toLocaleString()} credits`;
    if (el('revSource3Fill')) el('revSource3Fill').style.width = `${Math.min(100, (aiCredits / creditMax) * 100).toFixed(0)}%`;

    if (el('revSource4Amount')) el('revSource4Amount').textContent = totalReads >= 1000 ? `${(totalReads / 1000).toFixed(1)}k` : totalReads.toString();
    if (el('revSource4Fill')) el('revSource4Fill').style.width = `${Math.min(100, (totalReads / readMax) * 100).toFixed(0)}%`;

    // ── Coin Earnings Breakdown ─────────────────────────────────────
    const coinMax = Math.max(coins, 1);
    if (el('coinGiftsAmount')) el('coinGiftsAmount').textContent = `${coinsByType.gifts.toLocaleString()} coins`;
    if (el('coinGiftsFill')) el('coinGiftsFill').style.width = `${Math.min(100, (coinsByType.gifts / coinMax) * 100).toFixed(0)}%`;

    if (el('coinUnlocksAmount')) el('coinUnlocksAmount').textContent = `${coinsByType.chapterUnlocks.toLocaleString()} coins`;
    if (el('coinUnlocksFill')) el('coinUnlocksFill').style.width = `${Math.min(100, (coinsByType.chapterUnlocks / coinMax) * 100).toFixed(0)}%`;

    if (el('coinReferralsAmount')) el('coinReferralsAmount').textContent = `${coinsByType.referrals.toLocaleString()} coins`;
    if (el('coinReferralsFill')) el('coinReferralsFill').style.width = `${Math.min(100, (coinsByType.referrals / coinMax) * 100).toFixed(0)}%`;

    if (el('coinAdsAmount')) el('coinAdsAmount').textContent = `${coinsByType.ads.toLocaleString()} coins`;
    if (el('coinAdsFill')) el('coinAdsFill').style.width = `${Math.min(100, (coinsByType.ads / coinMax) * 100).toFixed(0)}%`;

    if (el('coinOtherAmount')) el('coinOtherAmount').textContent = `${coinsByType.other.toLocaleString()} coins`;
    if (el('coinOtherFill')) el('coinOtherFill').style.width = `${Math.min(100, (coinsByType.other / coinMax) * 100).toFixed(0)}%`;

    if (donutChart) {
      donutChart.data.datasets[0].data = [
        Math.max(totalEarned, 0),
        Math.max(coins / 100, 0),
        Math.max(aiCredits / 100, 0),
        Math.max(totalReads / 1000, 0)
      ];
      // If everything is zero show a neutral placeholder
      const donutSum = donutChart.data.datasets[0].data.reduce((a, b) => a + b, 0);
      if (donutSum === 0) donutChart.data.datasets[0].data = [1, 1, 1, 1];
      donutChart.update();
    }

    // ── Monthly Goals ─────────────────────────────────────────────
    const GOALS = { books: 5, chapters: 20, reads: 1000, favorites: 50, referrals: 5 };

    function applyGoal(progressId, fillId, current, goal, label) {
      const pct = Math.min(100, goal > 0 ? Math.round((current / goal) * 100) : 0);
      if (el(progressId)) el(progressId).textContent = label(current, goal);
      if (el(fillId)) el(fillId).style.width = `${pct}%`;
      return pct >= 100;
    }

    const fmt = (c, g) => `${c} / ${g}`;
    const fmtReads = (c, g) => c >= 1000 ? `${(c / 1000).toFixed(1)}k / ${(g / 1000).toFixed(0)}k` : fmt(c, g);

    let metCount = 0;
    if (applyGoal('goal1Progress', 'goal1Fill', publishedBooks, GOALS.books, fmt)) metCount++;
    if (applyGoal('goal2Progress', 'goal2Fill', totalChapters, GOALS.chapters, fmt)) metCount++;
    if (applyGoal('goal3Progress', 'goal3Fill', totalReads, GOALS.reads, fmtReads)) metCount++;
    if (applyGoal('goal4Progress', 'goal4Fill', totalFavorites, GOALS.favorites, fmt)) metCount++;
    if (applyGoal('goal5Progress', 'goal5Fill', Number(refs.total || 0), GOALS.referrals, fmt)) metCount++;

    if (el('goalsMetBadge')) {
      el('goalsMetBadge').textContent = `${metCount} / 5 Met`;
      el('goalsMetBadge').className = `badge ${metCount >= 3 ? 'badge-green' : metCount > 0 ? 'badge-purple' : 'badge-neutral'}`;
    }

    // Milestone rewards
    const milestone1Met = totalReads >= 1000;
    const milestone3Met = Number(refs.total || 0) >= 5;
    const earnedPct = Math.min(100, Math.round((totalEarned / 100) * 100));

    if (el('milestone1Badge')) {
      el('milestone1Badge').textContent = milestone1Met ? 'Unlocked' : 'Locked';
      el('milestone1Badge').className = `badge ${milestone1Met ? 'badge-gold' : 'badge-neutral'}`;
    }
    if (el('milestone2Progress')) el('milestone2Progress').textContent = `$${totalEarned.toFixed(2)} / $100`;
    if (el('milestone2Pct')) {
      el('milestone2Pct').textContent = `${earnedPct}%`;
      el('milestone2Pct').className = `badge ${earnedPct >= 100 ? 'badge-gold' : 'badge-purple'}`;
    }
    if (el('milestone3Badge')) {
      el('milestone3Badge').textContent = milestone3Met ? 'Unlocked' : 'Locked';
      el('milestone3Badge').className = `badge ${milestone3Met ? 'badge-gold' : 'badge-neutral'}`;
    }

    // ── Writing Assistant ─────────────────────────────────────────
    const creditBarMax = Math.max(aiCredits, 100);
    const chapterBarMax = Math.max(totalChapters, 10);

    if (el('aiPlanBadge')) {
      el('aiPlanBadge').textContent = publishedBooks > 0 ? 'Active Writer' : 'New Writer';
      el('aiPlanBadge').className = `badge ${publishedBooks > 0 ? 'badge-purple' : 'badge-neutral'}`;
    }
    if (el('aiCreditsValue')) el('aiCreditsValue').textContent = aiCredits.toLocaleString();
    if (el('aiCreditsFill')) el('aiCreditsFill').style.width = `${Math.round((aiCredits / creditBarMax) * 100)}%`;
    if (el('aiChaptersValue')) el('aiChaptersValue').textContent = `${totalChapters}`;
    if (el('aiChaptersFill')) el('aiChaptersFill').style.width = `${Math.round((totalChapters / chapterBarMax) * 100)}%`;
    if (el('aiTotalReadsValue')) el('aiTotalReadsValue').textContent = totalReads >= 1000 ? `${(totalReads / 1000).toFixed(1)}k` : totalReads.toString();
    if (el('aiRoiValue')) el('aiRoiValue').textContent = `+$${totalEarned.toFixed(2)}`;
    if (el('aiInsightText')) {
      let insight;
      if (publishedBooks === 0) {
        insight = '<strong>Get started!</strong> Publish your first book to begin building your audience and earning rewards.';
      } else if (totalReads === 0) {
        insight = `<strong>You're published!</strong> You have ${publishedBooks} book${publishedBooks !== 1 ? 's' : ''} live. Share them to attract readers.`;
      } else {
        const avgReads = Math.round(totalReads / publishedBooks);
        insight = `<strong>Great work!</strong> Your ${publishedBooks} book${publishedBooks !== 1 ? 's' : ''} average <strong>${avgReads.toLocaleString()} reads</strong> each. Keep writing to grow your audience.`;
      }
      el('aiInsightText').innerHTML = insight;
    }

  } catch (e) {
    // Fail silently — static UI remains as fallback
  }
}

async function loadReferralSummary() {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}/api/writer/referrals`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    if (!payload || !payload.success || !payload.data) {
      return;
    }
    applyReferralSummary(payload.data);
  } catch (error) {
    // Keep static fallback UI if request fails.
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initMainChart();
  initDonutChart();
  renderTxns();
  loadReferralSummary();
  loadAndApplyDashboard();

  // Handle Stripe Connect return / refresh
  const params = new URLSearchParams(window.location.search);
  if (params.has('stripe_return') || params.has('stripe_refresh')) {
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);

    if (params.has('stripe_refresh')) {
      // Stripe said the link expired — restart onboarding
      try {
        const base = resolveApiBaseUrl();
        const resp = await fetch(`${base}/api/writer/payout/stripe-connect/onboard`, { method: 'POST', credentials: 'include' });
        const data = await resp.json();
        if (data.success && data.url) { window.location.href = data.url; return; }
      } catch (_) {}
    }

    if (params.has('stripe_return')) {
      // Check if onboarding was completed
      try {
        const base = resolveApiBaseUrl();
        const resp = await fetch(`${base}/api/writer/payout/stripe-connect/status`, { credentials: 'include' });
        const data = await resp.json();
        if (data.success && data.connected) {
          await loadPayoutCard();
          // Show a brief success banner
          const banner = document.createElement('div');
          banner.textContent = '✓ Stripe account connected! You can now withdraw your earnings.';
          Object.assign(banner.style, {
            position:'fixed', top:'20px', left:'50%', transform:'translateX(-50%)',
            background:'var(--green)', color:'#fff', padding:'12px 22px',
            borderRadius:'10px', fontWeight:'600', fontSize:'13.5px',
            zIndex:'9999', boxShadow:'0 4px 16px rgba(0,0,0,.2)',
          });
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 4000);
          return;
        }
      } catch (_) {}
      // Onboarding not finished — reopen setup
      await loadPayoutCard();
      openPayoutSetup();
    }
  } else {
    loadPayoutCard();
  }
});

