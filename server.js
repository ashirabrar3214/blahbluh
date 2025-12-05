// New backend implementation for random chat pairing using Express + Socket.IO
// This keeps the same REST endpoint names and socket event names

const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// ==============================
// In-memory state
// ==============================

// Users that are waiting to be paired: [{ userId, username, joinedAt }]
let waitingUsers = [];

// Active chats: chatId -> { id, users: [userId1, userId2], createdAt }
const activeChats = new Map();

// All known users (for queue re-add etc.): userId -> { userId, username }
const users = new Map();

// Pairings: userId -> { chatId, users: [userId1, userId2] }
const activePairings = new Map();

// Socket tracking: userId -> Set(socketId)
const userSockets = new Map();

// ==============================
// Utility: random names
// ==============================

const adjectives = [
  'Shearing', 'Colliding', 'Dancing', 'Flying', 'Jumping', 'Spinning',
  'Glowing', 'Bouncing', 'Sliding', 'Rolling', 'Floating', 'Zooming',
  'Giggling', 'Sparkling', 'Wobbling', 'Drifting', 'Blazing', 'Twinkling',
  'Rushing', 'Swirling',
];

const nouns = [
  'Chicken', 'Banana', 'Penguin', 'Unicorn', 'Dragon', 'Butterfly',
  'Elephant', 'Pineapple', 'Octopus', 'Flamingo', 'Giraffe', 'Koala',
  'Dolphin', 'Cactus', 'Rainbow', 'Tornado', 'Meteor', 'Galaxy', 'Phoenix',
  'Wizard',
];

function generateRandomName() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

// ==============================
// Utility: socket helpers
// ==============================

function isUserOffline(userId) {
  const sockets = userSockets.get(userId);
  return !sockets || sockets.size === 0;
}

function emitToUser(userId, event, payload) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  sockets.forEach((socketId) => {
    io.to(socketId).emit(event, payload);
  });
}

// ==============================
// Pairing logic
// ==============================

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

// Randomly pick and remove one user from waitingUsers
function popRandomUser() {
  if (waitingUsers.length === 0) return null;
  const idx = randomInt(waitingUsers.length);
  const [user] = waitingUsers.splice(idx, 1);
  return user;
}

// Try to pair as many users as possible randomly
function tryPairUsers() {
  // Clean dead entries: keep only users that are currently online
  const before = waitingUsers.length;
  waitingUsers = waitingUsers.filter((u) => !isUserOffline(u.userId));
  const after = waitingUsers.length;
  if (before !== after) {
    console.log(`🧹 Cleaned offline users from queue: before=${before} after=${after}`);
  }

  while (waitingUsers.length >= 2) {
    console.log('🔄 Attempting random pairing; queue size =', waitingUsers.length);

    const user1 = popRandomUser();
    const user2 = popRandomUser();

    if (!user1 || !user2) break;

    console.log(
      '👥 Pairing users:',
      `${user1.username} (${user1.userId}) with ${user2.username} (${user2.userId})`
    );

    const chatId = uuidv4();
    const chat = {
      id: chatId,
      users: [user1.userId, user2.userId],
      createdAt: Date.now(),
    };

    activeChats.set(chatId, chat);

    const pairingData = {
      chatId,
      users: [
        { userId: user1.userId, username: user1.username },
        { userId: user2.userId, username: user2.username },
      ],
    };

    activePairings.set(user1.userId, pairingData);
    activePairings.set(user2.userId, pairingData);

    console.log('💬 Created chat room:', chatId);
    console.log('📊 Active chats:', activeChats.size);

    // Notify both users individually
    emitToUser(user1.userId, 'chat-paired', pairingData);
    emitToUser(user2.userId, 'chat-paired', pairingData);

    console.log('✅ Pairing complete; queue size now =', waitingUsers.length);
  }
}

// Periodic background pairing check
setInterval(() => {
  if (waitingUsers.length >= 2) {
    console.log('⏰ Interval pairing check; queue size =', waitingUsers.length);
    tryPairUsers();
  }
}, 1000);

// ==============================
// REST API
// ==============================

app.get('/', (req, res) => {
  res.json({ message: 'BlahBluh Backend API is running!' });
});

app.get('/api/generate-user', (req, res) => {
  const userId = uuidv4();
  const username = generateRandomName();
  users.set(userId, { userId, username });
  console.log('🆔 Generated user:', userId, username);
  res.json({ userId, username });
});

// Join queue
app.post('/api/join-queue', (req, res) => {
  console.log('🔄 /api/join-queue body =', req.body);
  let { userId, username } = req.body;

  // Auto-generate if missing
  if (!userId || !username) {
    userId = uuidv4();
    username = generateRandomName();
    console.log('🆔 Auto-assigned user:', userId, username);
  }

  // Remember user info
  if (!users.has(userId)) {
    users.set(userId, { userId, username });
  }

  // If already in an active pairing, just return that
  if (activePairings.has(userId)) {
    console.log('ℹ️ User already paired, not re-queuing:', userId);
    return res.json({
      message: 'Already paired',
      inQueue: false,
      userId,
      username,
    });
  }

  // If they are already in queue, do nothing
  const alreadyInQueue = waitingUsers.some((u) => u.userId === userId);
  if (!alreadyInQueue) {
    waitingUsers.push({ userId, username, joinedAt: Date.now() });
  }

  console.log('✅ Queue add; queue size =', waitingUsers.length);

  // Immediately try pairing
  tryPairUsers();

  const position = waitingUsers.findIndex((u) => u.userId === userId) + 1;

  res.json({
    message: 'Added to queue',
    inQueue: position > 0,
    queuePosition: position > 0 ? position : 0,
    userId,
    username,
  });
});

// Leave queue or active chat
app.post('/api/leave-queue', (req, res) => {
  const { userId } = req.body;
  console.log('🚪 /api/leave-queue for', userId);

  // Remove from waiting queue
  const before = waitingUsers.length;
  waitingUsers = waitingUsers.filter((u) => u.userId !== userId);
  const after = waitingUsers.length;
  console.log(`🧹 Removed from queue if present; before=${before} after=${after}`);

  // If user is currently in a pairing, clean up and requeue partner
  if (activePairings.has(userId)) {
    const pairingData = activePairings.get(userId);
    const { chatId, users: paired } = pairingData;

    console.log('👋 Leaving active chat:', chatId, 'by user', userId);

    const partner = paired.find((u) => u.userId !== userId);

    // Remove mapping for both users
    paired.forEach((u) => activePairings.delete(u.userId));
    activeChats.delete(chatId);

    // Requeue partner if still known
    if (partner && users.has(partner.userId)) {
      const partnerData = users.get(partner.userId);
      const partnerAlreadyQueued = waitingUsers.some(
        (u) => u.userId === partner.userId
      );
      if (!partnerAlreadyQueued) {
        waitingUsers.push({ ...partnerData, joinedAt: Date.now() });
        console.log('🔁 Requeued partner:', partner.userId);
      }
      emitToUser(partner.userId, 'partner-left', { chatId });
    }

    // Try to pair again
    tryPairUsers();
  }

  res.json({ message: 'Left queue', inQueue: false });
});

// Queue status
app.get('/api/queue-status/:userId', (req, res) => {
  const { userId } = req.params;
  const position = waitingUsers.findIndex((u) => u.userId === userId) + 1;
  res.json({
    inQueue: position > 0,
    queuePosition: position > 0 ? position : 0,
    totalInQueue: waitingUsers.length,
  });
});

// ==============================
// Socket.IO handlers
// ==============================

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  // Step 1: register which user this socket belongs to
  socket.on('register-user', ({ userId }) => {
    if (!userId) return;
    socket.userId = userId;

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    console.log('📝 Registered socket for user', userId, '->', socket.id);

    // If user was already paired before connection, resend pairing info
    if (activePairings.has(userId)) {
      const pairingData = activePairings.get(userId);
      socket.emit('chat-paired', pairingData);
    }
  });

  // Step 2: join a chat room by chatId
  socket.on('join-chat', ({ userId, chatId }) => {
    console.log('🏠 join-chat:', userId, chatId);
    socket.join(chatId);
    socket.userId = userId;
    socket.chatId = chatId;
  });

  // Step 3: sending a message
  socket.on('send-message', ({ chatId, message, userId, username }) => {
    if (!chatId || !message) return;
    console.log('💬 Message from', userId, 'in chat', chatId, ':', message);

    const payload = {
      id: uuidv4(),
      message,
      userId,
      username,
      timestamp: Date.now(),
    };

    io.to(chatId).emit('new-message', payload);
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected:', socket.id);
    const userId = socket.userId;
    if (!userId) return;

    const set = userSockets.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(userId);
      }
    }

    if (!isUserOffline(userId)) {
      console.log('ℹ️ User still has other sockets open:', userId);
      return;
    }

    console.log('🚪 User fully offline:', userId);

    // If user is in active pairing, treat as a leave and requeue partner
    if (activePairings.has(userId)) {
      const pairingData = activePairings.get(userId);
      const { chatId, users: paired } = pairingData;

      console.log('👋 Fully offline paired user:', userId, 'from chat', chatId);

      const partner = paired.find((u) => u.userId !== userId);

      paired.forEach((u) => activePairings.delete(u.userId));
      activeChats.delete(chatId);

      if (partner && users.has(partner.userId)) {
        const partnerData = users.get(partner.userId);
        const partnerAlreadyQueued = waitingUsers.some(
          (u) => u.userId === partner.userId
        );
        if (!partnerAlreadyQueued) {
          waitingUsers.push({ ...partnerData, joinedAt: Date.now() });
          console.log('🔁 Requeued partner on disconnect:', partner.userId);
        }
        emitToUser(partner.userId, 'partner-left', { chatId });
      }

      tryPairUsers();
    } else {
      // If user was only waiting, remove them from queue
      const before = waitingUsers.length;
      waitingUsers = waitingUsers.filter((u) => u.userId !== userId);
      const after = waitingUsers.length;
      if (before !== after) {
        console.log(
          `🧹 Removed offline waiting user from queue: before=${before} after=${after}`
        );
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
