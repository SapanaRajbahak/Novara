// backend/public/js/reader/chat.js
// Shared logic for global-chat, book-chat, and messages pages

(async function () {
  // ── AUTH ───────────────────────────────────────────────────────
  const session = window.NovaraSession;
  const currentUser = await session.fetchCurrentUser().catch(() => null);
  if (!currentUser) { window.location.href = '/index.html'; return; }

  const API_BASE = session.API_BASE_URL;

  // ── NICKNAME ───────────────────────────────────────────────────
  // Nicknames are stored in the DB (unique across all users) and cached in
  // localStorage so we don't need an extra round-trip on every page load.
  const NICK_KEY = `chatNickname_${currentUser.id}`;

  function getCachedNickname() { return localStorage.getItem(NICK_KEY) || ''; }
  function cacheNickname(nick) { localStorage.setItem(NICK_KEY, nick); }
  function clearCachedNickname() { localStorage.removeItem(NICK_KEY); }

  function validateNick(val) {
    if (!val || val.length < 2)  return 'Nickname must be at least 2 characters.';
    if (val.length > 20)         return 'Nickname must be 20 characters or fewer.';
    if (!/^[\w\s\-\.]+$/.test(val)) return 'Only letters, numbers, spaces, hyphens, and dots allowed.';
    return null;
  }

  // Inject the nickname modal into the page
  function injectNicknameModal() {
    if (document.getElementById('nicknameModal')) return;
    const el = document.createElement('div');
    el.id = 'nicknameModal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'nickModalTitle');
    el.innerHTML = `
      <div class="nick-modal-box">
        <h3 id="nickModalTitle">Choose your chat nickname</h3>
        <p>This is how others will see you in chat. You can change it anytime.</p>
        <input id="nicknameInput" type="text" maxlength="20"
               placeholder="e.g. BookWorm42" autocomplete="off" />
        <p id="nickModalError" class="nick-modal-error" hidden></p>
        <button id="nicknameConfirm">Start chatting</button>
      </div>`;
    document.body.appendChild(el);
  }

  async function askNickname() {
    return new Promise((resolve) => {
      injectNicknameModal();
      const input   = document.getElementById('nicknameInput');
      const btn     = document.getElementById('nicknameConfirm');
      const errEl   = document.getElementById('nickModalError');

      // Pre-fill with account name as suggestion
      input.value = currentUser.name || '';
      input.focus();
      input.select();

      async function attempt() {
        const val = input.value.trim();
        const localErr = validateNick(val);
        if (localErr) {
          errEl.textContent = localErr;
          errEl.hidden = false;
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Checking…';
        try {
          const resp = await fetch(`${API_BASE}/api/chat/nickname`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nickname: val }),
          });
          const data = await resp.json();
          if (!resp.ok) {
            errEl.textContent = data.error || 'Could not save nickname.';
            errEl.hidden = false;
            btn.disabled = false;
            btn.textContent = 'Start chatting';
            return;
          }
          // Saved in DB — cache locally
          cacheNickname(data.nickname);
          document.getElementById('nicknameModal').remove();
          resolve(data.nickname);
        } catch {
          errEl.textContent = 'Network error. Please try again.';
          errEl.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Start chatting';
        }
      }

      btn.addEventListener('click', attempt);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
    });
  }

  // Resolve nickname: check local cache first (fast path), then DB, then ask
  async function resolveNickname() {
    const cached = getCachedNickname();
    if (cached) return cached;

    // Try to fetch from the server (user may have a nickname from a different device)
    try {
      const resp = await fetch(`${API_BASE}/api/chat/nickname`, { credentials: 'include' });
      if (resp.ok) {
        const { nickname } = await resp.json();
        if (nickname) { cacheNickname(nickname); return nickname; }
      }
    } catch { /* network error — fall through to modal */ }

    return askNickname();
  }

  // Get existing nickname or ask for one
  let chatNickname = await resolveNickname();

  // ── SOCKET ─────────────────────────────────────────────────────
  const socket = io(API_BASE, {
    auth: { user: { id: currentUser.id, name: chatNickname } },
    transports: ['polling', 'websocket'],   // polling first to avoid WS upgrade loops
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect',       () => console.log('[Chat] connected', socket.id));
  socket.on('connect_error', (e) => console.warn('[Chat] connect error:', e.message));
  socket.on('disconnect',    (r) => console.log('[Chat] disconnected:', r));

  // ── STATE ──────────────────────────────────────────────────────
  let currentChat = { type: null, id: null };

  // ── DOM refs ───────────────────────────────────────────────────
  const messagesEl  = document.getElementById('messages');
  const inputEl     = document.getElementById('chatInput');
  const sendBtn     = document.getElementById('chatSend');
  const headerEl    = document.getElementById('chatHeader');
  const subheaderEl = document.getElementById('chatSubheader');

  // Inject the "Change nickname" button next to the header
  (function injectNickButton() {
    const hdr = document.querySelector('.chat-header');
    if (!hdr) return;
    const btn = document.createElement('button');
    btn.id        = 'changeNickBtn';
    btn.className = 'change-nick-btn';
    btn.title     = 'Change your chat nickname';
    btn.textContent = `✏️ ${chatNickname}`;
    hdr.appendChild(btn);
    btn.addEventListener('click', async () => {
      clearCachedNickname();
      chatNickname = await askNickname();
      btn.textContent = `✏️ ${chatNickname}`;
      // Reconnect with updated nickname so the server sees the new name
      socket.auth = { user: { id: currentUser.id, name: chatNickname } };
      socket.disconnect().connect();
    });
  })();

  // ── AVATAR HELPERS ────────────────────────────────────────────
  const AVATAR_COLORS = [
    '#e57373','#f06292','#ba68c8','#7986cb','#64b5f6',
    '#4db6ac','#81c784','#ffb74d','#ff8a65','#a1887f',
  ];
  function avatarColor(id) {
    let h = 0;
    const s = String(id || '?');
    for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }
  function avatarInitials(name) {
    const p = String(name || '?').trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : String(name || '?').slice(0, 2).toUpperCase();
  }

  // ── DATE DIVIDERS ─────────────────────────────────────────────
  let lastDividerDate = null;
  function getDateLabel(ts) {
    const d = new Date(ts), today = new Date();
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yest.toDateString())  return 'Yesterday';
    return d.toLocaleDateString([], {
      month: 'short', day: 'numeric',
      ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    });
  }
  function maybeAddDateDivider(ts) {
    if (!ts) return;
    const key = new Date(ts).toDateString();
    if (key === lastDividerDate) return;
    lastDividerDate = key;
    const el = document.createElement('div');
    el.className = 'chat-date-divider';
    el.innerHTML = `<span>${getDateLabel(ts)}</span>`;
    messagesEl.appendChild(el);
  }

  // ── ONLINE COUNT ──────────────────────────────────────────────
  let onlineCountEl = null;
  (function injectOnlineCount() {
    const hdr = document.querySelector('.chat-header');
    if (!hdr) return;
    onlineCountEl = document.createElement('p');
    onlineCountEl.className = 'chat-count';
    onlineCountEl.textContent = '…';
    hdr.appendChild(onlineCountEl);
  })();

  // ── EMOJI PICKER (reactions) ──────────────────────────────────
  const REACTION_EMOJIS = ['👍','❤️','🔥','💡','😂','😮','🎉','😍'];
  let pickerMsgId = null;
  const emojiPicker = (function buildPicker() {
    const el = document.createElement('div');
    el.id = 'emojiPicker';
    el.hidden = true;
    REACTION_EMOJIS.forEach(em => {
      const btn = document.createElement('button');
      btn.textContent = em;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pickerMsgId) socket.emit('react-message', { messageId: pickerMsgId, emoji: em });
        el.hidden = true; pickerMsgId = null;
      });
      el.appendChild(btn);
    });
    document.body.appendChild(el);
    document.addEventListener('click', () => { el.hidden = true; pickerMsgId = null; });
    return el;
  })();

  function showEmojiPicker(e, msgId) {
    e.stopPropagation();
    pickerMsgId = msgId;
    const r = e.currentTarget.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - 230);
    emojiPicker.style.left = left + 'px';
    emojiPicker.style.top  = (r.top - 52) + 'px';
    emojiPicker.hidden = false;
  }

  // ── COMPOSE EMOJI PICKER (inserts emoji into message input) ────
  const COMPOSE_EMOJIS = [
    '\uD83D\uDE00','\uD83D\uDE02','\uD83D\uDE2D','\uD83D\uDE0D','\uD83E\uDD70','\uD83D\uDE18','\uD83D\uDE0A','\uD83D\uDE0E','\uD83E\uDD29','\uD83D\uDE34',
    '\uD83E\uDD7A','\uD83D\uDE24','\uD83D\uDE05','\uD83D\uDE42','\uD83D\uDE0F','\uD83E\uDD14','\uD83D\uDE2E','\uD83D\uDE2C','\uD83D\uDE43','\uD83D\uDE0C',
    '\uD83E\uDD17','\uD83E\uDD23','\uD83D\uDE07','\uD83D\uDE21','\uD83E\uDD79','\uD83D\uDC4D','\uD83D\uDC4E','\uD83D\uDC4F','\uD83D\uDE4C','\uD83E\uDD1D',
    '\uD83E\uDEB6','\u2764\uFE0F','\uD83E\uDDE1','\uD83D\uDC9B','\uD83D\uDC9A','\uD83D\uDC99','\uD83D\uDC9C','\uD83D\uDD25','\u2728','\uD83D\uDCAF',
    '\uD83D\uDCDA','\uD83C\uDF89','\uD83C\uDF8A','\uD83D\uDC8C','\uD83C\uDF1F','\u2B50','\uD83D\uDCAC','\uD83C\uDF40','\uD83C\uDF08','\uD83C\uDFB5',
  ];
  const composeEmojiPanel = (function buildComposePanel() {
    const panel = document.createElement('div');
    panel.id = 'composeEmojiPanel';
    panel.hidden = true;
    COMPOSE_EMOJIS.forEach(em => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = em;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep input focused
        const start = inputEl.selectionStart ?? inputEl.value.length;
        const end   = inputEl.selectionEnd   ?? inputEl.value.length;
        inputEl.value = inputEl.value.slice(0, start) + em + inputEl.value.slice(end);
        inputEl.setSelectionRange(start + [...em].length, start + [...em].length);
        inputEl.focus();
        panel.hidden = true;
      });
      panel.appendChild(btn);
    });
    document.body.appendChild(panel);
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && e.target.id !== 'chatEmojiBtn') {
        panel.hidden = true;
      }
    });
    return panel;
  })();

  // Inject emoji button into the input row (before the text input)
  (function injectEmojiBtn() {
    if (!inputEl) return;
    const btn = document.createElement('button');
    btn.id        = 'chatEmojiBtn';
    btn.type      = 'button';
    btn.className = 'chat-emoji-btn';
    btn.title     = 'Insert emoji';
    btn.textContent = '\uD83D\uDE0A';
    inputEl.parentNode.insertBefore(btn, inputEl);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r      = btn.getBoundingClientRect();
      const pWidth = 282;
      const left   = Math.min(Math.max(r.left, 4), window.innerWidth - pWidth - 4);
      composeEmojiPanel.style.left   = left + 'px';
      composeEmojiPanel.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      composeEmojiPanel.style.top    = 'auto';
      composeEmojiPanel.hidden = !composeEmojiPanel.hidden;
    });
  })();

  // ── OPEN CHAT ──────────────────────────────────────────────────
  window.openChat = function (type, id = null) {
    currentChat = { type, id };
    messagesEl.innerHTML = '';
    lastDividerDate = null; // reset dividers for new room
    if (onlineCountEl) onlineCountEl.textContent = '…';

    if (type === 'global') {
      if (headerEl)    headerEl.textContent    = '🌍 Global Chat';
      if (subheaderEl) subheaderEl.textContent = 'Everyone on Novara';
      socket.emit('join-global');
    } else if (type === 'book') {
      if (headerEl)    headerEl.textContent    = '📖 Book Chat';
      if (subheaderEl) subheaderEl.textContent = id ? `Book ID: ${id}` : 'Select a book';
      if (id) socket.emit('join-book', id);
    } else if (type === 'dm') {
      if (headerEl)    headerEl.textContent    = '💌 Private Messages';
      if (subheaderEl) subheaderEl.textContent = id || 'No conversation selected';
      if (id) socket.emit('join-dm', id);
    }
  };

  window.openDM = function (userId, userName) {
    if (subheaderEl) subheaderEl.textContent = userName || userId;
    openChat('dm', userId);
  };

  // ── SEND ───────────────────────────────────────────────────────
  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || !currentChat.type) return;
    inputEl.value = '';

    if (currentChat.type === 'global') {
      socket.emit('global-message', { text });
    } else if (currentChat.type === 'book') {
      socket.emit('book-message', { bookId: currentChat.id, text });
    } else if (currentChat.type === 'dm') {
      socket.emit('dm-message', { to: currentChat.id, text });
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // ── RECEIVE ────────────────────────────────────────────────────
  function matchesCurrent(msg) {
    if (msg.type === 'global' && currentChat.type === 'global') return true;
    if (msg.type === 'book'   && currentChat.type === 'book' && msg.bookId === currentChat.id) return true;
    if (msg.type === 'dm'     && currentChat.type === 'dm') return true;
    return false;
  }

  function addMessage(msg, isHistory = false) {
    if (!matchesCurrent(msg)) return;

    // Remove empty-state placeholder
    const empty = messagesEl.querySelector('.chat-empty');
    if (empty) empty.remove();

    const isMine     = (msg.userId === currentUser.id || msg.fromId === currentUser.id);
    const senderName = msg.user || msg.from || 'Unknown';
    const senderId   = msg.userId || msg.fromId || '?';
    const ts         = msg.ts || Date.now();
    const msgId      = msg.id || '';

    // Date divider
    maybeAddDateDivider(ts);

    const timeStr  = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const color    = avatarColor(senderId);
    const initials = avatarInitials(senderName);

    const div = document.createElement('div');
    div.className = `chat-msg${isMine ? ' chat-msg--mine' : ''}${isHistory ? ' chat-msg--history' : ''}`;
    if (msgId) div.dataset.id = msgId;

    div.innerHTML =
      `<div class="chat-msg-avatar" style="background:${color}" title="${escapeHtml(senderName)}">${escapeHtml(initials)}</div>` +
      `<div class="chat-msg-body">` +
        `<div class="chat-msg-meta">` +
          `<span class="chat-msg-author">${escapeHtml(senderName)}</span>` +
          `<span class="chat-msg-time">${timeStr}</span>` +
        `</div>` +
        `<div class="chat-msg-text">${escapeHtml(msg.text)}</div>` +
        `<div class="chat-msg-reactions"></div>` +
      `</div>`;

    // Click author to open DM
    if (!isMine && msg.type !== 'dm') {
      const authorEl = div.querySelector('.chat-msg-author');
      authorEl.style.cursor = 'pointer';
      authorEl.title = 'Send a private message';
      authorEl.addEventListener('click', () => openDM(senderId, senderName));
    }

    // Render any existing reactions (from history)
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      renderReactions(div, msg.reactions, msg.myReactions || []);
    }

    // "Add reaction" button (hidden by default, shown on hover via CSS)
    if (msgId) {
      const addBtn = document.createElement('button');
      addBtn.className = 'reaction-add';
      addBtn.title = 'Add reaction';
      addBtn.textContent = '＋😊';
      addBtn.addEventListener('click', (e) => showEmojiPicker(e, msgId));
      div.querySelector('.chat-msg-reactions').appendChild(addBtn);
    }
    // Delete button — own messages unsend for everyone; received messages delete for me only
    if (msgId) {
      const delBtn = document.createElement('button');
      delBtn.className = 'chat-msg-unsend';
      delBtn.type      = 'button';
      if (isMine) {
        delBtn.title     = 'Unsend (delete for everyone)';
        delBtn.addEventListener('click', () => {
          delBtn.disabled = true;
          div.style.transition = 'opacity 0.2s';
          div.style.opacity = '0.35';
          socket.emit('delete-message', { messageId: msgId });
        });
      } else {
        delBtn.title     = 'Delete for me';
        delBtn.addEventListener('click', () => {
          div.style.transition = 'opacity 0.25s';
          div.style.opacity = '0';
          setTimeout(() => div.remove(), 280);
        });
      }
      delBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
      div.querySelector('.chat-msg-body').appendChild(delBtn);
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderReactions(msgEl, reactions, myReactions = []) {
    const reactionsEl = msgEl.querySelector('.chat-msg-reactions');
    if (!reactionsEl) return;
    const addBtn = reactionsEl.querySelector('.reaction-add');
    reactionsEl.querySelectorAll('.reaction-pill').forEach(p => p.remove());
    for (const [emoji, count] of Object.entries(reactions)) {
      if (!count) continue;
      const pill = makePill(emoji, count, myReactions.includes(emoji), msgEl.dataset.id);
      reactionsEl.insertBefore(pill, addBtn || null);
    }
  }

  function makePill(emoji, count, reacted, msgId) {
    const pill = document.createElement('button');
    pill.className = 'reaction-pill' + (reacted ? ' reacted' : '');
    pill.dataset.emoji = emoji;
    pill.innerHTML = `${emoji} <span class="count">${count}</span>`;
    pill.addEventListener('click', () => {
      // Optimistic toggle
      const isReacted = pill.classList.contains('reacted');
      const countEl   = pill.querySelector('.count');
      const newCount  = (parseInt(countEl.textContent, 10) || 0) + (isReacted ? -1 : 1);
      pill.classList.toggle('reacted');
      if (newCount <= 0) { pill.remove(); }
      else { countEl.textContent = newCount; }
      socket.emit('react-message', { messageId: msgId, emoji });
    });
    return pill;
  }

  // History batch: insert all history messages, then scroll once
  socket.on('chat-history', ({ messages }) => {
    if (!Array.isArray(messages)) return;
    messages.forEach(m => addMessage(m, true));
  });

  socket.on('global-message', (msg) => addMessage(msg));
  socket.on('book-message',   (msg) => addMessage(msg));
  let onDmMessage = null; // hook for DM page sidebar updates
  socket.on('dm-message', (msg) => { addMessage(msg); if (onDmMessage) onDmMessage(msg); });

  // Online reader count
  socket.on('room-count', ({ count }) => {
    if (onlineCountEl) onlineCountEl.textContent = `${count.toLocaleString()} online`;
    // book-chat.html dedicated badge
    const badge = document.getElementById('bcOnlineBadge');
    const countEl = document.getElementById('bcOnlineCount');
    if (badge && countEl) { countEl.textContent = count; badge.hidden = false; }
    // update room list item count if visible
    if (currentChat.id) {
      const li = document.querySelector(`.bc-room-item[data-id="${CSS.escape(currentChat.id)}"]`);
      if (li) { const c = li.querySelector('.bc-room-count'); if (c) c.innerHTML = `<span class="bc-online-dot"></span>${count} online`; }
    }
  });

  // Live reaction updates from other users
  socket.on('message-reactions', ({ messageId, reactions }) => {
    const msgEl = messagesEl.querySelector(`[data-id="${CSS.escape(messageId)}"]`);
    if (!msgEl) return;
    const reactionsEl = msgEl.querySelector('.chat-msg-reactions');
    const addBtn = reactionsEl.querySelector('.reaction-add');
    // Update existing pills and add new ones
    for (const [emoji, count] of Object.entries(reactions)) {
      let pill = reactionsEl.querySelector(`.reaction-pill[data-emoji="${CSS.escape(emoji)}"]`);
      if (count <= 0) { if (pill) pill.remove(); continue; }
      if (!pill) {
        pill = makePill(emoji, count, false, messageId);
        reactionsEl.insertBefore(pill, addBtn || null);
      } else {
        pill.querySelector('.count').textContent = count;
      }
    }
    // Remove pills for emojis that were zeroed out
    reactionsEl.querySelectorAll('.reaction-pill').forEach(pill => {
      if (!(pill.dataset.emoji in reactions) || reactions[pill.dataset.emoji] <= 0) pill.remove();
    });
  });

  // Remove a deleted message from DOM (unsend)
  socket.on('message-deleted', ({ messageId }) => {
    const msgEl = messagesEl.querySelector(`[data-id="${CSS.escape(messageId)}"]`);
    if (!msgEl) return;
    msgEl.style.transition = 'opacity 0.25s';
    msgEl.style.opacity = '0';
    setTimeout(() => msgEl.remove(), 280);
  });

  // ── UTILS ──────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── AUTO-OPEN based on page type ───────────────────────────────
  const params   = new URLSearchParams(window.location.search);
  const pageType = document.body.dataset.chatType;

  if (pageType === 'global') {
    openChat('global');
  } else if (pageType === 'book') {
    // ── New 2-panel book chat UI ──────────────────────────────
    const bcWelcome   = document.getElementById('bcWelcome');
    const bcChat      = document.getElementById('bcChat');
    const bcBookCover = document.getElementById('bcBookCover');
    const bcBookTitle = document.getElementById('bcBookTitle');
    const bcBookAuthor= document.getElementById('bcBookAuthor');
    const bcFootName  = document.getElementById('bcFootName');
    const bcFootAvatar= document.getElementById('bcFootAvatar');
    const bcOnlineBadge = document.getElementById('bcOnlineBadge');
    const allRoomsList  = document.getElementById('allRoomsList');
    const savedRoomsList= document.getElementById('savedRoomsList');
    const savedLabel    = document.getElementById('savedLabel');
    const bcSearch      = document.getElementById('bcSearch');

    const bcSaveBtn      = document.getElementById('bcSaveBtn');

    // Tracks which book-chat rooms are saved (separate from library saved-books)
    let savedChatRoomIds = new Set();
    let currentChatBook  = null;

    function updateSaveBtn(saved) {
      if (!bcSaveBtn) return;
      bcSaveBtn.setAttribute('aria-pressed', String(saved));
      const label = bcSaveBtn.querySelector('span');
      if (label) label.textContent = saved ? 'Saved' : 'Save';
      bcSaveBtn.title = saved ? 'Remove from saved rooms' : 'Save this room';
    }

    // Populate footer with current user
    if (bcFootName)   bcFootName.textContent   = chatNickname;
    if (bcFootAvatar) {
      bcFootAvatar.textContent = avatarInitials(chatNickname);
      bcFootAvatar.style.background = avatarColor(currentUser.id);
    }

    // Show book-chat panel, hide welcome
    function selectBook(book) {
      if (bcWelcome) bcWelcome.hidden = true;
      if (bcChat)    bcChat.hidden    = false;
      // Update header
      if (bcBookCover) { bcBookCover.src = book.coverUrl || book.cover || ''; bcBookCover.alt = book.title; }
      if (bcBookTitle)  bcBookTitle.textContent  = book.title || '—';
      if (bcBookAuthor) bcBookAuthor.textContent = book.authorName || book.author || '';
      if (bcOnlineBadge) bcOnlineBadge.hidden = true; // will show on room-count event
      // Track current book
      currentChatBook = book;
      updateSaveBtn(savedChatRoomIds.has(book.id));
      // Mark active room in sidebar
      document.querySelectorAll('.bc-room-item').forEach(li => li.classList.remove('active'));
      const activeLi = document.querySelector(`.bc-room-item[data-id="${CSS.escape(book.id)}"]`);
      if (activeLi) activeLi.classList.add('active');
      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('bookId', book.id);
      history.replaceState(null, '', url);
      openChat('book', book.id);
    }

    function makeRoomItem(book) {
      const li = document.createElement('li');
      li.className = 'bc-room-item';
      li.dataset.id = book.id;
      li.innerHTML =
        `<img class="bc-room-cover" src="${escapeHtml(book.coverUrl || book.cover || '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />` +
        `<div class="bc-room-info">` +
          `<span class="bc-room-title">${escapeHtml(book.title)}</span>` +
          `<span class="bc-room-count"><span class="bc-online-dot"></span>loading…</span>` +
        `</div>`;
      li.addEventListener('click', () => selectBook(book));
      return li;
    }

    // Load saved chat rooms (distinct from library saved-books)
    fetch(`${API_BASE}/api/chat/saved-rooms`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data.rooms) ? data.rooms : [];
        if (list.length && savedRoomsList && savedLabel) {
          savedLabel.hidden = false;
          list.forEach(r => {
            const book = { id: r.bookId, title: r.bookTitle, coverUrl: r.bookCover, authorName: r.bookAuthor };
            savedChatRoomIds.add(book.id);
            savedRoomsList.appendChild(makeRoomItem(book));
          });
        }
      })
      .catch(() => {});

    // Save / unsave button
    if (bcSaveBtn) {
      bcSaveBtn.addEventListener('click', async () => {
        if (!currentChatBook) return;
        const bookId  = currentChatBook.id;
        const isSaved = savedChatRoomIds.has(bookId);
        if (isSaved) {
          // Unsave
          try {
            await fetch(`${API_BASE}/api/chat/saved-rooms/${encodeURIComponent(bookId)}`, {
              method: 'DELETE', credentials: 'include',
            });
            savedChatRoomIds.delete(bookId);
            updateSaveBtn(false);
            const savedLi = savedRoomsList?.querySelector(`.bc-room-item[data-id="${CSS.escape(bookId)}"]`);
            if (savedLi) savedLi.remove();
            if (savedRoomsList && savedLabel && !savedRoomsList.children.length) savedLabel.hidden = true;
          } catch (_) {}
        } else {
          // Save
          try {
            await fetch(`${API_BASE}/api/chat/saved-rooms`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                bookId,
                bookTitle:  currentChatBook.title,
                bookCover:  currentChatBook.coverUrl || currentChatBook.cover || null,
                bookAuthor: currentChatBook.authorName || currentChatBook.author || null,
              }),
            });
            savedChatRoomIds.add(bookId);
            updateSaveBtn(true);
            if (savedRoomsList && savedLabel) {
              savedLabel.hidden = false;
              savedRoomsList.prepend(makeRoomItem(currentChatBook));
            }
          } catch (_) {}
        }
      });
    }

    // Load all rooms
    fetch(`${API_BASE}/api/books?limit=30`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const list = data.data?.books || data.data || [];
        if (!allRoomsList) return;
        allRoomsList.innerHTML = '';
        if (!Array.isArray(list) || !list.length) {
          allRoomsList.innerHTML = '<li class="bc-room-loading">No rooms yet.</li>';
          return;
        }
        list.forEach(book => {
          if (!savedChatRoomIds.has(book.id)) allRoomsList.appendChild(makeRoomItem(book));
        });
        // Request online counts for all visible rooms
        const ids = list.map(b => b.id);
        socket.emit('get-room-counts', ids);
      })
      .catch(() => {
        if (allRoomsList) allRoomsList.innerHTML = '<li class="bc-room-loading">Could not load rooms.</li>';
      });

    // Handle room count batch response
    socket.on('room-counts', (counts) => {
      Object.entries(counts).forEach(([bookId, count]) => {
        const li = document.querySelector(`.bc-room-item[data-id="${CSS.escape(bookId)}"]`);
        if (!li) return;
        const c = li.querySelector('.bc-room-count');
        if (c) c.innerHTML = `<span class="bc-online-dot"></span>${count} online`;
      });
    });

    // Search filter
    if (bcSearch) {
      bcSearch.addEventListener('input', () => {
        const q = bcSearch.value.trim().toLowerCase();
        document.querySelectorAll('.bc-room-item').forEach(li => {
          const title = li.querySelector('.bc-room-title')?.textContent.toLowerCase() || '';
          li.hidden = q ? !title.includes(q) : false;
        });
      });
    }

    // Open book if bookId already in URL
    const urlBookId = params.get('bookId');
    if (urlBookId) {
      fetch(`${API_BASE}/api/books/${urlBookId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data) selectBook(data.data);
        })
        .catch(() => {});
    }

  } else if (pageType === 'dm') {

    // ── 2-Panel DM UI ─────────────────────────────────────────────
    const dmWelcome      = document.getElementById('dmWelcome');
    const dmChat         = document.getElementById('dmChat');
    const dmConvList     = document.getElementById('dmConvList');
    const dmConvEmpty    = document.getElementById('dmConvEmpty');
    const dmSearch       = document.getElementById('dmSearch');
    const dmNewBtn       = document.getElementById('dmNewBtn');
    const dmWelcomeStart = document.getElementById('dmWelcomeStart');
    const dmNewModal     = document.getElementById('dmNewModal');
    const dmNewModalClose= document.getElementById('dmNewModalClose');
    const dmUserSearch   = document.getElementById('dmUserSearch');
    const dmUserResults  = document.getElementById('dmUserResults');
    const dmChatAv       = document.getElementById('dmChatAv');
    const dmChatName     = document.getElementById('dmChatName');
    const dmChatStatus   = document.getElementById('dmChatStatus');
    const dmFootAv       = document.getElementById('dmFootAv');
    const dmFootName     = document.getElementById('dmFootName');
    const dmCloseChat     = document.getElementById('dmCloseChat');
    const dmTabMessages   = document.getElementById('dmTabMessages');
    const dmTabRequests   = document.getElementById('dmTabRequests');
    const dmRequestsBadge = document.getElementById('dmRequestsBadge');

    // Populate sidebar footer with current user
    if (dmFootName) dmFootName.textContent = chatNickname;
    if (dmFootAv) {
      dmFootAv.textContent = avatarInitials(chatNickname);
      dmFootAv.style.background = avatarColor(currentUser.id);
    }

    // Format a timestamp as a short relative label
    function dmTimeLabel(ts) {
      if (!ts) return '';
      const d = new Date(ts), now = new Date();
      const diff = now - d;
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const yest = new Date(now); yest.setDate(now.getDate() - 1);
      if (d.toDateString() === yest.toDateString()) return 'Yesterday';
      if (diff < 7 * 86400000) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    // Select (open) a conversation
    function selectConversation(userId, userName) {
      // Update right panel
      if (dmChatAv) {
        dmChatAv.textContent = avatarInitials(userName);
        dmChatAv.style.background = avatarColor(userId);
      }
      if (dmChatName)   dmChatName.textContent   = userName;
      if (dmChatStatus) dmChatStatus.textContent = 'Last seen recently';
      // Show chat, hide welcome
      if (dmWelcome) dmWelcome.hidden = true;
      if (dmChat)    dmChat.hidden    = false;
      // On mobile: add class so sidebar hides
      document.querySelector('.dm-layout')?.classList.add('chat-open');
      // Mark active in list
      document.querySelectorAll('.dm-conv-item').forEach(el => el.classList.remove('active'));
      const activeLi = document.querySelector(`.dm-conv-item[data-id="${CSS.escape(userId)}"]`);
      if (activeLi) activeLi.classList.add('active');
      // Open the DM socket room + clear messages
      openChat('dm', userId);
    }

    // Build a conversation list item
    function makeConvItem(conv) {
      const el = document.createElement('div');
      el.className = 'dm-conv-item';
      el.dataset.id = conv.userId;
      const color    = avatarColor(conv.userId);
      const initials = avatarInitials(conv.userName);
      const time     = dmTimeLabel(conv.lastAt ? new Date(conv.lastAt).getTime() : 0);
      const preview  = conv.lastMessage
        ? (conv.lastSenderId === currentUser.id ? 'You: ' : '') + conv.lastMessage
        : 'Start a conversation';
      el.innerHTML =
        `<div class="dm-conv-av" style="background:${color}">${escapeHtml(initials)}</div>` +
        `<div class="dm-conv-info">` +
          `<div class="dm-conv-row1">` +
            `<span class="dm-conv-name">${escapeHtml(conv.userName)}</span>` +
            `<span class="dm-conv-time">${escapeHtml(time)}</span>` +
          `</div>` +
          `<div class="dm-conv-preview">${escapeHtml(preview)}</div>` +
        `</div>`;
      el.addEventListener('click', () => selectConversation(conv.userId, conv.userName));
      return el;
    }

    // Load existing conversations from the server
    function loadConversations() {
      fetch(`${API_BASE}/api/chat/conversations`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data.conversations) ? data.conversations : [];
          if (dmConvList) dmConvList.innerHTML = '';
          if (!list.length) {
            if (dmConvEmpty) { dmConvEmpty.hidden = false; dmConvList?.appendChild(dmConvEmpty); }
            return;
          }
          if (dmConvEmpty) dmConvEmpty.hidden = true;
          list.forEach(conv => dmConvList?.appendChild(makeConvItem(conv)));
        })
        .catch(() => {});
    }
    loadConversations();

    // ── Friend-request helpers ─────────────────────────────────────────
    function friendBtnHtml(status, requestId) {
      if (status === 'friends')
        return `<button class="dm-friend-btn dm-friend-btn--friends" data-action="friends" disabled>Friends ✓</button>`;
      if (status === 'sent')
        return `<button class="dm-friend-btn dm-friend-btn--sent"    data-action="sent"    disabled>Requested</button>`;
      if (status === 'received')
        return `<button class="dm-friend-btn dm-friend-btn--received" data-action="received" data-rid="${escapeHtml(requestId||'')}">Accept ✓</button>`;
      return `<button class="dm-friend-btn dm-friend-btn--add" data-action="add">+ Add Friend</button>`;
    }

    async function handleFriendBtn(btn, userId) {
      const action = btn.dataset.action;
      if (action === 'friends' || action === 'sent') return;
      btn.disabled = true;
      try {
        if (action === 'add') {
          const resp = await fetch(`${API_BASE}/api/friends/request`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toId: userId }),
          });
          const data = await resp.json();
          if (data.status === 'accepted') {
            btn.className = 'dm-friend-btn dm-friend-btn--friends';
            btn.textContent = 'Friends ✓'; btn.dataset.action = 'friends';
          } else {
            btn.className = 'dm-friend-btn dm-friend-btn--sent';
            btn.textContent = 'Requested'; btn.dataset.action = 'sent';
          }
        } else if (action === 'received') {
          const rid = btn.dataset.rid;
          await fetch(`${API_BASE}/api/friends/accept/${encodeURIComponent(rid)}`, {
            method: 'POST', credentials: 'include',
          });
          btn.className = 'dm-friend-btn dm-friend-btn--friends';
          btn.textContent = 'Friends ✓'; btn.dataset.action = 'friends';
          loadRequestsBadge();
        }
      } catch { btn.disabled = false; }
    }

    // ── Requests badge ─────────────────────────────────────────────
    async function loadRequestsBadge() {
      try {
        const resp = await fetch(`${API_BASE}/api/friends/requests`, { credentials: 'include' });
        const { requests } = await resp.json();
        const count = Array.isArray(requests) ? requests.length : 0;
        if (dmRequestsBadge) { dmRequestsBadge.textContent = count; dmRequestsBadge.hidden = count === 0; }
      } catch {}
    }
    loadRequestsBadge();

    // ── Requests tab: show / hide ──────────────────────────────────
    let activeTab = 'messages';

    function showRequestsList() {
      fetch(`${API_BASE}/api/friends/requests`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          // Hide conversation items
          dmConvList?.querySelectorAll('.dm-conv-item, .dm-conv-empty, .dm-search-people')
            .forEach(el => { el.hidden = true; });
          dmConvList?.querySelector('.dm-req-list')?.remove();

          const reqList = document.createElement('div');
          reqList.className = 'dm-req-list';
          const reqs = Array.isArray(data.requests) ? data.requests : [];
          if (!reqs.length) {
            reqList.innerHTML = '<div class="dm-conv-empty">No pending requests.</div>';
          } else {
            reqs.forEach(req => {
              const item = document.createElement('div');
              item.className = 'dm-req-item';
              const color = avatarColor(req.userId), initials = avatarInitials(req.userName);
              item.innerHTML =
                `<div class="dm-conv-av" style="background:${color}">${escapeHtml(initials)}</div>` +
                `<div class="dm-req-info">` +
                  `<span class="dm-req-name">${escapeHtml(req.userName)}</span>` +
                  `<span class="dm-req-sub">Sent you a friend request</span>` +
                `</div>` +
                `<div class="dm-req-actions">` +
                  `<button class="dm-friend-btn dm-friend-btn--accept" data-rid="${escapeHtml(req.requestId)}">Accept</button>` +
                  `<button class="dm-friend-btn dm-friend-btn--decline" data-rid="${escapeHtml(req.requestId)}">Decline</button>` +
                `</div>`;

              function removeReqItem() {
                item.remove();
                const left = reqList.querySelectorAll('.dm-req-item').length;
                if (dmRequestsBadge) { dmRequestsBadge.textContent = left; dmRequestsBadge.hidden = left === 0; }
                if (!left) reqList.innerHTML = '<div class="dm-conv-empty">No pending requests.</div>';
              }
              item.querySelector('.dm-friend-btn--accept').addEventListener('click', async () => {
                try {
                  await fetch(`${API_BASE}/api/friends/accept/${encodeURIComponent(req.requestId)}`, {
                    method: 'POST', credentials: 'include',
                  });
                  removeReqItem();
                } catch {}
              });
              item.querySelector('.dm-friend-btn--decline').addEventListener('click', async () => {
                try {
                  await fetch(`${API_BASE}/api/friends/decline/${encodeURIComponent(req.requestId)}`, {
                    method: 'POST', credentials: 'include',
                  });
                  removeReqItem();
                } catch {}
              });
              reqList.appendChild(item);
            });
          }
          dmConvList?.appendChild(reqList);
        })
        .catch(() => {});
    }

    function showMessagesTab() {
      dmConvList?.querySelector('.dm-req-list')?.remove();
      dmConvList?.querySelectorAll('.dm-conv-item, .dm-conv-empty')
        .forEach(el => { el.hidden = false; });
      // Re-apply search filter if active
      if (dmSearch?.value.trim()) dmSearch.dispatchEvent(new Event('input'));
    }

    dmTabMessages?.addEventListener('click', () => {
      if (activeTab === 'messages') return;
      activeTab = 'messages';
      dmTabMessages.classList.add('dm-tab--active');
      dmTabRequests?.classList.remove('dm-tab--active');
      showMessagesTab();
    });
    dmTabRequests?.addEventListener('click', () => {
      if (activeTab === 'requests') return;
      activeTab = 'requests';
      dmTabRequests.classList.add('dm-tab--active');
      dmTabMessages?.classList.remove('dm-tab--active');
      showRequestsList();
    });

    // Sidebar search: filter existing conversations + search for new people
    let sidebarSearchTimer = null;
    let dmSearchResultsEl  = null;

    function clearSidebarSearchResults() {
      if (dmSearchResultsEl) { dmSearchResultsEl.remove(); dmSearchResultsEl = null; }
    }

    if (dmSearch) {
      dmSearch.addEventListener('input', () => {
        const q  = dmSearch.value.trim();
        const ql = q.toLowerCase();
        clearSidebarSearchResults();
        clearTimeout(sidebarSearchTimer);

        // Filter existing conversation items
        document.querySelectorAll('.dm-conv-item').forEach(li => {
          const name = li.querySelector('.dm-conv-name')?.textContent.toLowerCase() || '';
          li.hidden = q ? !name.includes(ql) : false;
        });

        if (q.length < 2) return;

        // Also search for users to message
        sidebarSearchTimer = setTimeout(async () => {
          try {
            const resp = await fetch(
              `${API_BASE}/api/chat/users/search?q=${encodeURIComponent(q)}`,
              { credentials: 'include' }
            );
            const { users } = await resp.json();
            if (!users?.length || !dmConvList) return;

            dmSearchResultsEl = document.createElement('div');
            dmSearchResultsEl.className = 'dm-search-people';
            dmSearchResultsEl.innerHTML = '<div class="dm-search-people-label">People</div>';

            // Batch fetch friendship status
            let sbStatuses = {}, sbRequestIds = {};
            try {
              const ids = users.map(u => u.id).join(',');
              const sr  = await fetch(`${API_BASE}/api/friends/batch-status?ids=${ids}`, { credentials: 'include' });
              const sd  = await sr.json();
              sbStatuses   = sd.statuses   || {};
              sbRequestIds = sd.requestIds || {};
            } catch {}

            users.forEach(u => {
              const displayName  = u.chatNickname || u.name;
              const friendStatus = sbStatuses[u.id] || 'none';
              const item = document.createElement('div');
              item.className = 'dm-conv-item dm-conv-item--search';
              item.dataset.id = u.id;
              item.innerHTML =
                `<div class="dm-conv-av" style="background:${avatarColor(u.id)}">${escapeHtml(avatarInitials(displayName))}</div>` +
                `<div class="dm-conv-info">` +
                  `<div class="dm-conv-row1"><span class="dm-conv-name">${escapeHtml(displayName)}</span></div>` +
                  `<div class="dm-conv-preview">Tap to message</div>` +
                `</div>` +
                `<div class="dm-sb-friend">${friendBtnHtml(friendStatus, sbRequestIds[u.id])}</div>`;
              item.addEventListener('click', (e) => {
                if (e.target.closest('.dm-friend-btn')) return;
                dmSearch.value = '';
                clearSidebarSearchResults();
                document.querySelectorAll('.dm-conv-item').forEach(li => { li.hidden = false; });
                if (!document.querySelector(`.dm-conv-item[data-id="${CSS.escape(u.id)}"]`)) {
                  const conv = makeConvItem({ userId: u.id, userName: displayName, lastMessage: '', lastAt: null, lastSenderId: null });
                  dmConvList?.prepend(conv);
                  if (dmConvEmpty) dmConvEmpty.hidden = true;
                }
                selectConversation(u.id, displayName);
              });
              const fBtn = item.querySelector('.dm-friend-btn');
              if (fBtn) fBtn.addEventListener('click', (e) => { e.stopPropagation(); handleFriendBtn(fBtn, u.id); });
              dmSearchResultsEl.appendChild(item);
            });

            if (dmSearchResultsEl.children.length > 1) {
              dmConvList.appendChild(dmSearchResultsEl);
            }
          } catch {}
        }, 300);
      });
    }

    // Close conversation (back to welcome)
    if (dmCloseChat) {
      dmCloseChat.addEventListener('click', () => {
        if (dmChat)    dmChat.hidden    = true;
        if (dmWelcome) dmWelcome.hidden = false;
        document.querySelector('.dm-layout')?.classList.remove('chat-open');
        document.querySelectorAll('.dm-conv-item').forEach(el => el.classList.remove('active'));
      });
    }

    // Delete entire conversation
    const dmDeleteConv = document.getElementById('dmDeleteConv');
    if (dmDeleteConv) {
      dmDeleteConv.addEventListener('click', () => {
        const targetId = currentChat?.type === 'dm' ? currentChat.id : null;
        if (!targetId) return;
        const targetName = dmChatName?.textContent || 'this conversation';
        if (!confirm(`Delete your entire conversation with ${targetName}? This cannot be undone.`)) return;
        socket.emit('delete-dm', { targetUserId: targetId });
      });
    }

    // Handle dm-deleted: clear messages + remove from sidebar if this user was affected
    socket.on('dm-deleted', ({ roomId }) => {
      // Only act if we're currently viewing this room
      if (currentChat?.type === 'dm') {
        const myRoom = [currentUser.id, currentChat.id].sort().join(':');
        if (myRoom === roomId) {
          // Clear messages panel
          if (messagesEl) messagesEl.innerHTML = '';
        }
      }
      // Remove the conversation from the sidebar
      const parts = roomId.split(':');
      const otherId = parts.find(p => p !== currentUser.id);
      if (otherId) {
        const convItem = document.querySelector(`.dm-conv-item[data-id="${CSS.escape(otherId)}"]`);
        convItem?.remove();
      }
    });

    // ── New message modal ──────────────────────────────────────────
    function openNewModal() {
      if (!dmNewModal) return;
      dmNewModal.hidden = false;
      if (dmUserSearch) { dmUserSearch.value = ''; dmUserSearch.focus(); }
      if (dmUserResults) dmUserResults.innerHTML = '';
    }
    function closeNewModal() { if (dmNewModal) dmNewModal.hidden = true; }

    if (dmNewBtn)        dmNewBtn.addEventListener('click', openNewModal);
    if (dmWelcomeStart)  dmWelcomeStart.addEventListener('click', openNewModal);
    if (dmNewModalClose) dmNewModalClose.addEventListener('click', closeNewModal);
    document.addEventListener('click', (e) => {
      if (!dmNewModal?.hidden &&
          !dmNewModal.contains(e.target) &&
          e.target !== dmNewBtn &&
          e.target !== dmWelcomeStart) {
        closeNewModal();
      }
    });

    // User search inside modal (with friend-request buttons)
    let userSearchTimer = null;
    if (dmUserSearch) {
      dmUserSearch.addEventListener('input', () => {
        clearTimeout(userSearchTimer);
        const q = dmUserSearch.value.trim();
        if (q.length < 2) { if (dmUserResults) dmUserResults.innerHTML = ''; return; }
        userSearchTimer = setTimeout(async () => {
          try {
            const resp = await fetch(
              `${API_BASE}/api/chat/users/search?q=${encodeURIComponent(q)}`,
              { credentials: 'include' }
            );
            const { users } = await resp.json();
            if (!dmUserResults) return;
            dmUserResults.innerHTML = '';
            if (!users?.length) {
              dmUserResults.innerHTML = '<li class="dm-user-none">No users found.</li>';
              return;
            }
            // Batch fetch friendship status for all results
            let statuses = {}, requestIds = {};
            try {
              const ids = users.map(u => u.id).join(',');
              const sr  = await fetch(`${API_BASE}/api/friends/batch-status?ids=${ids}`, { credentials: 'include' });
              const sd  = await sr.json();
              statuses   = sd.statuses   || {};
              requestIds = sd.requestIds || {};
            } catch {}

            users.forEach(u => {
              const li = document.createElement('li');
              li.className = 'dm-user-result';
              li.setAttribute('role', 'option');
              const displayName  = u.chatNickname || u.name;
              const friendStatus = statuses[u.id] || 'none';
              li.innerHTML =
                `<div class="dm-user-av" style="background:${avatarColor(u.id)}">${escapeHtml(avatarInitials(displayName))}</div>` +
                `<span class="dm-user-name">${escapeHtml(displayName)}</span>` +
                friendBtnHtml(friendStatus, requestIds[u.id]);
              // Click on row (not friend btn) → open DM
              li.addEventListener('click', (e) => {
                if (e.target.closest('.dm-friend-btn')) return;
                closeNewModal();
                if (!document.querySelector(`.dm-conv-item[data-id="${CSS.escape(u.id)}"]`)) {
                  const item = makeConvItem({ userId: u.id, userName: displayName, lastMessage: '', lastAt: null, lastSenderId: null });
                  if (dmConvList) dmConvList.prepend(item);
                  if (dmConvEmpty) dmConvEmpty.hidden = true;
                }
                selectConversation(u.id, displayName);
              });
              // Friend button click
              const fBtn = li.querySelector('.dm-friend-btn');
              if (fBtn) fBtn.addEventListener('click', (e) => { e.stopPropagation(); handleFriendBtn(fBtn, u.id); });
              dmUserResults.appendChild(li);
            });
          } catch {}
        }, 300);
      });
    }

    // ── Live sidebar updates when a DM arrives ─────────────────────
    onDmMessage = function(msg) {
      // Determine the other party's ID
      const senderId  = msg.fromId || msg.userId || '';
      const otherId   = senderId === currentUser.id ? (msg.to || '') : senderId;
      const otherName = senderId === currentUser.id
        ? (dmChatName?.textContent || 'Unknown')
        : (msg.from || msg.user || 'Unknown');
      if (!otherId) return;
      const preview = (senderId === currentUser.id ? 'You: ' : '') + (msg.text || '');
      const time    = dmTimeLabel(msg.ts || Date.now());
      let item = dmConvList?.querySelector(`.dm-conv-item[data-id="${CSS.escape(otherId)}"]`);
      if (item) {
        const p = item.querySelector('.dm-conv-preview'); if (p) p.textContent = preview;
        const t = item.querySelector('.dm-conv-time');    if (t) t.textContent = time;
        dmConvList.prepend(item);
      } else {
        item = makeConvItem({
          userId: otherId, userName: otherName,
          lastMessage: msg.text, lastAt: msg.ts || Date.now(), lastSenderId: senderId,
        });
        dmConvList?.prepend(item);
        if (dmConvEmpty) dmConvEmpty.hidden = true;
      }
    };

    // ── Open from URL params (e.g. clicking a name in Global Chat) ─
    const urlUserId   = params.get('userId');
    const urlUserName = params.get('userName');
    if (urlUserId) {
      selectConversation(urlUserId, urlUserName ? decodeURIComponent(urlUserName) : urlUserId);
    }
  }
})();
