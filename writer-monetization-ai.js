const DATA = {
  revenue: [142, 98, 175, 210, 188, 230, 264, 195, 278, 312, 290, 335],
  reads: [3200, 2800, 4100, 4900, 4400, 5200, 6100, 4700, 6400, 7100, 6800, 7900],
  unlocks: [24, 18, 31, 38, 33, 42, 49, 36, 52, 61, 57, 68],
  labels: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb']
};

const TRANSACTIONS = [
  { date: 'Mar 24', type: 'unlock', book: 'Midnight Inheritance', amount: '+$4.99', cls: 'positive' },
  { date: 'Mar 24', type: 'sub', book: 'The Abyssal Pact', amount: '+$2.30', cls: 'positive' },
  { date: 'Mar 23', type: 'tip', book: 'Ember & Ash', amount: '+$5.00', cls: 'positive' },
  { date: 'Mar 23', type: 'unlock', book: 'Crown of Thorns', amount: '+$4.99', cls: 'positive' },
  { date: 'Mar 22', type: 'sub', book: 'Midnight Inheritance', amount: '+$1.80', cls: 'positive' },
  { date: 'Mar 22', type: 'bonus', book: 'Trending Bonus', amount: '+$25.00', cls: 'positive' },
  { date: 'Mar 21', type: 'unlock', book: 'The Abyssal Pact', amount: '+$4.99', cls: 'positive' },
  { date: 'Mar 20', type: 'payout', book: 'Payout to Stripe', amount: '-$200.00', cls: 'negative' }
];

const TYPE_MAP = {
  unlock: ['unlock', 'Unlock'],
  sub: ['sub', 'Sub Share'],
  bonus: ['bonus', 'Bonus'],
  payout: ['payout', 'Payout'],
  tip: ['tip', 'Tip']
};

const PAYOUTS = [
  { date: 'Mar 1, 2026', amount: '$200.00', status: 'paid', statusLabel: 'Paid' },
  { date: 'Feb 1, 2026', amount: '$180.00', status: 'paid', statusLabel: 'Paid' },
  { date: 'Jan 1, 2026', amount: '$155.00', status: 'paid', statusLabel: 'Paid' }
];

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

function initDonutChart() {
  const ctx = document.getElementById('donutChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Unlocks', 'Subscription', 'Tips', 'Bonuses'],
      datasets: [{
        data: [318, 207, 64, 43],
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
            label: (ctx) => ` $${ctx.raw} (${Math.round((ctx.raw / 632) * 100)}%)`
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

function renderPayouts() {
  document.getElementById('payoutHistory').innerHTML =
    '<div style="font-size:10px;color:var(--text3);margin:10px 0 6px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Payout History</div>' +
    PAYOUTS.map((payout) => `<div class="payout-history-row">
      <span style="color:var(--text2)">${payout.date}</span>
      <span style="font-weight:600;color:var(--text)">${payout.amount}</span>
      <span class="payout-status ${payout.status}">${payout.statusLabel}</span>
    </div>`).join('');
}

function requestPayout() {
  alert('Payout of $384.00 requested! Arriving in 2-3 business days to your Stripe account.');
}

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
  const isFileProtocol = window.location.protocol === "file:";
  const protocol = isFileProtocol ? "http:" : window.location.protocol;
  const host = !isFileProtocol && window.location.hostname ? window.location.hostname : "localhost";
  return `${protocol}//${host}:5002`;
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

document.addEventListener('DOMContentLoaded', () => {
  initMainChart();
  initDonutChart();
  renderTxns();
  renderPayouts();
  loadReferralSummary();
});
