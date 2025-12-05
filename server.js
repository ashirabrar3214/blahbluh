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

// In-memory storage
let waitingUsers = []; // users waiting to be paired
let activeChats = new Map(); // chatId -> { id, users, createdAt, messages }
let users = new Map(); // userId -> { userId, username, joinedAt }
let activePairings = new Map(); // userId -> { chatId, users }
let userSockets = new Map(); // userId -> Set<socketId>

// Random name generation
const adjectives = [
  'Shearing',
  'Colliding',
  'Dancing',
  'Flying',
  'Jumping',
  'Spinning',
  'Glowing',
  'Bouncing',
  'Sliding',
  'Rolling',
  'Floating',
  'Zooming',
  'Giggling',
  'Sparkling',
  'Wobbling',
  'Drifting',
  'Blazing',
  'Twinkling',
  'Rushing',
  'Swirling',
];

const nouns = [
  'Chicken',
  'Banana',
  'Penguin',
  'Unicorn',
  'Dragon',
  'Butterfly',
  'Elephant',
  'Pineapple',
  'Octopus',
  'Flamingo',
  'Giraffe',
  'Koala',
  'Dolphin',
  'Cactus',
  'Rainbow',
  'Tornado',
  'Meteor',
  'Galaxy',
  'Phoenix',
  'Wizard',
];

function generateRandomName() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective} ${noun}`;
}

function isUserOffline(userId) {
  const sockets = userSockets.get(userId);

  // If we've never seen this user in userSockets yet,
  // treat them as "online/unknown" so they can still be paired.
  if (!sockets) return false;

  // Only offline if we KNOW them and they have zero sockets.
  return sockets.size === 0;
}


// Helper to emit to a specific user (all their sockets)
function emitToUser(userId, event, payload) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.forEach((socketId) => {
    io.to(socketId).emit(event, payload);
  });
}

// Continuous pairing function
function tryPairUsers() {
  // 🔧 First, drop offline users from the queue so we never pair ghosts
  const beforeCleanup = waitingUsers.length;
  waitingUsers = waitingUsers.filter((u) => !isUserOffline(u.userId));
  const afterCleanup = waitingUsers.length;
  if (beforeCleanup !== afterCleanup) {
    console.log(
      `🧹 Cleaned offline users from queue: before=${beforeCleanup} after=${afterCleanup}`
    );
  }

  while (waitingUsers.length >= 2) {
    console.log('🔄 Continuous pairing started - Users in queue:', waitingUsers.length);

    const user1 = waitingUsers.shift();
    const user2 = waitingUsers.shift();

    console.log(
      '👥 Pairing users:',
      user1.username,
      '(',
      user1.userId,
      ') with',
      user2.username,
      '(',
      user2.userId,
      ')'
    );

    const chatId = uuidv4();
    const chat = {
      id: chatId,
      users: [user1, user2],
      createdAt: Date.now(),
      messages: [],
    };

    activeChats.set(chatId, chat);

    const pairingData = { chatId, users: [user1, user2] };
    activePairings.set(user1.userId, pairingData);
    activePairings.set(user2.userId, pairingData);

    console.log('💬 Created new chat room:', chatId);
    console.log('📊 Active chats count:', activeChats.size);
    console.log('🔗 Stored pairings for reconnection recovery');

    console.log('📢 Sending pairing notification to the two users only');
    emitToUser(user1.userId, 'chat-paired', pairingData);
    emitToUser(user2.userId, 'chat-paired', pairingData);

    console.log('✅ Pairing completed - Remaining in queue:', waitingUsers.length);
  }
}

console.log('🚀 Server initializing...');

// Root endpoint
app.get('/', (req, res) => {
  console.log('📍 Root endpoint accessed');
  res.json({ message: 'BlahBluh Backend API is running!' });
});

// Generate random user with name
app.get('/api/generate-user', (req, res) => {
  const randomUserId = uuidv4();
  const randomUsername = generateRandomName();
  console.log('🆔 Generated random user - ID:', randomUserId, 'Name:', randomUsername);
  res.json({ userId: randomUserId, username: randomUsername });
});

// Join queue for random chat (no login required)
app.post('/api/join-queue', (req, res) => {
  console.log('🔄 Join queue request received:', req.body);

  let { userId, username } = req.body;

  // Generate random user if not provided
  if (!userId || !username) {
    userId = uuidv4();
    username = generateRandomName();
    console.log('🆔 Generated random user for queue - ID:', userId, 'Name:', username);
  }

  // Check if user already has an active pairing
  if (activePairings.has(userId)) {
    console.log('🔗 User already paired, not adding to queue:', userId);
    return res.json({ message: 'Already paired', inQueue: false, userId, username });
  }

  // Check if user already in queue
  if (waitingUsers.find((u) => u.userId === userId)) {
    console.log('⚠️ User already in queue:', userId);
    return res.json({ message: 'Already in queue', inQueue: true, userId, username });
  }

  const user = { userId, username, joinedAt: Date.now() };
  waitingUsers.push(user);
  users.set(userId, user);

  console.log('✅ User added to queue:', userId, 'Username:', username);
  console.log('📊 Current queue length:', waitingUsers.length);
  console.log('👥 Users in queue:', waitingUsers.map((u) => `${u.username}(${u.userId})`));

  // Try to pair immediately
  tryPairUsers();

  res.json({
    message: 'Added to queue',
    inQueue: true,
    queuePosition: waitingUsers.findIndex((u) => u.userId === userId) + 1,
    userId,
    username,
  });
});

// Leave queue
app.post('/api/leave-queue', (req, res) => {
  const { userId } = req.body;
  console.log('🚪 Leave queue request for userId:', userId);

  const beforeLength = waitingUsers.length;
  waitingUsers = waitingUsers.filter((u) => u.userId !== userId);
  const afterLength = waitingUsers.length;

  // Handle partner leaving if user was in active chat
  if (activePairings.has(userId)) {
    const pairingData = activePairings.get(userId);
    const { chatId, users: pairedUsers } = pairingData;

    console.log('👋 User leaving active chat - UserId:', userId, 'ChatId:', chatId);

    const leaverId = userId;
    const partner = pairedUsers.find((u) => u.userId !== leaverId);

    // Clean up pairing for both
    pairedUsers.forEach((user) => activePairings.delete(user.userId));
    activeChats.delete(chatId);
    console.log('🗑️ Cleaned up chat room:', chatId);

    // Requeue partner only
    if (partner && users.has(partner.userId)) {
      const partnerData = users.get(partner.userId);

      const alreadyInQueue = waitingUsers.some((u) => u.userId === partner.userId);
      if (!alreadyInQueue) {
        waitingUsers.push(partnerData);
        console.log('🔄 Added partner back to queue:', partner.username, '(', partner.userId, ')');
      }

      // Notify partner only
      emitToUser(partner.userId, 'partner-left', { chatId });
    }

    // Try to pair them with someone else
    tryPairUsers();
  }

  console.log('📊 Queue length before:', beforeLength, 'after:', afterLength);
  res.json({ message: 'Left queue', inQueue: false });
});

// Get queue status
app.get('/api/queue-status/:userId', (req, res) => {
  const { userId } = req.params;
  console.log('📊 Queue status request for userId:', userId);

  const inQueue = waitingUsers.some((u) => u.userId === userId);
  const position = waitingUsers.findIndex((u) => u.userId === userId) + 1;

  console.log('📍 User in queue:', inQueue, 'Position:', position);

  res.json({
    inQueue,
    queuePosition: position || 0,
    totalInQueue: waitingUsers.length,
  });
});

// Socket.IO for real-time chat
io.on('connection', (socket) => {
  console.log('🔌 User connected with socket ID:', socket.id);

  socket.on('register-user', (data) => {
    const { userId } = data;
    console.log('📝 User registered with socket - UserId:', userId, 'SocketId:', socket.id);
    socket.userId = userId;

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    console.log('📊 User socket count:', userSockets.get(userId).size);

    // If this user was already paired while they were disconnected, resend pairing
    if (activePairings.has(userId)) {
      const pairingData = activePairings.get(userId);
      console.log('🔄 Resending pairing event to reconnected user:', userId);
      socket.emit('chat-paired', pairingData);
    }
  });

  socket.on('join-chat', (data) => {
    const { userId, chatId } = data;
    console.log('🏠 User joining chat - UserId:', userId, 'ChatId:', chatId);

    socket.join(chatId);
    socket.userId = userId;
    socket.chatId = chatId;

    // Make sure this socket is tracked as well (in case join-chat is the first event)
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    console.log('📊 User socket count after join-chat:', userSockets.get(userId).size);

    console.log('✅ User successfully joined chat room:', chatId);
  });

  socket.on('send-message', (data) => {
    const { chatId, message, userId, username } = data;
    console.log('💬 Message received - From:', username, 'UserId:', userId, 'ChatId:', chatId);
    console.log('📝 Message content:', message);

    const messageData = {
      id: uuidv4(),
      message,
      userId,
      username,
      timestamp: Date.now(),
    };

    console.log('📤 Broadcasting message to chat:', chatId);
    io.to(chatId).emit('new-message', messageData);
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected - Socket ID:', socket.id);

    if (!socket.userId) {
      return;
    }

    const userId = socket.userId;

    if (userSockets.has(userId)) {
      userSockets.get(userId).delete(socket.id);
      console.log('📊 Remaining sockets for user:', userSockets.get(userId).size);

      if (isUserOffline(userId)) {
        console.log('🚪 User fully offline - UserId:', userId);

        if (!activePairings.has(userId)) {
          // 🔧 Do NOT auto-remove from queue here.
          // They might reconnect in a moment; offline users
          // will be cleaned by tryPairUsers() before pairing.
          console.log(
            'ℹ️ Unpaired user went fully offline; keeping them in queue for now.'
          );
        } else {
          // User was paired - requeue ONLY the partner
          const pairingData = activePairings.get(userId);
          const { chatId, users: pairedUsers } = pairingData;

          console.log('👋 Paired user fully offline - UserId:', userId, 'ChatId:', chatId);

          const leaverId = userId;
          const partner = pairedUsers.find((u) => u.userId !== leaverId);

          // Clean up pairing for both
          pairedUsers.forEach((u) => activePairings.delete(u.userId));
          activeChats.delete(chatId);
          console.log('🗑️ Cleaned up chat room:', chatId);

          // Requeue partner only
          if (partner && users.has(partner.userId)) {
            const partnerData = users.get(partner.userId);

            const alreadyInQueue = waitingUsers.some(
              (u) => u.userId === partner.userId
            );
            if (!alreadyInQueue) {
              waitingUsers.push(partnerData);
              console.log(
                '🔄 Added partner back to queue:',
                partner.username,
                '(',
                partner.userId,
                ')'
              );
            }

            // Notify partner only
            emitToUser(partner.userId, 'partner-left', { chatId });
          }

          // Try to pair them with someone else
          tryPairUsers();
        }

        // Clean up user socket tracking completely
        userSockets.delete(userId);
      } else {
        console.log('🔄 User still has other active sockets, not treating as offline.');
      }
    }
  });
});

// Continuous pairing check - runs every 1 second
setInterval(() => {
  if (waitingUsers.length >= 2) {
    console.log('🔍 Continuous pairing check - Current queue:', waitingUsers.length);
    tryPairUsers();
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
