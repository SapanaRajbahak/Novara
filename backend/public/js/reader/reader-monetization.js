// Prevent duplicate chapter reward calls
let chapterRewardGiven = false;

// Call this when reading progress updates
function handleReadingProgress(progress, chapterId) {
  if (progress >= 100 && !chapterRewardGiven) {
    chapterRewardGiven = true;
    claimChapterReward(chapterId);
  }
}

// Call this when a new chapter loads to reset the reward flag
function resetChapterRewardFlag() {
  chapterRewardGiven = false;
}

// Example usage:
// resetChapterRewardFlag() should be called whenever a new chapter is loaded
const CFG = {
  STARTING_BALANCE: 40,
  COINS_PER_CHAPTER: 10,
  CHECKIN_REWARDS: [2, 3, 5, 6, 8, 10, 15],
  STREAK_MILESTONES: [
    { days: 3, coins: 5 },
    { days: 7, coins: 10 },
    { days: 14, coins: 25 },
    { days: 30, coins: 50 },
  ],
  AD_REWARD: 5,
  AD_MAX: 3,
  AD_DURATION: 15,
  AD_COOLDOWN: 120,
  BOOK_REWARD: 10,
  BOOK_AD_BONUS: 5,
  MAX_FREEZES: 1,
  COIN_PACKS: [
    { id: 'coins_500', coins: 500, price: 4.99, priceDisplay: '$4.99' },
    { id: 'coins_1200', coins: 1200, price: 9.99, priceDisplay: '$9.99', featured: true },
    { id: 'coins_2600', coins: 2600, price: 19.99, priceDisplay: '$19.99' },
  ],
  PLANS: [
    {
      id: 'monthly',
      name: 'Pro Monthly',
      price: 9.99,
      priceDisplay: '$9.99',
      per: 'per month',
      coins: 600,
      perks: [
        'Unlimited reading (100 per day)',
        '1.5× reward boost',
        'Early chapter access',
        '+100 bonus coins on signup'
      ],
      active: false,
    },
    {
      id: 'yearly',
      name: 'Pro Yearly',
      price: 89.99,
      priceDisplay: '$89.99',
      per: 'per year',
      save: 'Save 25%',
      coins: 7200,
      bonusCoins: 1200,
      perks: [
        'Unlimited reading (150 per day)',
        '1.5× reward boost',
        'Early chapter access',
        '+1,200 bonus coins'
      ],
      active: false,
    },
  ],
  CHAPTERS: [
    { id: 1, title: 'Chapter 1 — The Arrival', unlocked: true },
    { id: 2, title: 'Chapter 2 — The Moors', unlocked: true },
    { id: 3, title: 'Chapter 3 — Heathcliff', unlocked: true },
    { id: 4, title: 'Chapter 4 — The Secret', unlocked: false },
    { id: 5, title: 'Chapter 5 — The Storm', unlocked: false },
    { id: 6, title: 'Chapter 6 — Reckoning', unlocked: false },
  ],
};


const state = {
  balance: 0,
  activePlanId: null, // No plan active by default
  bookId: '',
  targetChapterId: '',
  nextUrl: '',
  chapterUnlockCost: CFG.COINS_PER_CHAPTER,
  currentCheckinDay: 1,
  claimedCheckinDays: [],
  missedYesterday: false,
  streakDays: 0,
  streakReadToday: false,
  freezesLeft: CFG.MAX_FREEZES,
  reachedMilestones: [],
  adsWatchedToday: 0,
  adCooldownUntil: 0,
  adTimerInterval: null,
  adCountdownInterval: null,
  txFilter: 'all',
  pendingUnlockChapterId: null,
  chapters: structuredClone(CFG.CHAPTERS),
  history: [], // No fake coin pack purchases or demo entries
};

let pendingCheckout = null;

function getPaywallParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    bookId: String(params.get('bookId') || '').trim(),
    chapterId: String(params.get('chapterId') || '').trim(),
    next: String(params.get('next') || '').trim(),
  };
}

function getChapterCost() {
  return Number(state.chapterUnlockCost || CFG.COINS_PER_CHAPTER || 10);
}

function buildCheckoutReturnUrl(status) {
  const url = new URL(window.location.href);
  url.searchParams.set('checkout', status);
  return url.toString();
}

async function loadBookChapterLocksForPaywall() {
  const { bookId, chapterId, next } = getPaywallParams();
  state.bookId = bookId;
  state.targetChapterId = chapterId;
  state.nextUrl = next;

  if (!bookId) {
    return;
  }

  try {
    const res = await fetch(`/api/books/${encodeURIComponent(bookId)}/chapters`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success || !Array.isArray(payload.data)) {
      return;
    }

    state.chapterUnlockCost = Number(payload.monetization?.chapterUnlockCost || CFG.COINS_PER_CHAPTER || 10);

    state.chapters = payload.data.map((chapter) => ({
      id: String(chapter.id),
      title: `Chapter ${chapter.chapterNumber} — ${chapter.title}`,
      unlocked: !Boolean(chapter.isLocked),
      chapterNumber: Number(chapter.chapterNumber || 0),
      unlockCost: Number(chapter.unlockCost || state.chapterUnlockCost),
    }));

    if (state.targetChapterId) {
      const target = state.chapters.find((chapter) => chapter.id === state.targetChapterId);
      if (target && !target.unlocked) {
        setTimeout(() => openUnlockModal(target.id), 120);
      }
    }
  } catch (error) {
    console.warn('Failed to load chapter locks for paywall', error);
  }
}


// Sync balance from backend user data
async function syncBalanceFromBackend() {
  try {
    console.log('[Wallet] NovaraSession:', window.NovaraSession);
    const user = await window.NovaraSession?.fetchCurrentUser?.();
    console.log('[Wallet] fetched user:', user);
    if (user && typeof user.coins === 'number') {
      state.balance = user.coins;
      console.log('[Wallet] balance updated to:', state.balance);
    } else {
      console.warn('[Wallet] No numeric coins found on user');
    }
    renderAll();
  } catch (e) {
    console.warn('Failed to sync balance from backend', e);
  }
}



async function syncStreakFromBackend() {
  try {
    const res = await fetch('/api/progress/streak', { credentials: 'include' });
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) {
      state.streakDays = json.data.streakDays || 0;
      state.streakReadToday = json.data.streakReadToday || false;
      state.freezesLeft = typeof json.data.freezesLeft === 'number' ? json.data.freezesLeft : state.freezesLeft;
      renderAll();
    }
  } catch (e) {
    console.warn('Failed to sync streak from backend', e);
  }
}

// Called by reader.js when a progress save returns streak data
window.notifyStreakUpdate = function(streak) {
  if (!streak) return;
  const wasToday = state.streakReadToday;
  state.streakDays = streak.streakDays || state.streakDays;
  state.streakReadToday = streak.streakReadToday || false;
  state.freezesLeft = typeof streak.freezesLeft === 'number' ? streak.freezesLeft : state.freezesLeft;

  if (!wasToday && state.streakReadToday) {
    // First read of the day — check milestones
    const milestone = CFG.STREAK_MILESTONES.find(
      ms => ms.days === state.streakDays && !state.reachedMilestones.includes(ms.days)
    );
    if (milestone) {
      state.reachedMilestones.push(milestone.days);
      state.balance += milestone.coins;
      addTransaction({ type: 'earned', title: `${milestone.days}-day streak reward`, amount: milestone.coins, icon: '🔥' });
    }
  }
  renderAll();
};

async function init() {
  bindEvents();
  await Promise.all([syncBalanceFromBackend(), syncStreakFromBackend(), loadBookChapterLocksForPaywall()]);
  renderAll();

  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    setTimeout(syncBalanceFromBackend, 1500);
  }
}

function bindEvents() {
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close-overlay]');
    if (closeBtn) {
      closeOverlay(closeBtn.dataset.closeOverlay);
      return;
    }

    const scrollBtn = e.target.closest('[data-scroll]');
    if (scrollBtn) {
      scrollToSection(scrollBtn.dataset.scroll);
      return;
    }

    const txBtn = e.target.closest('.tx-filter');
    if (txBtn) {
      document.querySelectorAll('.tx-filter').forEach(btn => btn.classList.remove('active'));
      txBtn.classList.add('active');
      state.txFilter = txBtn.dataset.filter;
      renderHistory();
      return;
    }

    const packBtn = e.target.closest('[data-pack-id]');
    if (packBtn) {
      openCheckoutModal('coins', packBtn.dataset.packId);
      return;
    }

    const planBtn = e.target.closest('[data-plan-id]');
    if (planBtn) {
      openCheckoutModal('subscription', planBtn.dataset.planId);
      return;
    }

    const claimBtn = e.target.closest('#claimCheckinBtn');
    if (claimBtn) {
      claimCheckin();
      return;
    }

    const markReadBtn = e.target.closest('#markReadTodayBtn');
    if (markReadBtn) {
      markReadToday();
      return;
    }


    const adBtn = e.target.closest('#watchAdBtn');
    if (adBtn) {
      startAdWatch(false);
      return;
    }

    const unlockBtn = e.target.closest('[data-unlock-chapter]');
    if (unlockBtn) {
      openUnlockModal(String(unlockBtn.dataset.unlockChapter || ''));
      return;
    }
  });

  document.getElementById('cancelAdBtn')?.addEventListener('click', cancelAd);
  document.getElementById('unlockConfirmBtn')?.addEventListener('click', confirmUnlock);
  document.getElementById('checkoutConfirmBtn')?.addEventListener('click', confirmCheckout);
  document.getElementById('checkoutBillingAgree')?.addEventListener('change', updateCheckoutConfirmState);
  document.getElementById('completeBookBtn')?.addEventListener('click', completeBook);
  document.getElementById('startNextBookBtn')?.addEventListener('click', startNextBook);
  document.getElementById('watchBonusAdBtn')?.addEventListener('click', () => {
    closeOverlay('bookOverlay');
    startAdWatch(true);
  });
}

function renderAll() {
  renderHero();
  renderCoinPacks();
  renderPlans();
  renderCheckin();
  renderStreak();
  renderAds();
  renderHistory();
  renderChapters();
}

function renderHero() {
  const heroAmount = document.getElementById('heroAmount');
  const heroEquiv = document.getElementById('heroEquiv');
  const heroPills = document.getElementById('heroPills');
  const heroPlanBadge = document.getElementById('heroPlanBadge');
  const heroRenew = document.getElementById('heroRenew');
  const membershipBadge = document.getElementById('membershipBadge');

  heroAmount.textContent = state.balance;
  heroEquiv.textContent = `≈ ${Math.floor(state.balance / getChapterCost())} chapters available`;

  const activePlan = CFG.PLANS.find(p => p.id === state.activePlanId);
  if (activePlan) {
    heroPlanBadge.textContent = activePlan.name;
    const totalCoins = activePlan.coins + (activePlan.bonusCoins || 0);
    heroRenew.textContent = `${totalCoins} coins included`;
    membershipBadge.textContent = `${activePlan.name} — Active`;
  } else {
    heroPlanBadge.textContent = 'Free Reader';
    heroRenew.textContent = 'Upgrade for more perks';
    membershipBadge.textContent = 'Choose a plan';
  }

  heroPills.innerHTML = `
    <div class="hero-pill pill-total">💰 <strong>${state.balance}</strong> total coins</div>
    <div class="hero-pill">📖 <strong>${Math.floor(state.balance / getChapterCost())}</strong> chapters ready</div>
    <div class="hero-pill">🔥 <strong>${state.streakDays}</strong> day streak</div>
    <div class="hero-pill">📺 <strong>${Math.max(0, CFG.AD_MAX - state.adsWatchedToday)}</strong> ads left</div>
  `;
}

function renderCoinPacks() {
  const grid = document.getElementById('coinPacksGrid');

  grid.innerHTML = CFG.COIN_PACKS.map(pack => `
    <div class="pack-card ${pack.featured ? 'featured' : ''}">
      ${pack.featured ? '<div class="pack-best-badge">Best Value</div>' : ''}
      <span class="pack-icon">🪙</span>
      <div class="pack-coins">${pack.coins}</div>
      <div class="pack-coins-lbl">coins</div>
      <div class="pack-chapters">📖 ${Math.floor(pack.coins / getChapterCost())} chapters</div>
      <div class="pack-price">${pack.priceDisplay}</div>
      <button class="btn btn-gold btn-md" data-pack-id="${pack.id}">Buy Pack</button>
    </div>
  `).join('');
}

function renderPlans() {
  const grid = document.getElementById('plansGrid');

  grid.innerHTML = CFG.PLANS.map(plan => {
    const isActive = state.activePlanId === plan.id;

    return `
      <div class="plan-card ${isActive ? 'plan-active' : ''}">
        ${isActive ? '<div class="plan-active-badge">Active</div>' : ''}
        ${plan.save ? `<div class="plan-save-badge">${plan.save}</div>` : ''}
        <div class="plan-name">${plan.name}</div>
        <div class="plan-price">${plan.priceDisplay} <sub>${plan.per}</sub></div>
        <div class="plan-divider"></div>
        <div class="plan-perks">
          ${plan.perks.map(perk => `
            <div class="plan-perk">
              <span class="plan-perk-dot">✓</span>
              <span>${perk}</span>
            </div>
          `).join('')}
        </div>
        <button class="btn ${isActive ? 'btn-outline-purple' : 'btn-purple'} btn-md btn-full" data-plan-id="${plan.id}">
          ${isActive ? 'Current Plan' : 'Choose Plan'}
        </button>
      </div>
    `;
  }).join('');
}

function renderCheckin() {
  const dayGrid = document.getElementById('dayGrid');
  const badge = document.getElementById('checkinBadge');
  const info = document.getElementById('checkinInfo');
  const action = document.getElementById('checkinAction');
  const missedWarning = document.getElementById('missedWarning');

  badge.textContent = `Day ${state.currentCheckinDay}`;
  missedWarning.style.display = state.missedYesterday ? 'block' : 'none';

  dayGrid.innerHTML = CFG.CHECKIN_REWARDS.map((coins, index) => {
    const day = index + 1;
    const claimed = state.claimedCheckinDays.includes(day);
    const active = state.currentCheckinDay === day && !claimed;
    const future = day > state.currentCheckinDay;

    return `
      <div class="day-cell ${claimed ? 'dc-claimed' : ''} ${active ? 'dc-active' : ''} ${future ? 'dc-future' : ''}">
        <div class="dc-check">✓</div>
        <div class="dc-num">Day ${day}</div>
        <span class="dc-emoji">🪙</span>
        <div class="dc-coins">+${coins}</div>
        <div class="dc-sub">coins</div>
      </div>
    `;
  }).join('');

  const todayReward = CFG.CHECKIN_REWARDS[state.currentCheckinDay - 1] || CFG.CHECKIN_REWARDS[0];
  const alreadyClaimed = state.claimedCheckinDays.includes(state.currentCheckinDay);

  if (alreadyClaimed) {
    info.innerHTML = `<strong>Claimed today.</strong> Come back tomorrow for the next reward.`;
    action.innerHTML = `<div class="claimed-tag">✓ Claimed</div>`;
  } else {
    info.innerHTML = `<strong>Today's reward:</strong> +${todayReward} coins`;
    action.innerHTML = `<button class="btn btn-forest btn-md" id="claimCheckinBtn">Claim reward</button>`;
  }
}

function renderStreak() {
  const streakBadge = document.getElementById('streakBadge');
  const streakNum = document.getElementById('streakNum');
  const streakLbl = document.getElementById('streakLbl');
  const freezeBadge = document.getElementById('freezeBadge');
  const milestones = document.getElementById('milestones');
  const prog = document.getElementById('streakProg');
  const progLbl = document.getElementById('streakProgLbl');
  const streakStatus = document.getElementById('streakStatus');
  const streakAction = document.getElementById('streakAction');
  const streakFire = document.getElementById('streakFire');

  streakBadge.textContent = `${state.streakDays} days`;
  streakNum.innerHTML = `${state.streakDays} <sup>days</sup>`;
  streakLbl.textContent = state.streakDays > 0 ? 'Your reading habit is building nicely' : 'Start reading today';

  freezeBadge.textContent = `❄️ ${state.freezesLeft} freeze ${state.freezesLeft === 1 ? 'available' : 'available'}`;
  freezeBadge.classList.toggle('empty', state.freezesLeft === 0);

  streakFire.classList.toggle('dead', state.streakDays === 0);

  milestones.innerHTML = CFG.STREAK_MILESTONES.map(ms => {
    const reached = state.streakDays >= ms.days;
    const next = !reached && ms.days === getNextMilestone()?.days;

    return `
      <div class="milestone ${reached ? 'ms-reached' : ''} ${next ? 'ms-next' : ''}">
        <div class="ms-check">✓</div>
        <div class="ms-lbl">Milestone</div>
        <div class="ms-days">${ms.days}</div>
        <div class="ms-reward">+${ms.coins} coins</div>
      </div>
    `;
  }).join('');

  const next = getNextMilestone();
  const maxDays = CFG.STREAK_MILESTONES[CFG.STREAK_MILESTONES.length - 1].days;
  const percent = Math.min(100, (state.streakDays / maxDays) * 100);
  prog.style.width = `${percent}%`;

  if (next) {
    progLbl.innerHTML = `<span>${state.streakDays} days</span><span>Next: ${next.days} days → +${next.coins} coins</span>`;
  } else {
    progLbl.innerHTML = `<span>${state.streakDays} days</span><span>All milestones reached</span>`;
  }

  if (state.streakReadToday) {
    streakStatus.textContent = 'You already read today. Keep it up!';
    streakAction.innerHTML = `<div class="claimed-tag">✓ Protected today</div>`;
  } else {
    streakStatus.textContent = 'Have you read at least one chapter today?';
    streakAction.innerHTML = `<button class="btn btn-gold btn-md" id="markReadTodayBtn">Mark as read</button>`;
  }
}

function renderAds() {
  const adBadge = document.getElementById('adBadge');
  const adProgLbl = document.getElementById('adProgLbl');
  const adAction = document.getElementById('adAction');
  const cooldownWrap = document.getElementById('cooldownWrap');
  const cooldownLbl = document.getElementById('cooldownLbl');
  const cooldownFill = document.getElementById('cooldownFill');

  const remaining = Math.max(0, CFG.AD_MAX - state.adsWatchedToday);
  adBadge.textContent = `${remaining} left today`;
  adProgLbl.textContent = `${state.adsWatchedToday} of ${CFG.AD_MAX} watched today`;

  for (let i = 0; i < CFG.AD_MAX; i++) {
    document.getElementById(`adDot${i}`)?.classList.toggle('used', i < state.adsWatchedToday);
  }

  const now = Date.now();
  const cooldownLeft = Math.max(0, state.adCooldownUntil - now);

  if (state.activePlanId) {
    adAction.innerHTML = `<div class="claimed-tag">⭐ Ads disabled on Pro</div>`;
    cooldownWrap.classList.remove('visible');
    return;
  }

  if (remaining <= 0) {
    adAction.innerHTML = `<div class="claimed-tag">✓ Daily limit reached</div>`;
    cooldownWrap.classList.remove('visible');
    return;
  }

  if (cooldownLeft > 0) {
    adAction.innerHTML = `<button class="btn btn-outline btn-md" disabled>On cooldown</button>`;
    cooldownWrap.classList.add('visible');

    const total = CFG.AD_COOLDOWN * 1000;
    const pct = Math.max(0, (cooldownLeft / total) * 100);
    cooldownFill.style.width = `${pct}%`;
    cooldownLbl.textContent = `Cooldown: ${formatSeconds(Math.ceil(cooldownLeft / 1000))}`;

    startCooldownTicker();
  } else {
    adAction.innerHTML = `<button class="btn btn-forest btn-md" id="watchAdBtn">Watch ad</button>`;
    cooldownWrap.classList.remove('visible');
  }
}

function renderHistory() {
  const txList = document.getElementById('txList');

  const filtered = state.history.filter(item => {
    if (state.txFilter === 'all') return true;
    return item.type === state.txFilter;
  });

  if (!filtered.length) {
    txList.innerHTML = `<div class="tx-empty">No transactions in this filter yet.</div>`;
    return;
  }

  txList.innerHTML = filtered
    .slice()
    .sort((a, b) => b.date - a.date)
    .map(item => {
      const isPositive = item.amount > 0;
      const cls = item.type === 'subscription'
        ? 'txi-sub'
        : item.type === 'purchased'
        ? 'txi-buy'
        : item.type === 'spent'
        ? 'txi-spend'
        : 'txi-earn';

      return `
        <div class="tx-item">
          <div class="tx-icon ${cls}">${item.icon || '🪙'}</div>
          <div class="tx-body">
            <div class="tx-title">${item.title}</div>
            <div class="tx-date">${formatDate(item.date)}</div>
          </div>
          <div class="tx-amount ${isPositive ? 'tx-earn' : 'tx-spend'}">
            ${isPositive ? '+' : ''}${item.amount}
          </div>
        </div>
      `;
    }).join('');
}

function renderChapters() {
  const grid = document.getElementById('chaptersGrid');
  const chapterCost = getChapterCost();

  grid.innerHTML = state.chapters.map(ch => `
    <div class="chapter-card">
      <div>
        <div class="chapter-title">${ch.title}</div>
        <div class="chapter-meta">${ch.unlocked ? 'Ready to read' : `${chapterCost} coins to unlock`}</div>
      </div>
      <div>
        ${ch.unlocked
          ? `<div class="chapter-unlocked">✓ Unlocked</div>`
          : `<button class="btn btn-outline btn-md" data-unlock-chapter="${ch.id}">Unlock</button>`
        }
      </div>
    </div>
  `).join('');
}


function openCheckoutModal(type, id) {
  const pack = type === 'coins' ? CFG.COIN_PACKS.find((p) => p.id === id) : null;
  const plan = type === 'subscription' ? CFG.PLANS.find((p) => p.id === id) : null;

  if (type === 'coins' && !pack) return;
  if (type === 'subscription' && !plan) return;
  if (type === 'subscription' && state.activePlanId === id) {
    toast('This plan is already active', '⭐', 'purple');
    return;
  }

  pendingCheckout = { type, id };

  const titleEl = document.getElementById('checkoutModalTitle');
  const subEl = document.getElementById('checkoutModalSub');
  const noteEl = document.getElementById('checkoutLegalNote');
  const checkWrap = document.getElementById('checkoutLegalCheckWrap');
  const agreeInput = document.getElementById('checkoutBillingAgree');

  if (type === 'coins') {
    titleEl.textContent = 'Buy coin pack';
    subEl.textContent = `${pack.coins} coins for ${pack.priceDisplay} — one-time purchase via Stripe.`;
    noteEl.hidden = false;
    noteEl.textContent = 'By continuing to checkout, you agree to our billing terms.';
    checkWrap.hidden = true;
    if (agreeInput) agreeInput.checked = false;
  } else {
    titleEl.textContent = 'Subscribe to Pro';
    subEl.textContent = `${plan.name} — ${plan.priceDisplay} ${plan.per}. Renews automatically until cancelled.`;
    noteEl.hidden = true;
    checkWrap.hidden = false;
    if (agreeInput) agreeInput.checked = false;
  }

  updateCheckoutConfirmState();
  openOverlay('checkoutOverlay');
}

function updateCheckoutConfirmState() {
  const confirmBtn = document.getElementById('checkoutConfirmBtn');
  const agreeInput = document.getElementById('checkoutBillingAgree');
  if (!confirmBtn || !pendingCheckout) return;

  if (pendingCheckout.type === 'subscription') {
    confirmBtn.disabled = !(agreeInput && agreeInput.checked);
  } else {
    confirmBtn.disabled = false;
  }
}

async function confirmCheckout() {
  if (!pendingCheckout) return;

  if (pendingCheckout.type === 'subscription') {
    const agreeInput = document.getElementById('checkoutBillingAgree');
    if (!agreeInput || !agreeInput.checked) {
      toast('Please agree to the billing terms to continue.', '⚠️', 'warn');
      return;
    }
    closeOverlay('checkoutOverlay');
    toast('Redirecting to Stripe subscription…', '💳', 'info');
    await subscribePlan(pendingCheckout.id);
  } else {
    closeOverlay('checkoutOverlay');
    toast('Redirecting to Stripe checkout…', '💳', 'info');
    await buyPack(pendingCheckout.id);
  }

  pendingCheckout = null;
}

async function buyPack(packId) {
  const pack = CFG.COIN_PACKS.find(p => p.id === packId);
  if (!pack) return;
  try {
    const res = await fetch('/api/billing/create-coin-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        pack: packId,
        successUrl: buildCheckoutReturnUrl('success'),
        cancelUrl: buildCheckoutReturnUrl('cancel')
      })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      toast('Failed to start checkout', '❌', 'warn');
    }
  } catch (e) {
    toast('Checkout error', '❌', 'warn');
  }
}


async function subscribePlan(planId) {
  const plan = CFG.PLANS.find(p => p.id === planId);
  if (!plan) return;
  if (state.activePlanId === planId) {
    toast('This plan is already active', '⭐', 'purple');
    return;
  }
  toast('Redirecting to Stripe subscription…', '💳', 'info');
  try {
    const res = await fetch('/api/billing/create-subscription-checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: planId })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      toast('Failed to start subscription', '❌', 'warn');
    }
  } catch (e) {
    toast('Subscription error', '❌', 'warn');
  }
}

async function claimCheckin() {
  try {
    const res = await fetch('/api/rewards/daily-checkin', {
      method: 'POST',
      credentials: 'include'
    });

    const data = await res.json();

    if (!res.ok) {
      toast(data.message, '⚠️', 'warn');
      return;
    }

    state.balance = data.coins;

    addTransaction({
      type: 'earned',
      title: 'Daily check-in reward',
      amount: data.reward,
      icon: '📅',
    });

    toast(`+${data.reward} coins`, '📅', 'success');

    renderAll();

  } catch (e) {
    console.error(e);
    toast('Server error', '❌', 'warn');
  }
}

async function markReadToday() {
  if (state.streakReadToday) return;

  try {
    const res = await fetch('/api/rewards/mark-read-today', {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json();

    if (!res.ok) {
      toast(data.message || 'Could not update streak', '⚠️', 'warn');
      return;
    }

    if (typeof data.coins === 'number') {
      state.balance = data.coins;
    }

    if (data.streak) {
      const previousDays = state.streakDays;
      state.streakDays = data.streak.streakDays || state.streakDays;
      state.streakReadToday = Boolean(data.streak.streakReadToday);
      state.freezesLeft = typeof data.streak.freezesLeft === 'number' ? data.streak.freezesLeft : state.freezesLeft;

      if (state.streakDays > previousDays) {
        toast('Reading streak updated', '🔥', 'success');
      } else {
        toast('Today is already protected', '🔥', 'info');
      }
    }

    renderAll();
  } catch (e) {
    console.error(e);
    toast('Failed to update streak', '❌', 'warn');
  }
}

function startAdWatch(isBonus = false) {
  if (!isBonus) {
    if (state.activePlanId) {
      toast('Ads are disabled for Pro members', '⭐', 'purple');
      return;
    }

    if (state.adsWatchedToday >= CFG.AD_MAX) {
      toast('You reached today’s ad limit', '📺', 'warn');
      return;
    }

    if (Date.now() < state.adCooldownUntil) {
      toast('Ad cooldown is still active', '⏳', 'warn');
      return;
    }
  }

  openOverlay('adOverlay');

  let remaining = CFG.AD_DURATION;
  updateAdRing(remaining);

  clearInterval(state.adCountdownInterval);
  state.adCountdownInterval = setInterval(() => {
    remaining -= 1;
    updateAdRing(remaining);

    if (remaining <= 0) {
      clearInterval(state.adCountdownInterval);
      closeOverlay('adOverlay');
      rewardAd(isBonus);
    }
  }, 1000);
}

async function rewardAd(isBonus = false) {
  try {
    const res = await fetch('/api/rewards/ad-reward', {
      method: 'POST',
      credentials: 'include'
    });

    const data = await res.json();

    if (!res.ok) {
      toast(data.message, '⚠️', 'warn');
      return;
    }

    state.balance = data.coins;

    if (!isBonus) {
      state.adsWatchedToday += 1;
      state.adCooldownUntil = Date.now() + CFG.AD_COOLDOWN * 1000;
    }

    addTransaction({
      type: 'earned',
      title: 'Watch & Earn reward',
      amount: data.reward,
      icon: '📺',
    });

    toast(`+${data.reward} coins`, '📺', 'success');

    renderAll();

  } catch (e) {
    console.error(e);
    toast('Ad reward failed', '❌', 'warn');
  }
}

function cancelAd() {
  clearInterval(state.adCountdownInterval);
  closeOverlay('adOverlay');
  toast('Ad cancelled — no coins awarded', '📺', 'warn');
}

function openUnlockModal(chapterId) {
  const chapter = state.chapters.find(ch => ch.id === chapterId);
  if (!chapter) return;

  state.pendingUnlockChapterId = chapterId;

  const chapterCost = Number(chapter.unlockCost || getChapterCost());
  const after = state.balance - chapterCost;
  document.getElementById('unlockModalSub').textContent = chapter.title;
  document.getElementById('unlockCost').textContent = `${chapterCost} coins`;
  document.getElementById('unlockBalance').textContent = `${state.balance} coins`;
  document.getElementById('unlockSpent').textContent = `−${chapterCost} coins`;
  document.getElementById('unlockAfter').textContent = `${Math.max(0, after)} coins`;

  const enough = state.balance >= chapterCost;
  document.getElementById('unlockInsufficientMsg').style.display = enough ? 'none' : 'block';

  const btn = document.getElementById('unlockConfirmBtn');
  btn.disabled = !enough;
  btn.textContent = `Unlock for ${chapterCost} coins`;

  openOverlay('unlockOverlay');
}

async function confirmUnlock() {
  const chapter = state.chapters.find(ch => ch.id === state.pendingUnlockChapterId);
  if (!chapter) return;

  const chapterCost = Number(chapter.unlockCost || getChapterCost());
  if (state.balance < chapterCost) {
    toast('Not enough coins to unlock this chapter', '⚠️', 'warn');
    return;
  }

  try {
    const res = await fetch('/api/wallet/unlock-chapter', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: chapter.id }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      toast(data?.error || 'Unable to unlock chapter right now', '⚠️', 'warn');
      if (typeof data?.coins === 'number') {
        state.balance = data.coins;
      }
      renderAll();
      return;
    }

    chapter.unlocked = true;
    state.balance = Number(data?.data?.coins ?? state.balance - chapterCost);

    addTransaction({
      type: 'spent',
      title: `Unlocked ${chapter.title}`,
      amount: -chapterCost,
      icon: '🔓',
    });

    if (state.nextUrl) {
      const destination = state.nextUrl.startsWith('/') ? state.nextUrl : '/reader/reader.html';
      window.location.href = destination;
      return;
    }
  } catch (error) {
    toast('Unable to unlock chapter right now', '⚠️', 'warn');
    return;
  }

  closeOverlay('unlockOverlay');
  toast(`${chapter.title} unlocked`, '🔓', 'success');
  renderAll();
}

async function claimChapterReward(chapterId) {
  try {
    const res = await fetch('/api/rewards/chapter-complete', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bookId: window.currentBookId || 'default-book',
        chapterId
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.warn(data.message);
      return;
    }

    state.balance = data.coins;

    if (data.streak) {
      state.streakDays = data.streak.streakDays || state.streakDays;
      state.streakReadToday = Boolean(data.streak.streakReadToday);
      state.freezesLeft = typeof data.streak.freezesLeft === 'number' ? data.streak.freezesLeft : state.freezesLeft;
    }

    addTransaction({
      type: 'earned',
      title: `Chapter ${chapterId} reward`,
      amount: data.reward,
      icon: '📖',
    });

    toast(`+${data.reward} coins`, '📖', 'success');

    renderAll();

  } catch (e) {
    console.error(e);
  }
}

async function completeBook() {
  try {
    const res = await fetch('/api/rewards/book-complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: window.currentBookId || 'default-book' })
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.message || 'Book reward failed', '⚠️', 'warn');
      return;
    }
    state.balance = data.coins;
    addTransaction({
      type: 'earned',
      title: 'Book completion reward',
      amount: data.reward,
      icon: '🎉',
    });
    openOverlay('bookOverlay');
    renderAll();
    toast(`+${data.reward} coins`, '🎉', 'success');
  } catch (e) {
    console.error(e);
    toast('Book reward failed', '❌', 'warn');
  }
}

function startNextBook() {
  closeOverlay('bookOverlay');
  toast('Opening your next book…', '📚', 'info');
}

function openOverlay(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeOverlay(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'checkoutOverlay') {
    pendingCheckout = null;
    const agreeInput = document.getElementById('checkoutBillingAgree');
    if (agreeInput) agreeInput.checked = false;
  }
}

function updateAdRing(remaining) {
  const ringFill = document.getElementById('ringFill');
  const ringNum = document.getElementById('ringNum');
  const adSimText = document.getElementById('adSimText');

  const total = CFG.AD_DURATION;
  const circumference = 314;
  const progress = (total - remaining) / total;
  const offset = circumference - (progress * circumference);

  ringFill.style.strokeDashoffset = `${offset}`;
  ringNum.textContent = remaining;
  adSimText.textContent = `${remaining} seconds remaining`;
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toast(message, icon = 'ℹ️', type = 'info') {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  host.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 280);
  }, 2500);
}

function addTransaction({ type, title, amount, icon }) {
  state.history.unshift({
    type,
    title,
    amount,
    icon,
    date: new Date(),
  });
}

function getNextMilestone() {
  return CFG.STREAK_MILESTONES.find(ms => state.streakDays < ms.days) || null;
}

function startCooldownTicker() {
  if (state.adTimerInterval) return;

  state.adTimerInterval = setInterval(() => {
    const now = Date.now();
    const left = Math.max(0, state.adCooldownUntil - now);

    if (left <= 0) {
      clearInterval(state.adTimerInterval);
      state.adTimerInterval = null;
      renderAds();
      return;
    }

    const cooldownLbl = document.getElementById('cooldownLbl');
    const cooldownFill = document.getElementById('cooldownFill');
    const total = CFG.AD_COOLDOWN * 1000;
    const pct = Math.max(0, (left / total) * 100);

    if (cooldownLbl) cooldownLbl.textContent = `Cooldown: ${formatSeconds(Math.ceil(left / 1000))}`;
    if (cooldownFill) cooldownFill.style.width = `${pct}%`;
  }, 1000);
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

init();