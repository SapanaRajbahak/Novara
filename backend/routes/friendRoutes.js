const express     = require('express');
const router      = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma      = new PrismaClient();

function requireAuth(req, res, next) {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Authentication required' });
  next();
}

// ── GET /api/friends/requests ───────────────────────────────────────────────
// Incoming pending friend requests for the current user.
router.get('/requests', requireAuth, async (req, res) => {
  const myId = req.session.user.id;
  try {
    const requests = await prisma.friendRequest.findMany({
      where:   { toId: myId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        from: { select: { id: true, name: true, chatNickname: true } },
      },
    });
    const mapped = requests.map(r => ({
      requestId: r.id,
      userId:    r.fromId,
      userName:  r.from.chatNickname || r.from.name,
      createdAt: r.createdAt,
    }));
    res.json({ requests: mapped });
  } catch (err) {
    console.error('[FriendRoutes] GET /requests error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/friends/request { toId } ─────────────────────────────────────
// Send a friend request. Idempotent — upserts pending status.
router.post('/request', requireAuth, async (req, res) => {
  const fromId = req.session.user.id;
  const { toId } = req.body;
  if (!toId || toId === fromId) return res.status(400).json({ error: 'Invalid target user' });
  try {
    // If they already sent us a request, auto-accept instead
    const reverse = await prisma.friendRequest.findUnique({
      where: { fromId_toId: { fromId: toId, toId: fromId } },
    });
    if (reverse && reverse.status === 'pending') {
      // Auto-accept both directions
      await prisma.friendRequest.update({
        where: { fromId_toId: { fromId: toId, toId: fromId } },
        data:  { status: 'accepted' },
      });
      // Create our side as accepted too
      await prisma.friendRequest.upsert({
        where:  { fromId_toId: { fromId, toId } },
        create: { fromId, toId, status: 'accepted' },
        update: { status: 'accepted' },
      });
      return res.json({ status: 'accepted' });
    }

    const req2 = await prisma.friendRequest.upsert({
      where:  { fromId_toId: { fromId, toId } },
      create: { fromId, toId, status: 'pending' },
      update: { status: 'pending' },
    });
    res.json({ status: req2.status, requestId: req2.id });
  } catch (err) {
    console.error('[FriendRoutes] POST /request error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/friends/accept/:requestId ────────────────────────────────────
router.post('/accept/:requestId', requireAuth, async (req, res) => {
  const myId = req.session.user.id;
  try {
    const fr = await prisma.friendRequest.findUnique({ where: { id: req.params.requestId } });
    if (!fr || fr.toId !== myId) return res.status(403).json({ error: 'Not found' });
    await prisma.friendRequest.update({ where: { id: fr.id }, data: { status: 'accepted' } });
    // Ensure reverse entry exists as accepted so both sides know they're friends
    await prisma.friendRequest.upsert({
      where:  { fromId_toId: { fromId: myId, toId: fr.fromId } },
      create: { fromId: myId, toId: fr.fromId, status: 'accepted' },
      update: { status: 'accepted' },
    });
    res.json({ status: 'accepted' });
  } catch (err) {
    console.error('[FriendRoutes] POST /accept error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/friends/decline/:requestId ───────────────────────────────────
router.post('/decline/:requestId', requireAuth, async (req, res) => {
  const myId = req.session.user.id;
  try {
    const fr = await prisma.friendRequest.findUnique({ where: { id: req.params.requestId } });
    if (!fr || fr.toId !== myId) return res.status(403).json({ error: 'Not found' });
    await prisma.friendRequest.delete({ where: { id: fr.id } });
    res.json({ status: 'declined' });
  } catch (err) {
    console.error('[FriendRoutes] POST /decline error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/friends/status/:userId ────────────────────────────────────────
// Returns friendship status between current user and target user.
// Returns: { status: "none" | "sent" | "received" | "friends" }
router.get('/status/:userId', requireAuth, async (req, res) => {
  const myId    = req.session.user.id;
  const otherId = req.params.userId;
  try {
    const [sent, received] = await Promise.all([
      prisma.friendRequest.findUnique({ where: { fromId_toId: { fromId: myId, toId: otherId } } }),
      prisma.friendRequest.findUnique({ where: { fromId_toId: { fromId: otherId, toId: myId } } }),
    ]);
    let status = 'none';
    if (sent?.status === 'accepted' || received?.status === 'accepted') status = 'friends';
    else if (sent?.status === 'pending')     status = 'sent';
    else if (received?.status === 'pending') status = 'received';
    res.json({ status });
  } catch (err) {
    console.error('[FriendRoutes] GET /status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/friends/batch-status?ids=id1,id2,... ──────────────────────────
// Batch friendship status for multiple user IDs (used by search results).
router.get('/batch-status', requireAuth, async (req, res) => {
  const myId = req.session.user.id;
  const ids  = (req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
  if (!ids.length) return res.json({ statuses: {} });
  try {
    const [sent, received] = await Promise.all([
      prisma.friendRequest.findMany({ where: { fromId: myId, toId: { in: ids } }, select: { toId: true, status: true } }),
      prisma.friendRequest.findMany({ where: { toId: myId, fromId: { in: ids } }, select: { fromId: true, status: true, id: true } }),
    ]);
    const statuses = {};
    const requestIds = {};
    ids.forEach(id => { statuses[id] = 'none'; });
    sent.forEach(r => {
      if (r.status === 'accepted') statuses[r.toId] = 'friends';
      else if (r.status === 'pending') statuses[r.toId] = 'sent';
    });
    received.forEach(r => {
      if (r.status === 'accepted') statuses[r.fromId] = 'friends';
      else if (r.status === 'pending' && statuses[r.fromId] !== 'friends') {
        statuses[r.fromId] = 'received';
        requestIds[r.fromId] = r.id;
      }
    });
    res.json({ statuses, requestIds });
  } catch (err) {
    console.error('[FriendRoutes] GET /batch-status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
