const MILESTONES = [
  { threshold: 1, icon: "S", label: "Invite 1 writer", reward: "50 coins" },
  { threshold: 5, icon: "M", label: "Invite 5 writers", reward: "Bonus reward" },
  { threshold: 10, icon: "P", label: "Invite 10 writers", reward: "Pro perk" },
  { threshold: 25, icon: "C", label: "Invite 25 writers", reward: "Creator badge + cash" },
];

const elements = {
  writerAvatar: document.getElementById("writerAvatar"),
  writerName: document.getElementById("writerName"),
  signOutBtn: document.getElementById("signOutBtn"),
  shareLinkBtn: document.getElementById("shareLinkBtn"),
  viewRewardsBtn: document.getElementById("viewRewardsBtn"),
  heroCount: document.getElementById("heroCount"),
  heroSubtext: document.getElementById("heroSubtext"),
  writersInvitedStat: document.getElementById("writersInvitedStat"),
  writersInvitedHelper: document.getElementById("writersInvitedHelper"),
  activeReferralsStat: document.getElementById("activeReferralsStat"),
  activeReferralsHelper: document.getElementById("activeReferralsHelper"),
  totalEarningsStat: document.getElementById("totalEarningsStat"),
  totalEarningsHelper: document.getElementById("totalEarningsHelper"),
  conversionRateStat: document.getElementById("conversionRateStat"),
  conversionRateHelper: document.getElementById("conversionRateHelper"),
  linkSection: document.getElementById("linkSection"),
  linkUrl: document.getElementById("linkUrl"),
  copyBtn: document.getElementById("copyBtn"),
  shareEmailBtn: document.getElementById("shareEmailBtn"),
  shareTwitterBtn: document.getElementById("shareTwitterBtn"),
  shareWhatsAppBtn: document.getElementById("shareWhatsAppBtn"),
  shareNativeBtn: document.getElementById("shareNativeBtn"),
  qrBox: document.getElementById("qrBox"),
  qrImage: document.getElementById("qrImage"),
  downloadQrBtn: document.getElementById("downloadQrBtn"),
  milestoneSummary: document.getElementById("milestoneSummary"),
  progressCount: document.getElementById("progressCount"),
  progressFill: document.getElementById("progressFill"),
  progressNext: document.getElementById("progressNext"),
  milestonesGrid: document.getElementById("milestonesGrid"),
  emptyState: document.getElementById("emptyState"),
  emptyShareBtn: document.getElementById("emptyShareBtn"),
  activityTable: document.getElementById("activityTable"),
  activityBody: document.getElementById("activityBody"),
  viewAllLink: document.getElementById("viewAllLink"),
  infoRewardTitle: document.getElementById("infoRewardTitle"),
  infoRewardBody: document.getElementById("infoRewardBody"),
  viewTermsBtn: document.getElementById("viewTermsBtn"),
};

const state = {
  referralLink: "https://novara.app/signup?ref=YOUR_CODE",
};

function getInitials(name) {
  return String(name || "Writer")
    .trim()
    .split(/\s+/)
    .map((part) => part[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function scrollToLink() {
  elements.linkSection.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    elements.copyBtn.style.boxShadow = "0 0 0 3px rgba(45,90,61,0.25)";
    window.setTimeout(() => {
      elements.copyBtn.style.boxShadow = "";
    }, 1400);
  }, 450);
}


async function copyLink() {
  await navigator.clipboard.writeText(state.referralLink).catch(() => {});
  elements.copyBtn.textContent = "Copied!";
  elements.copyBtn.classList.add("copied");
  window.setTimeout(() => {
    elements.copyBtn.textContent = "Copy Link";
    elements.copyBtn.classList.remove("copied");
  }, 2200);
}

async function downloadQr() {
  if (!state.qrCodeDataUrl) return;
  const a = document.createElement("a");
  a.href = state.qrCodeDataUrl;
  a.download = "novara-referral-qr.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Fetch referral code and link for the current writer
async function loadReferralMe() {
  const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/referrals/me`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Unable to load referral data");
  const payload = await response.json();
  if (!payload?.success || !payload.referralCode || !payload.referralLink) throw new Error("Invalid referral data");
  return payload;
}

// Render QR code using a library or fallback
function renderQrCode(link) {
  if (!elements.qrImage) return;
  if (!link) {
    elements.qrImage.style.display = "none";
    if (elements.downloadQrBtn) elements.downloadQrBtn.style.display = "none";
    return;
  }
  // Use a public QR code API for client-side rendering (no dependency)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(link)}&size=160x160&margin=8`;
  elements.qrImage.src = qrUrl;
  elements.qrImage.style.display = "block";
  if (elements.downloadQrBtn) {
    elements.downloadQrBtn.style.display = "inline-block";
    elements.downloadQrBtn.onclick = function() {
      const a = document.createElement("a");
      a.href = qrUrl;
      a.download = "novara-referral-qr.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  }
}

function shareEmail() {
  const subject = encodeURIComponent("Join me on Novara - write, publish, and earn");
  const body = encodeURIComponent(`Hey,\n\nI've been using Novara to publish my stories and thought you'd love it too.\n\nUse my link to join: ${state.referralLink}\n\nSee you there!`);
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

function shareTwitter() {
  const text = encodeURIComponent(`I'm writing and publishing on Novara. Join me here: ${state.referralLink}`);
  window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
}

function shareWhatsApp() {
  const text = encodeURIComponent(`I've been publishing stories on Novara. Use my referral link to join: ${state.referralLink}`);
  window.open(`https://wa.me/?text=${text}`, "_blank");
}

function shareNative() {
  if (navigator.share) {
    navigator.share({
      title: "Join me on Novara",
      text: "Write, publish, and earn on Novara.",
      url: state.referralLink,
    }).catch(() => {});
    return;
  }
  copyLink();
}

function renderMilestones(totalInvited) {
  const unlockedCount = MILESTONES.filter((item) => totalInvited >= item.threshold).length;
  const nextMilestone = MILESTONES.find((item) => totalInvited < item.threshold) || null;
  const lastThreshold = MILESTONES[MILESTONES.length - 1].threshold;
  const progressPercent = Math.min(100, Math.round((totalInvited / lastThreshold) * 100));

  elements.milestoneSummary.textContent = `${unlockedCount} / ${MILESTONES.length} unlocked`;
  elements.progressCount.textContent = `${totalInvited} referrals`;
  elements.progressFill.style.width = `${progressPercent}%`;
  elements.progressNext.textContent = nextMilestone
    ? `Invite ${Math.max(0, nextMilestone.threshold - totalInvited)} more to reach ${nextMilestone.label.toLowerCase()}`
    : "All referral milestones unlocked";

  elements.milestonesGrid.innerHTML = MILESTONES.map((item) => {
    const unlocked = totalInvited >= item.threshold;
    const current = !unlocked && nextMilestone && nextMilestone.threshold === item.threshold;
    const statusClass = unlocked ? "status-unlocked" : current ? "status-current" : "status-locked";
    const statusLabel = unlocked ? "Unlocked" : current ? "Next goal" : "Locked";
    const cardClass = unlocked ? "milestone-card unlocked" : current ? "milestone-card current" : "milestone-card locked";

    return `
      <div class="${cardClass}">
        ${unlocked ? '<span class="milestone-tick">+</span>' : ""}
        <span class="milestone-icon">${item.icon}</span>
        <div class="milestone-label">${item.label}</div>
        <div class="milestone-reward">${item.reward}</div>
        <span class="milestone-status ${statusClass}">${statusLabel}</span>
      </div>
    `;
  }).join("");
}

function renderActivity(referrals) {
  const rows = Array.isArray(referrals) ? referrals : [];
  if (!rows.length) {
    elements.activityTable.style.display = "none";
    elements.emptyState.style.display = "flex";
    elements.viewAllLink.style.display = "none";
    return;
  }

  elements.activityTable.style.display = "table";
  elements.emptyState.style.display = "none";
  elements.viewAllLink.style.display = "inline";
  elements.activityBody.innerHTML = rows.map((row) => {
    const status = String(row.status || "").toUpperCase();
    const active = status === "ACTIVE" || status === "COMPLETED";
    const badgeClass = active ? "badge badge-green" : "badge badge-neutral";
    const rewardValue = row.rewardGiven ? formatCurrency(row.rewardAmount || 0) : "Pending";
    const createdAt = row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "Recent";
    const name = row.referredUser?.name || row.name || "Referred writer";

    return `
      <tr>
        <td style="font-weight:500;color:var(--text)">${name}</td>
        <td><span class="${badgeClass}">${active ? "Active" : "Pending"}</span></td>
        <td style="color:${row.rewardGiven ? "var(--green)" : "var(--gold2)"};font-weight:600;">${rewardValue}</td>
        <td style="color:var(--text3)">${createdAt}</td>
      </tr>
    `;
  }).join("");
}

function applySummary(summary, user) {
  const stats = summary?.stats || {};
  const rewardConfig = summary?.rewardConfig || {};
  const total = Number(stats.total || 0);
  const active = Number(stats.active || 0);
  const completed = Number(stats.completed || 0);
  const pending = Number(stats.pending || 0);
  const totalEarned = Number(stats.totalEarned || 0);
  const conversionRate = Number(stats.conversionRate || 0);

  state.referralLink = summary?.referralLink || `https://novara.app/signup?ref=${summary?.referralCode || ""}`;
  elements.linkUrl.textContent = state.referralLink;
  elements.heroCount.textContent = String(total);
  elements.heroSubtext.textContent = total > 0 ? `${active} active referrals so far` : "Start sharing to earn rewards";
  elements.writersInvitedStat.textContent = String(total);
  elements.writersInvitedHelper.textContent = total > 0 ? `${pending} still pending completion` : "Share your link to get started";
  elements.activeReferralsStat.textContent = String(active);
  elements.activeReferralsHelper.textContent = `${active} of ${total} invited became active`;
  elements.totalEarningsStat.textContent = formatCurrency(totalEarned);
  elements.totalEarningsHelper.textContent = active > 0 ? "Rewards from active referrals" : "No earnings yet - invite to unlock";
  elements.conversionRateStat.textContent = total > 0 ? `${conversionRate}%` : "-";
  elements.conversionRateHelper.textContent = total > 0 ? `Based on ${total} total invites` : "Start sharing to unlock rewards";
  elements.infoRewardTitle.textContent = `Earn ${formatCurrency(rewardConfig.cashAmount || 0)} + ${Number(rewardConfig.coins || 0)} coins + ${Number(rewardConfig.aiCredits || 0)} AI credits per active referral`;
  elements.infoRewardBody.textContent = "Rewards are added after a referred writer completes the activation requirement for the program.";

  if (user) {
    elements.writerName.textContent = user.writerProfile?.penName || user.name || "Writer";
    elements.writerAvatar.textContent = getInitials(user.writerProfile?.penName || user.name || "Writer");
  }

  renderMilestones(total);
  renderActivity(summary?.referrals || []);
}

async function loadReferralSummary() {
  const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/referrals/summary`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to load referral summary");
  }

  const payload = await response.json();
  if (!payload?.success || !payload.data) {
    throw new Error("Invalid referral response");
  }

  return payload.data;
}

async function loadReferralList() {
  const response = await fetch(`${window.NovaraSession.API_BASE_URL}/api/referrals/list`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to load referral list");
  }

  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error("Invalid referral list response");
  }

  return payload.data;
}

async function guardAccess() {
  if (!window.NovaraSession) {
    return null;
  }

  const user = await window.NovaraSession.fetchCurrentUser();
  if (!user) {
    window.location.href = "/index.html";
    return null;
  }

  const allowed = window.NovaraSession.canUseWriter(user) || user.role === "ADMIN";
  if (!allowed) {
    window.location.href = "/writer/writer-onboarding.html";
    return null;
  }

  return user;
}



async function bootstrap() {
  const user = await guardAccess();
  if (!user) return;

  elements.shareLinkBtn.addEventListener("click", scrollToLink);
  elements.emptyShareBtn.addEventListener("click", scrollToLink);
  elements.viewRewardsBtn.addEventListener("click", () => {
    document.getElementById("rewardsSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  elements.copyBtn.addEventListener("click", copyLink);
  elements.shareEmailBtn.addEventListener("click", shareEmail);
  elements.shareTwitterBtn.addEventListener("click", shareTwitter);
  elements.shareWhatsAppBtn.addEventListener("click", shareWhatsApp);
  elements.shareNativeBtn.addEventListener("click", shareNative);
  elements.viewTermsBtn.addEventListener("click", () => {
    window.alert("Referral terms will be connected here next.");
  });
  if (elements.signOutBtn) {
    elements.signOutBtn.addEventListener("click", async () => {
      if (window.NovaraSession && typeof window.NovaraSession.signOut === "function") {
        await window.NovaraSession.signOut("/index.html");
      }
    });
  }

  // Load real referral data and render QR
  try {
    const referral = await loadReferralMe();
    state.referralLink = referral.referralLink;
    elements.linkUrl.textContent = state.referralLink;
    renderQrCode(state.referralLink);
  } catch (e) {
    elements.linkUrl.textContent = "Could not load referral link.";
    renderQrCode("");
  }

  try {
    const [summary, referrals] = await Promise.all([loadReferralSummary(), loadReferralList()]);
    applySummary({ ...summary, referrals }, user);
  } catch (error) {
    applySummary(null, user);
  }
}

bootstrap();
