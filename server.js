const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database', 'db.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read DB
function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database:", error);
    return { services: {}, technicians: [], bookings: [], budget: [], chats: {} };
  }
}

// Helper to write DB
function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error("Error writing database:", error);
    return false;
  }
}

// API Routes

// 0. User Authentication & Login Persistence
app.post('/api/auth/login', (req, res) => {
  const { name, email, avatar, sessionToken } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Missing name or email" });
  }

  const db = readDB();
  
  if (!db.users) db.users = [];
  
  // Find or register new user
  let user = db.users.find(u => u.email === email);
  if (!user) {
    user = {
      id: 'usr_' + Date.now(),
      name,
      email,
      avatar: avatar || '/images/icon.png',
      sessionToken: sessionToken || null,
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    console.log(`👤 [Google Auth] NEW user registered: ${name} (${email})`);
  } else {
    user.name = name;
    user.avatar = avatar || user.avatar;
    user.sessionToken = sessionToken || user.sessionToken;
    user.lastLoginAt = new Date().toISOString();
    console.log(`👤 [Google Auth] Active login session for: ${name} (${email})`);
  }

  // Persist current active session on server database
  db.activeSession = {
    userId: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    sessionToken: user.sessionToken,
    loginTime: new Date().toISOString()
  };

  writeDB(db);
  res.json({ success: true, user, session: db.activeSession });
});

// Get current server session
app.get('/api/auth/session', (req, res) => {
  const db = readDB();
  res.json(db.activeSession || null);
});

// Sign-out session
app.post('/api/auth/logout', (req, res) => {
  const db = readDB();
  if (db.activeSession) {
    console.log(`👤 [Google Auth] User logged out: ${db.activeSession.email}`);
  }
  db.activeSession = null;
  writeDB(db);
  res.json({ success: true });
});

// 1. Get entire catalog services
app.get('/api/services', (req, res) => {
  const db = readDB();
  res.json(db.services);
});

// 2. Get technicians list
app.get('/api/technicians', (req, res) => {
  const db = readDB();
  res.json(db.technicians);
});

// 3. Get bookings
app.get('/api/bookings', (req, res) => {
  const db = readDB();
  // Sort bookings so newest bookings appear first
  const sortedBookings = [...db.bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sortedBookings);
});

// 4. Create new booking
app.post('/api/bookings', (req, res) => {
  const { category, taskName, price, technician, date, timeSlot } = req.body;
  
  if (!category || !taskName || !price || !technician || !date || !timeSlot) {
    return res.status(400).json({ error: "Missing required booking details" });
  }

  const db = readDB();
  const newBooking = {
    id: 'b_' + Date.now(),
    category,
    taskName,
    price: Number(price),
    technician,
    date,
    timeSlot,
    status: 'Assigned',
    createdAt: new Date().toISOString()
  };

  db.bookings.push(newBooking);

  // Automatically add an initial message in chat with this technician if it doesn't exist
  const tech = db.technicians.find(t => t.name === technician);
  if (tech) {
    const techId = tech.id;
    if (!db.chats[techId]) {
      db.chats[techId] = [];
    }
    db.chats[techId].push({
      sender: "technician",
      text: `Hello! I see you just booked me for ${taskName} on ${date} (${timeSlot}). I will be there on time. Do you have any specific instructions?`,
      time: new Date().toISOString()
    });
  }

  writeDB(db);
  res.status(201).json(newBooking);
});

// 5. Get budget items
app.get('/api/budget', (req, res) => {
  const db = readDB();
  res.json(db.budget);
});

// 6. Add or update budget item
app.post('/api/budget', (req, res) => {
  const { id, item, category, allocated, spent, status } = req.body;

  if (!item || !category || allocated === undefined || spent === undefined || !status) {
    return res.status(400).json({ error: "Missing budget item fields" });
  }

  const db = readDB();
  
  if (id) {
    // Update existing
    const index = db.budget.findIndex(b => b.id === id);
    if (index !== -1) {
      db.budget[index] = { id, item, category, allocated: Number(allocated), spent: Number(spent), status };
      writeDB(db);
      return res.json(db.budget[index]);
    }
  }

  // Create new
  const newItem = {
    id: 'bd_' + Date.now(),
    item,
    category,
    allocated: Number(allocated),
    spent: Number(spent),
    status
  };

  db.budget.push(newItem);
  writeDB(db);
  res.status(201).json(newItem);
});

// 7. Delete budget item
app.delete('/api/budget/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  const index = db.budget.findIndex(b => b.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: "Budget item not found" });
  }

  const deleted = db.budget.splice(index, 1);
  writeDB(db);
  res.json({ message: "Deleted successfully", item: deleted[0] });
});

// 8. Get chat history with technician
app.get('/api/chat/:techId', (req, res) => {
  const { techId } = req.params;
  const db = readDB();
  const chatHistory = db.chats[techId] || [];
  res.json(chatHistory);
});

// 9. Send message to technician (and trigger auto-reply)
app.post('/api/chat/:techId', (req, res) => {
  const { techId } = req.params;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Message text is required" });
  }

  const db = readDB();
  if (!db.chats[techId]) {
    db.chats[techId] = [];
  }

  const userMsg = {
    sender: "user",
    text,
    time: new Date().toISOString()
  };

  db.chats[techId].push(userMsg);
  writeDB(db);

  // Return the user message immediately, but queue a response in background!
  res.status(201).json(userMsg);

  // Trigger simulated responder from technician after 1.5 seconds
  setTimeout(() => {
    const liveDb = readDB();
    const technician = liveDb.technicians.find(t => t.id === techId);
    const techName = technician ? technician.name : "Technician";

    const replies = [
      `Thanks for letting me know! I've noted that down and will bring the required tools.`,
      `Perfect. I am on my way to prepare materials for this. See you soon!`,
      `Got it! Let me know if there's anything else I should know before I arrive.`,
      `That sounds good. I will check that immediately when I arrive.`,
      `Understood. I will call you 15 minutes before I reach your location.`
    ];

    const randomReply = replies[Math.floor(Math.random() * replies.length)];

    const techMsg = {
      sender: "technician",
      text: randomReply,
      time: new Date().toISOString()
    };

    if (!liveDb.chats[techId]) liveDb.chats[techId] = [];
    liveDb.chats[techId].push(techMsg);
    writeDB(liveDb);
    console.log(`[Chat Mock] Automated reply added from ${techName} for chat ${techId}`);
  }, 1500);
});

// Fallback to serving front-end index.html for unknown web paths to support smooth SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`================================================`);
  console.log(`🚀 Home Maintenance & Renovation Planner Server`);
  console.log(`📱 Running on local: http://localhost:${PORT}`);
  console.log(`================================================`);
});
