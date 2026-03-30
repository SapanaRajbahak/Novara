/* ═══════════════════════════════════════════════════════════════════════════
   NOVARA WALLET — Production Engagement System
   All state persisted via localStorage. Backend-ready (swap ls.* for API calls).
═══════════════════════════════════════════════════════════════════════════ */

// ─── Storage ─────────────────────────────────────────────────────────────────
const K = {
  balance:       'nv_balance',
  checkinDay:    'nv_ci_day',        // 1–7
  checkinDate:   'nv_ci_date',       // YYYY-MM-DD
  streakCount:   'nv_str_count',
  streakDate:    'nv_str_date',      // last read date
  streakClaimed: 'nv_str_claimed',   // array of milestone day-counts
  streakFreezes: 'nv_str_freezes',   // int (max 1)
  freezeUsedDate:'nv_str_freeze_used',
  adUsed:        'nv_ad_used',       // count (resets daily)
  adDate:        'nv_ad_date',       // date of last ad session
  adLastTs:      'nv_ad_last_ts',    // timestamp of last completed ad
  earnCheckin:   'nv_earn_ci',       // today's check-in earnings
  earnStreak:    'nv_earn_str',      // today's streak earnings
  earnAd:        'nv_earn_ad',       // today's ad earnings
  earnBook:      'nv_earn_book',     // today's book earnings
  earnDate:      'nv_earn_date',     // date earnings were last reset
};

const ls = {
  get(k, def) {
    try {
      const v = localStorage.getItem(k);
      if (v === null) return def;
      return JSON.parse(v);
    } catch { return def; }
  },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  STARTING_BALANCE: 40,
  CHECKIN_REWARDS:  [2, 3, 5, 6, 8, 10, 15],
  STREAK_MILESTONES:[
    { days: 3,  coins: 5  },
    { days: 7,  coins: 10 },
    { days: 14, coins: 25 },
    { days: 30, coins: 50 },
  ],
  AD_REWARD:        5,
  AD_MAX:           3,
  AD_DURATION:      15,   // seconds (real ad would be longer)
  AD_COOLDOWN:      120,  // seconds
  BOOK_REWARD:      10,
  BOOK_AD_BONUS:    5,
  MAX_FREEZES:      1,
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
const today  = () => new Date().toISOString().slice(0, 10);
const yester = () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); };

// ─── Balance ──────────────────────────────────────────────────────────────────
function getBalance() { return ls.get(K.balance, CFG.STARTING_BALANCE); }
function setBalance(n) { ls.set(K.balance, Math.max(0, n)); }

function addCoins(amount, source) {
  const prev = getBalance();
  const next = prev + amount;
  setBalance(next);
  animateNumber(document.getElementById('heroAmount'), prev, next);
  spawnCoinBurst(amount);
  trackEarning(source, amount);
  renderHeroEarnings();
  return next;
}

// ─── Daily Earnings Tracker ────────────────────────────────────────────────
function resetEarningsIfNewDay() {
  if (ls.get(K.earnDate, '') !== today()) {
    ls.set(K.earnDate,    today());
    ls.set(K.earnCheckin, 0);
    ls.set(K.earnStreak,  0);
    ls.set(K.earnAd,      0);
    ls.set(K.earnBook,    0);
  }
}
function trackEarning(source, amount) {
  resetEarningsIfNewDay();
  const keyMap = { checkin: K.earnCheckin, streak: K.earnStreak, ad: K.earnAd, book: K.earnBook };
  const k = keyMap[source];
  if (k) ls.set(k, ls.get(k, 0) + amount);
}
function renderHeroEarnings() {
  resetEarningsIfNewDay();
  const ci  = ls.get(K.earnCheckin, 0);
  const str = ls.get(K.earnStreak,  0);
  const ad  = ls.get(K.earnAd,      0);
  const bk  = ls.get(K.earnBook,    0);
  const total = ci + str + ad + bk;
  const host = document.getElementById('heroEarnings');
  if (total === 0) { host.innerHTML = ''; return; }
  const pills = [];
  if (ci)    pills.push(`<div class="earn-pill"><span class="earn-pill-icon">📅</span> Check-in <strong>+${ci}</strong></div>`);
  if (str)   pills.push(`<div class="earn-pill"><span class="earn-pill-icon">🔥</span> Streak <strong>+${str}</strong></div>`);
  if (ad)    pills.push(`<div class="earn-pill"><span class="earn-pill-icon">📺</span> Ads <strong>+${ad}</strong></div>`);
  if (bk)    pills.push(`<div class="earn-pill"><span class="earn-pill-icon">📖</span> Book <strong>+${bk}</strong></div>`);
  pills.push(`<div class="earn-pill earn-pill-total"><span class="earn-label">Today total</span><strong>+${total}</strong></div>`);
  host.innerHTML = pills.join('');
}

// ─── Number animation ─────────────────────────────────────────────────────────
function animateNumber(el, from, to, duration = 700) {
  if (!el) return;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const e = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;
    el.textContent = Math.round(from + (to - from) * e).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ─── Coin burst ───────────────────────────────────────────────────────────────
function spawnCoinBurst(n) {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const r = hero.getBoundingClientRect();
  const count = Math.min(Math.ceil(n / 2), 10);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'coin-p';
    el.textContent = '🪙';
    el.style.left = (r.left + r.width * 0.25 + Math.random() * r.width * 0.5) + 'px';
    el.style.top  = (r.bottom - 8 + window.scrollY) + 'px';
    el.style.animationDelay = (i * 70) + 'ms';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200 + i * 70);
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, icon = '🪙', type = 'success') {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `<span class="toast-i">${icon}</span><span>${msg}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 350);
  }, 3200);
}

/* ═══════════════════════════════════════════════
   1. DAILY CHECK-IN
═══════════════════════════════════════════════ */
function getCheckin() {
  return {
    day:  ls.get(K.checkinDay, 0),   // last claimed day (1–7), 0 = never
    date: ls.get(K.checkinDate, ''),
  };
}

function renderCheckin() {
  const { day, date } = getCheckin();
  const claimedToday = date === today();
  const missedDay = date && date !== today() && date !== yester();

  // Show missed warning
  const warn = document.getElementById('missedWarning');
  warn.style.display = (missedDay && day > 0) ? 'flex' : 'none';

  // The "cycle position" = which day slot is next to claim
  // If claimed today → we're on day `day`. If not → next = day+1 (or 1 if missed)
  const currentSlot = claimedToday ? day : (missedDay ? 0 : day); // 0-indexed last claimed

  // Build 7 day cells
  const grid = document.getElementById('dayGrid');
  grid.innerHTML = CFG.CHECKIN_REWARDS.map((coins, i) => {
    const d = i + 1;
    const isClaimed = d <= currentSlot && claimedToday
      ? d <= day
      : d < day && !missedDay && d <= currentSlot;
    // Simpler: claimed = d <= day and not missed and date is today or yesterday chain
    const realClaimed = !missedDay && d <= day;
    const isActive   = !claimedToday && (missedDay ? d === 1 : d === day + 1);
    const isFuture   = !realClaimed && !isActive;
    const isSeven    = d === 7;
    const emoji = realClaimed ? '✅' : isActive ? '🪙' : isSeven ? '⭐' : '🔒';
    const cls = [
      'day-cell',
      realClaimed && 'dc-claimed',
      isActive    && 'dc-active',
      isFuture    && 'dc-future',
      isSeven     && 'dc-seven',
    ].filter(Boolean).join(' ');
    return `<div class="${cls}">
      <div class="dc-check">✓</div>
      <div class="dc-num">Day ${d}</div>
      <div class="dc-emoji">${emoji}</div>
      <div class="dc-coins">+${coins}</div>
      <div class="dc-sub">coins</div>
    </div>`;
  }).join('');

  // Badge
  const displayDay = claimedToday ? day : Math.max(day, 0);
  document.getElementById('checkinBadge').textContent =
    displayDay === 0 ? 'Day 1' : `Day ${displayDay}`;

  // Info text
  const nextDay = missedDay ? 1 : claimedToday ? (day % 7) + 1 : day + 1;
  const nextCoins = CFG.CHECKIN_REWARDS[nextDay - 1];
  const info = document.getElementById('checkinInfo');
  if (claimedToday) {
    const upcoming = CFG.CHECKIN_REWARDS[(day % 7)];
    info.innerHTML = `<strong>✅ Claimed today!</strong> Tomorrow: <strong>+${upcoming} coins</strong>`;
  } else {
    info.innerHTML = `Today's reward: <strong>+${CFG.CHECKIN_REWARDS[missedDay ? 0 : day]} coins</strong>`;
  }

  // Action button
  const action = document.getElementById('checkinAction');
  if (claimedToday) {
    action.innerHTML = `<div class="claimed-tag">✓ Claimed today</div>`;
  } else {
    action.innerHTML = `<button class="btn btn-forest btn-sm" onclick="claimCheckin()">Claim Today</button>`;
  }
}

function claimCheckin() {
  const { day, date } = getCheckin();
  if (date === today()) { toast('Already claimed today!', '⏳', 'warn'); return; }

  const missedDay = date && date !== today() && date !== yester();
  const nextDay   = missedDay ? 1 : (day % 7) + 1;
  const coins     = CFG.CHECKIN_REWARDS[nextDay - 1];

  ls.set(K.checkinDay, nextDay);
  ls.set(K.checkinDate, today());

  addCoins(coins, 'checkin');
  toast(`+${coins} coins — Day ${nextDay} check-in! 🎉`, '📅');
  renderCheckin();
}

/* ═══════════════════════════════════════════════
   2. READING STREAK
═══════════════════════════════════════════════ */
function getStreak() {
  return {
    count:   ls.get(K.streakCount, 0),
    date:    ls.get(K.streakDate, ''),
    claimed: ls.get(K.streakClaimed, []),
    freezes: ls.get(K.streakFreezes, CFG.MAX_FREEZES),
  };
}

function renderStreak() {
  const { count, date, claimed, freezes } = getStreak();
  const readToday = date === today();
  const readYester = date === yester();

  // Streak fire
  const fire = document.getElementById('streakFire');
  fire.classList.toggle('dead', count === 0);

  // Count + label
  document.getElementById('streakNum').innerHTML = `${count} <sup>days</sup>`;
  document.getElementById('streakBadge').textContent = `${count}-day streak`;

  let lbl = 'Start reading today to begin your streak';
  if (readToday)  lbl = 'Great — you read today! Keep it up 📖';
  else if (readYester) lbl = 'Read today to keep your streak alive!';
  else if (count > 0)  lbl = freezes > 0
    ? 'Missed yesterday — use your freeze to save it!'
    : 'Streak lost. Start fresh today.';
  document.getElementById('streakLabel').textContent = lbl;

  // Freeze badge
  const fb = document.getElementById('freezeBadge');
  if (freezes > 0) {
    fb.className = 'freeze-badge';
    fb.textContent = `❄️ ${freezes} freeze available`;
  } else {
    fb.className = 'freeze-badge empty';
    fb.textContent = '❄️ No freezes left';
  }

  // Milestones
  const next = CFG.STREAK_MILESTONES.find(m => count < m.days);
  document.getElementById('milestones').innerHTML = CFG.STREAK_MILESTONES.map(m => {
    const reached = count >= m.days;
    const isClaimed = claimed.includes(m.days);
    const isNext = m === next;
    return `<div class="milestone ${reached ? 'ms-reached' : ''} ${isNext ? 'ms-next' : ''}">
      <div class="ms-check">✓</div>
      <div class="ms-lbl">days</div>
      <div class="ms-days">${m.days}</div>
      <div class="ms-reward">+${m.coins} coins${isClaimed ? ' ✓' : ''}</div>
    </div>`;
  }).join('');

  // Progress bar
  const prevMs = next
    ? (CFG.STREAK_MILESTONES[CFG.STREAK_MILESTONES.indexOf(next) - 1]?.days || 0)
    : CFG.STREAK_MILESTONES.at(-1).days;
  const nextMs = next?.days || CFG.STREAK_MILESTONES.at(-1).days;
  const pct = next
    ? Math.min(((count - prevMs) / (nextMs - prevMs)) * 100, 100)
    : 100;
  document.getElementById('streakProg').style.width = pct + '%';
  document.getElementById('streakProgLabel').innerHTML =
    `<span>${count} days</span><span>${next ? `Next: ${nextMs} days →` : '🏆 All milestones reached!'}</span>`;

  // Action
  const streakAction = document.getElementById('streakAction');
  const streakStatus = document.getElementById('streakReadStatus');

  if (readToday) {
    streakStatus.textContent = 'Reading logged for today ✓';
    streakAction.innerHTML = `<div class="claimed-tag claimed-tag-gold">📖 Read today</div>`;
  } else {
    // Show freeze button only if streak > 0 and missed yesterday and freezes available
    const canFreeze = !readYester && count > 0 && freezes > 0 && !readToday;
    streakStatus.textContent = 'Have you read today?';
    streakAction.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-gold btn-sm" onclick="markReading()">✓ Mark as Read</button>
        ${canFreeze ? `<button class="btn btn-ghost btn-sm" onclick="useFreeze()" title="Prevents streak reset once">❄️ Use Freeze</button>` : ''}
      </div>`;
  }
}

function markReading() {
  const { count, date, claimed, freezes } = getStreak();
  if (date === today()) { toast('Already logged today!', '⏳', 'warn'); return; }

  const readYester = date === yester();
  const newCount = readYester || count === 0 ? count + 1 : 1;
  const reset = !readYester && count > 0;

  ls.set(K.streakCount, newCount);
  ls.set(K.streakDate, today());

  // Check milestones
  let bonus = 0;
  const newClaimed = [...claimed];
  CFG.STREAK_MILESTONES.forEach(m => {
    if (newCount >= m.days && !newClaimed.includes(m.days)) {
      newClaimed.push(m.days);
      bonus += m.coins;
    }
  });
  ls.set(K.streakClaimed, newClaimed);

  if (bonus > 0) {
    addCoins(bonus, 'streak');
    toast(`🎯 ${newCount}-day streak! Milestone: +${bonus} coins!`, '🔥');
  } else if (reset) {
    toast(`Streak reset. New streak: 1 day 📖`, '📖', 'info');
  } else {
    toast(`🔥 ${newCount}-day reading streak!`, '📖', 'info');
  }
  renderStreak();
}

function useFreeze() {
  const { count, date, freezes } = getStreak();
  if (freezes <= 0) { toast('No freezes left!', '❄️', 'warn'); return; }
  if (date === today()) { toast('Already read today — no need to freeze!', '⏳', 'warn'); return; }
  if (date === yester()) { toast('Your streak is fine — read today instead!', '🔥', 'warn'); return; }
  if (count === 0) { toast('No active streak to freeze', '❄️', 'warn'); return; }

  ls.set(K.streakFreezes, freezes - 1);
  ls.set(K.streakDate, today()); // treat as "read" for continuity
  ls.set(K.freezeUsedDate, today());
  toast('❄️ Freeze used! Streak saved for today.', '❄️', 'info');
  renderStreak();
}

/* ═══════════════════════════════════════════════
   3. WATCH AD
═══════════════════════════════════════════════ */
let adTimer     = null;
let adSecondsLeft = 0;
let adCooldownTimer = null;

function getAdState() {
  const date = ls.get(K.adDate, '');
  const used = date === today() ? ls.get(K.adUsed, 0) : 0;
  const lastTs = ls.get(K.adLastTs, 0);
  const cooldownLeft = Math.max(0, CFG.AD_COOLDOWN - Math.floor((Date.now() - lastTs) / 1000));
  return { used, remaining: CFG.AD_MAX - used, cooldownLeft };
}

function renderAd() {
  const { used, remaining, cooldownLeft } = getAdState();

  document.getElementById('adBadge').textContent =
    remaining > 0 ? `${remaining} left today` : 'Done for today';

  // Slots
  for (let i = 0; i < CFG.AD_MAX; i++) {
    document.getElementById(`adDot${i}`)?.classList.toggle('used', i < used);
  }

  // Cooldown bar
  const cdWrap  = document.getElementById('cooldownWrap');
  const cdFill  = document.getElementById('cooldownFill');
  const cdLabel = document.getElementById('cooldownLabel');

  if (cooldownLeft > 0 && remaining > 0) {
    cdWrap.classList.add('visible');
    cdFill.style.width = (cooldownLeft / CFG.AD_COOLDOWN * 100) + '%';
    const m = Math.floor(cooldownLeft / 60);
    const s = cooldownLeft % 60;
    cdLabel.textContent = `Cooldown: ${m}:${String(s).padStart(2,'0')}`;
  } else {
    cdWrap.classList.remove('visible');
  }

  // Action button
  const action = document.getElementById('adAction');
  if (remaining <= 0) {
    action.innerHTML = `<div class="claimed-tag" style="font-size:12px;">✓ Max today</div>`;
  } else if (cooldownLeft > 0) {
    action.innerHTML = `<button class="btn btn-ghost btn-sm" disabled>Cooldown</button>`;
  } else {
    action.innerHTML = `<button class="btn btn-terra btn-sm" onclick="watchAd()">▶ Watch</button>`;
  }
}

function watchAd(bonusMode = false) {
  const { remaining, cooldownLeft } = getAdState();
  if (remaining <= 0 && !bonusMode) { toast('No more ads today!', '⏰', 'warn'); return; }
  if (cooldownLeft > 0) { toast(`Cooldown: ${cooldownLeft}s remaining`, '⏳', 'warn'); return; }
  openAdModal(bonusMode);
}

function openAdModal(bonusMode = false) {
  adSecondsLeft = CFG.AD_DURATION;
  const overlay = document.getElementById('adOverlay');
  const fill    = document.getElementById('ringFill');
  const num     = document.getElementById('ringNum');
  const simText = document.getElementById('adSimText');
  const CIRC    = 2 * Math.PI * 50; // r=50

  fill.style.strokeDasharray  = CIRC;
  fill.style.strokeDashoffset = CIRC;

  overlay.classList.add('open');
  num.textContent = adSecondsLeft;
  simText.textContent = `${adSecondsLeft} seconds remaining`;

  clearInterval(adTimer);
  adTimer = setInterval(() => {
    adSecondsLeft--;
    const offset = CIRC - (CIRC * (CFG.AD_DURATION - adSecondsLeft) / CFG.AD_DURATION);
    fill.style.strokeDashoffset = offset;
    num.textContent = adSecondsLeft;
    simText.textContent = `${adSecondsLeft} seconds remaining`;

    if (adSecondsLeft <= 0) {
      clearInterval(adTimer);
      overlay.classList.remove('open');
      completeAd(bonusMode);
    }
  }, 1000);
}

function cancelAd() {
  clearInterval(adTimer);
  document.getElementById('adOverlay').classList.remove('open');
  toast('Ad cancelled — no coins awarded', 'ℹ️', 'warn');
}

function completeAd(bonusMode = false) {
  const reward = bonusMode ? CFG.BOOK_AD_BONUS : CFG.AD_REWARD;

  if (!bonusMode) {
    // Track daily usage
    const { used } = getAdState();
    ls.set(K.adDate, today());
    ls.set(K.adUsed, used + 1);
  }
  ls.set(K.adLastTs, Date.now());

  addCoins(reward, 'ad');
  toast(`+${reward} coins earned! 🎉`, '📺');

  if (!bonusMode) {
    renderAd();
    // Start cooldown UI tick
    startCooldownTick();
  }
}

function startCooldownTick() {
  clearInterval(adCooldownTimer);
  adCooldownTimer = setInterval(() => {
    const { cooldownLeft } = getAdState();
    renderAd();
    if (cooldownLeft <= 0) clearInterval(adCooldownTimer);
  }, 1000);
}

/* ═══════════════════════════════════════════════
   4. BOOK COMPLETION
═══════════════════════════════════════════════ */
function simulateBookComplete() {
  // Award base reward
  addCoins(CFG.BOOK_REWARD, 'book');
  toast(`📖 Book finished! +${CFG.BOOK_REWARD} coins`, '🎉');

  // Show modal
  setTimeout(() => {
    document.getElementById('bookOverlay').classList.add('open');
  }, 600);
}

function closeBookModal() {
  document.getElementById('bookOverlay').classList.remove('open');
}

function watchBonusAd() {
  // Trigger an ad that doesn't count toward daily limit but gives bonus
  const { cooldownLeft } = getAdState();
  if (cooldownLeft > 0) {
    toast(`Cooldown active — ${cooldownLeft}s remaining`, '⏳', 'warn');
    return;
  }
  watchAd(true);
}

function startNextBook() {
  toast('Starting your next read... 📚', '📖', 'info');
  closeBookModal();
}

function addToFavorites() {
  toast('Added to favorites! ⭐', '⭐', 'info');
  closeBookModal();
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
function init() {
  resetEarningsIfNewDay();

  const balance = getBalance();
  document.getElementById('heroAmount').textContent = balance.toLocaleString();
  document.getElementById('heroSub').textContent =
    balance === CFG.STARTING_BALANCE
      ? `You start with ${CFG.STARTING_BALANCE} coins — earn more daily`
      : 'Keep completing daily activities';

  renderHeroEarnings();
  renderCheckin();
  renderStreak();
  renderAd();
}

init();
