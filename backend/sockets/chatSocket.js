// backend/sockets/chatSocket.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const HISTORY_LIMIT = 50;
const MAX_MSG_LENGTH = 1000;

function registerChatHandlers(io) {
  io.on('connection', (socket) => {
    const rawUser  = socket.handshake.auth?.user || {};
    const userId   = rawUser.id   || socket.id;
    const userName = (rawUser.name || 'Anon').slice(0, 30);
    console.log(`[Chat] + ${userName} (${socket.id})`);

    let currentRoom = null; // track for room-count on disconnect

    // ── helpers ──────────────────────────────────────────────────

    async function broadcastCount(room) {
      const count = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('room-count', { room, count });
    }

    async function getReactionMaps(messageIds) {
      if (!messageIds.length) return { counts: {}, mine: {} };
      const [countRows, myRows] = await Promise.all([
        prisma.chatReaction.groupBy({
          by: ['messageId', 'emoji'],
          where: { messageId: { in: messageIds } },
          _count: { emoji: true },
        }),
        prisma.chatReaction.findMany({
          where: { messageId: { in: messageIds }, userId },
          select: { messageId: true, emoji: true },
        }),
      ]);
      const counts = {};
      for (const r of countRows) {
        if (!counts[r.messageId]) counts[r.messageId] = {};
        counts[r.messageId][r.emoji] = r._count.emoji;
      }
      const mine = {};
      for (const r of myRows) {
        if (!mine[r.messageId]) mine[r.messageId] = [];
        mine[r.messageId].push(r.emoji);
      }
      return { counts, mine };
    }

    async function sendHistory(roomId, msgType) {
      try {
        const rows = await prisma.chatMessage.findMany({
          where: { roomId },
          orderBy: { createdAt: 'asc' },
          take: HISTORY_LIMIT,
        });
        const { counts, mine } = await getReactionMaps(rows.map(r => r.id));
        const messages = rows.map(r => {
          const m = {
            id:       r.id,
            type:     msgType,
            roomId:   r.roomId,
            userId:   r.userId,
            user:     r.userName,
            from:     r.userName,
            fromId:   r.userId,
            text:     r.text,
            ts:       r.createdAt.getTime(),
            history:  true,
            reactions:   counts[r.id] || {},
            myReactions: mine[r.id]   || [],
          };
          if (msgType === 'book') m.bookId = roomId.replace(/^book:/, '');
          return m;
        });
        socket.emit('chat-history', { roomId, messages });
      } catch (err) {
        console.error('[Chat] history error:', err.message);
      }
    }

    async function saveMsg(roomId, uid, uName, text) {
      try {
        const record = await prisma.chatMessage.create({
          data: { roomId, userId: uid, userName: uName, text },
        });
        return record.id;
      } catch (err) {
        console.error('[Chat] save error:', err.message);
        return null;
      }
    }

    async function getReactionCounts(messageId) {
      const rows = await prisma.chatReaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { emoji: true },
      });
      const reactions = {};
      for (const r of rows) reactions[r.emoji] = r._count.emoji;
      return reactions;
    }

    // ── GLOBAL ───────────────────────────────────────────────────

    socket.on('join-global', async () => {
      if (currentRoom) socket.leave(currentRoom);
      currentRoom = 'global';
      socket.join('global');
      console.log(`[Chat] ${userName} → global`);
      await sendHistory('global', 'global');
      await broadcastCount('global');
    });

    socket.on('global-message', async ({ text }) => {
      if (!text || !text.trim()) return;
      const safe  = text.trim().slice(0, MAX_MSG_LENGTH);
      const msgId = await saveMsg('global', userId, userName, safe);
      const msg   = { id: msgId, type: 'global', user: userName, userId, text: safe, ts: Date.now(), reactions: {} };
      io.to('global').emit('global-message', msg);
    });

    // ── BOOK ─────────────────────────────────────────────────────

    socket.on('join-book', async (bookId) => {
      if (!bookId) return;
      if (currentRoom) socket.leave(currentRoom);
      const room = `book:${bookId}`;
      currentRoom = room;
      socket.join(room);
      console.log(`[Chat] ${userName} → ${room}`);
      await sendHistory(room, 'book');
      await broadcastCount(room);
    });

    socket.on('book-message', async ({ bookId, text }) => {
      if (!bookId || !text || !text.trim()) return;
      const safe  = text.trim().slice(0, MAX_MSG_LENGTH);
      const room  = `book:${bookId}`;
      const msgId = await saveMsg(room, userId, userName, safe);
      const msg   = { id: msgId, type: 'book', bookId, user: userName, userId, text: safe, ts: Date.now(), reactions: {} };
      io.to(room).emit('book-message', msg);
    });

    // ── DMs ──────────────────────────────────────────────────────

    socket.on('join-dm', async (targetUserId) => {
      if (!targetUserId) return;
      if (currentRoom) socket.leave(currentRoom);
      const room = dmRoom(userId, targetUserId);
      currentRoom = room;
      socket.join(room);
      console.log(`[Chat] ${userName} → DM ${room}`);
      await sendHistory(room, 'dm');
    });

    socket.on('dm-message', async ({ to, text }) => {
      if (!to || !text || !text.trim()) return;
      const safe  = text.trim().slice(0, MAX_MSG_LENGTH);
      const room  = dmRoom(userId, to);
      const msgId = await saveMsg(room, userId, userName, safe);
      const msg   = { id: msgId, type: 'dm', from: userName, fromId: userId, to, text: safe, ts: Date.now(), reactions: {} };
      io.to(room).emit('dm-message', msg);
    });

    // ── REACTIONS ────────────────────────────────────────────────

    socket.on('react-message', async ({ messageId, emoji }) => {
      if (!messageId || !emoji) return;
      try {
        const where = { messageId_userId_emoji: { messageId, userId, emoji } };
        const existing = await prisma.chatReaction.findUnique({ where });
        if (existing) {
          await prisma.chatReaction.delete({ where });
        } else {
          await prisma.chatReaction.create({ data: { messageId, userId, emoji } });
        }
        const reactions = await getReactionCounts(messageId);
        // Find the room this message belongs to and broadcast
        const record = await prisma.chatMessage.findUnique({
          where: { id: messageId },
          select: { roomId: true },
        });
        if (record) {
          io.to(record.roomId).emit('message-reactions', { messageId, reactions });
        }
      } catch (err) {
        console.error('[Chat] react error:', err.message);
      }
    });

    // ── DELETE MESSAGE ───────────────────────────────────────────
    // Only the sender can unsend; broadcasts removal to the whole room.
    socket.on('delete-message', async ({ messageId }) => {
      if (!messageId) return;
      try {
        const msg = await prisma.chatMessage.findUnique({
          where:  { id: messageId },
          select: { roomId: true, userId: true },
        });
        if (!msg || msg.userId !== userId) return; // ownership check
        await prisma.chatMessage.delete({ where: { id: messageId } });
        io.to(msg.roomId).emit('message-deleted', { messageId });
      } catch (err) {
        console.error('[Chat] delete error:', err.message);
      }
    });

    // ── DELETE DM CONVERSATION ───────────────────────────────────
    // Deletes all messages in a DM room for both participants.
    socket.on('delete-dm', async ({ targetUserId }) => {
      if (!targetUserId) return;
      try {
        const room = dmRoom(userId, targetUserId);
        await prisma.chatMessage.deleteMany({ where: { roomId: room } });
        io.to(room).emit('dm-deleted', { roomId: room });
      } catch (err) {
        console.error('[Chat] delete-dm error:', err.message);
      }
    });

    // ── ROOM COUNTS (batch) ───────────────────────────────────────
    // Client sends an array of bookIds; we respond with { bookId: count } map
    socket.on('get-room-counts', (bookIds) => {
      if (!Array.isArray(bookIds)) return;
      const result = {};
      bookIds.forEach(id => {
        const room = `book:${id}`;
        result[id] = io.sockets.adapter.rooms.get(room)?.size || 0;
      });
      socket.emit('room-counts', result);
    });

    // ── DISCONNECT ───────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`[Chat] - ${userName} (${socket.id})`);
      if (currentRoom) {
        setTimeout(() => broadcastCount(currentRoom), 150);
      }
    });
  });
}

function dmRoom(a, b) { return [a, b].sort().join(':'); }

module.exports = { registerChatHandlers };
