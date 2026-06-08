const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('../middleware/auth');

const prisma = new PrismaClient();

// Validation helper
function validateNick(nickname) {
  if (!nickname || nickname.length < 2)  return 'Nickname must be at least 2 characters.';
  if (nickname.length > 20)              return 'Nickname must be 20 characters or fewer.';
  if (!/^[\w\s\-\.]+$/.test(nickname))  return 'Only letters, numbers, spaces, hyphens, and dots allowed.';
  return null;
}

// GET /api/chat/nickname
// Returns the current user's saved chat nickname (or null if not set yet)
router.get('/nickname', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.session.user.id },
      select: { chatNickname: true },
    });
    res.json({ nickname: user?.chatNickname || null });
  } catch (err) {
    console.error('[ChatRoutes] GET /nickname error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat/nickname   { nickname: "..." }
// Validates, checks global uniqueness, saves to the user record.
// Returns 409 if the nickname is already taken by another user.
router.post('/nickname', requireAuth, async (req, res) => {
  const nickname = (req.body.nickname || '').trim();
  const err = validateNick(nickname);
  if (err) return res.status(400).json({ error: err });

  try {
    // Case-insensitive uniqueness check
    const conflict = await prisma.user.findFirst({
      where: {
        chatNickname: { equals: nickname, mode: 'insensitive' },
        id: { not: req.session.user.id },
      },
      select: { id: true },
    });

    if (conflict) {
      return res.status(409).json({ error: 'That nickname is already taken. Please choose another.' });
    }

    await prisma.user.update({
      where: { id: req.session.user.id },
      data:  { chatNickname: nickname },
    });

    res.json({ nickname });
  } catch (err) {
    console.error('[ChatRoutes] POST /nickname error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DM CONVERSATIONS ───────────────────────────────────────────────────────

// GET /api/chat/conversations
// Returns all DM conversations for the current user, ordered by most recent.
router.get('/conversations', requireAuth, async (req, res) => {
  const myId = req.session.user.id;
  try {
    // Distinct DM rooms involving this user (room IDs are "uid1:uid2", sorted)
    const rooms = await prisma.chatMessage.findMany({
      where: {
        AND: [
          {
            OR: [
              { roomId: { startsWith: `${myId}:` } },
              { roomId: { endsWith:   `:${myId}` } },
            ],
          },
          { NOT: { roomId: { startsWith: 'book:' } } },
          { NOT: { roomId: 'global' } },
        ],
      },
      distinct:  ['roomId'],
      select:    { roomId: true },
      orderBy:   { createdAt: 'desc' },
      take: 50,
    });

    const conversations = await Promise.all(rooms.map(async ({ roomId }) => {
      const latest = await prisma.chatMessage.findFirst({
        where:   { roomId },
        orderBy: { createdAt: 'desc' },
        select:  { text: true, userId: true, createdAt: true },
      });
      const parts   = roomId.split(':');
      const otherId = parts[0] === myId ? parts[1] : parts[0];
      const other   = await prisma.user.findUnique({
        where:  { id: otherId },
        select: { id: true, name: true, chatNickname: true },
      });
      return {
        userId:       otherId,
        userName:     other?.chatNickname || other?.name || 'Unknown',
        lastMessage:  latest?.text   || '',
        lastAt:       latest?.createdAt || null,
        lastSenderId: latest?.userId  || null,
      };
    }));

    res.json({ conversations });
  } catch (err) {
    console.error('[ChatRoutes] GET /conversations error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/chat/users/search?q=
// Search users by name or chatNickname for starting a new DM.
router.get('/users/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ users: [] });
  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.session.user.id },
        OR: [
          { name:         { contains: q, mode: 'insensitive' } },
          { chatNickname: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, chatNickname: true },
      take: 10,
    });
    res.json({ users });
  } catch (err) {
    console.error('[ChatRoutes] GET /users/search error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── SAVED CHAT ROOMS (completely separate from library SavedBook) ──────────────

// GET /api/chat/saved-rooms
// Returns all chat rooms the current user has pinned.
router.get('/saved-rooms', requireAuth, async (req, res) => {
  try {
    const rooms = await prisma.chatSavedRoom.findMany({
      where:   { userId: req.session.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ rooms });
  } catch (err) {
    console.error('[ChatRoutes] GET /saved-rooms error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat/saved-rooms  { bookId, bookTitle, bookCover, bookAuthor }
router.post('/saved-rooms', requireAuth, async (req, res) => {
  const { bookId, bookTitle, bookCover, bookAuthor } = req.body;
  if (!bookId) return res.status(400).json({ error: 'bookId required' });
  try {
    const room = await prisma.chatSavedRoom.upsert({
      where:  { userId_bookId: { userId: req.session.user.id, bookId } },
      update: {},
      create: {
        userId: req.session.user.id,
        bookId,
        bookTitle: bookTitle || '',
        bookCover: bookCover  || null,
        bookAuthor: bookAuthor || null,
      },
    });
    res.json({ room });
  } catch (err) {
    console.error('[ChatRoutes] POST /saved-rooms error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/chat/saved-rooms/:bookId
router.delete('/saved-rooms/:bookId', requireAuth, async (req, res) => {
  try {
    await prisma.chatSavedRoom.deleteMany({
      where: { userId: req.session.user.id, bookId: req.params.bookId },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[ChatRoutes] DELETE /saved-rooms error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
