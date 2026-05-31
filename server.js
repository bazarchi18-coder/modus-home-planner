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

// Reset application database back to initial seed defaults
app.post('/api/auth/reset', (req, res) => {
  const defaultDB = {
    services: {
      electrician: [
        { "id": "e1", "name": "AC Maintenance/Repair", "price": 5000, "duration": "1-2 Hours" },
        { "id": "e2", "name": "Fridge/Freezer Repair", "price": 4500, "duration": "2 Hours" },
        { "id": "e3", "name": "Washing Machine Repair", "price": 3000, "duration": "1.5 Hours" },
        { "id": "e4", "name": "Switchboard Installation", "price": 1500, "duration": "30 Mins" },
        { "id": "e5", "name": "Whole House Rewiring", "price": 45000, "duration": "1-2 Days" },
        { "id": "e6", "name": "Generator Service", "price": 6000, "duration": "2 Hours" },
        { "id": "e7", "name": "UPS/Battery Repair", "price": 2500, "duration": "1 Hour" },
        { "id": "e8", "name": "Fan Installation", "price": 1000, "duration": "30 Mins" },
        { "id": "e9", "name": "LCD/TV Mounting", "price": 800, "duration": "30 Mins" },
        { "id": "e10", "name": "Microwave Oven Repair", "price": 2000, "duration": "1 Hour" }
      ],
      plumber: [
        { "id": "p1", "name": "Leakage Detection & Fix", "price": 2000, "duration": "1 Hour" },
        { "id": "p2", "name": "Geyser Installation", "price": 5000, "duration": "2 Hours" },
        { "id": "p3", "name": "Tap & Shower Repair", "price": 1000, "duration": "30 Mins" },
        { "id": "p4", "name": "Water Tank Cleaning", "price": 4000, "duration": "2-3 Hours" },
        { "id": "p5", "name": "Drain Blockage Cleaning", "price": 1800, "duration": "1 Hour" }
      ],
      carpenter: [
        { "id": "c1", "name": "Door Lock Replacement", "price": 1500, "duration": "45 Mins" },
        { "id": "c2", "name": "Cabinet Repair", "price": 2500, "duration": "1.5 Hours" },
        { "id": "c3", "name": "Furniture Polishing", "price": 8000, "duration": "3-4 Hours" },
        { "id": "c4", "name": "Window Frame Fixing", "price": 2000, "duration": "1 Hour" },
        { "id": "c5", "name": "Sofa/Bed Repair", "price": 5000, "duration": "2-3 Hours" }
      ]
    },
    technicians: [
      {
        "id": "t1",
        "name": "Rizwan Khan",
        "category": "electrician",
        "rating": 4.9,
        "reviews": 128,
        "status": "Available",
        "avatar": "/images/naveed.png",
        "bio": "Certified industrial electrician with 8+ years of experience in smart-home upgrades and household wiring."
      },
      {
        "id": "t2",
        "name": "Tariq Mahmood",
        "category": "plumber",
        "rating": 4.8,
        "reviews": 95,
        "status": "Available",
        "avatar": "/images/luqman.png",
        "bio": "Expert in sanitary fittings, pressure leak solutions, and standard geyser maintenance."
      },
      {
        "id": "t3",
        "name": "Sajid Ali",
        "category": "carpenter",
        "rating": 4.7,
        "reviews": 82,
        "status": "Available",
        "avatar": "/images/akbar.png",
        "bio": "Specialist in fine wood furniture repair, cabinet manufacturing, and dynamic lock repairs."
      },
      {
        "id": "t4",
        "name": "Kamran Shah",
        "category": "electrician",
        "rating": 4.9,
        "reviews": 110,
        "status": "Available",
        "avatar": "/images/abdullah.png",
        "bio": "Expert home appliance repairman specializing in AC installation, fridge repairs, and electronic maintenance."
      }
    ],
    bookings: [
      {
        "id": "b_initial_1",
        "category": "electrician",
        "taskName": "AC Maintenance/Repair",
        "price": 5000,
        "technician": "Rizwan Khan",
        "date": "2026-05-20",
        "timeSlot": "10:00 AM - 12:00 PM",
        "status": "Completed",
        "createdAt": "2026-05-19T10:15:00.000Z"
      },
      {
        "id": "b_initial_2",
        "category": "plumber",
        "taskName": "Leakage Detection & Fix",
        "price": 2000,
        "technician": "Tariq Mahmood",
        "date": "2026-05-24",
        "timeSlot": "02:00 PM - 03:30 PM",
        "status": "Assigned",
        "createdAt": "2026-05-22T14:30:00.000Z"
      }
    ],
    budget: [
      { "id": "bd1", "item": "AC Installation & Service", "category": "Electrician", "allocated": 15000, "spent": 5000, "status": "In Progress" },
      { "id": "bd2", "item": "Kitchen Plumbing Remodel", "category": "Plumber", "allocated": 35000, "spent": 25000, "status": "Completed" },
      { "id": "bd3", "item": "Custom Wardrobe Cabinets", "category": "Carpenter", "allocated": 85000, "spent": 0, "status": "Planned" },
      { "id": "bd4", "item": "Living Room Sofa Polish", "category": "Carpenter", "allocated": 15000, "spent": 10000, "status": "Completed" }
    ],
    chats: {
      "t1": [
        { "sender": "technician", "text": "Hello! I am Rizwan Khan, your assigned electrician. How can I help you with your AC today?", "time": "2026-05-20T09:30:00.000Z" },
        { "sender": "user", "text": "Hi Rizwan! It's making a strange humming sound when it starts.", "time": "2026-05-20T09:32:00.000Z" },
        { "sender": "technician", "text": "Got it. That's usually a capacitor issue or fan motor block. I'll inspect it during our scheduled slot.", "time": "2026-05-20T09:33:00.000Z" }
      ],
      "t2": [
        { "sender": "technician", "text": "Hi there! I am Tariq. I see we have a tap leakage fix tomorrow at 2:00 PM. Please confirm the address is correct.", "time": "2026-05-22T15:00:00.000Z" },
        { "sender": "user", "text": "Yes, the address is exactly correct. Thank you!", "time": "2026-05-22T15:10:00.000Z" }
      ],
      "t3": [],
      "t4": []
    },
    users: [],
    activeSession: null
  };

  writeDB(defaultDB);
  console.log(`🧹 [Server DB] Application database hard-reset successfully.`);
  res.json({ success: true, message: "Database reset successfully" });
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

// Helper to generate highly realistic context-aware replies from technicians
function generateAIResponse(userText, techName, category) {
  const text = userText.toLowerCase().trim();
  
  // Greetings
  if (text.includes("hello") || text.includes("hi") || text.includes("hey") || text.includes("assalam") || text.includes("salam")) {
    return `Walaikum Assalam! I hope you are doing well. This is ${techName}, your assigned ${category}. How can I assist you with your home project today?`;
  }
  
  // Thanks
  if (text.includes("thank") || text.includes("shukriya") || text.includes("welcome")) {
    return `You're most welcome! It is my pleasure. Let me know if you need any other help with the service.`;
  }

  // Pricing, PKR Currency, and Standard Rates
  if (text.includes("price") || text.includes("rate") || text.includes("cost") || text.includes("charge") || text.includes("expensive") || text.includes("fee") || text.includes("rs") || text.includes("rupee") || text.includes("pkr")) {
    return `Regarding the cost, all our fees are standard rates regulated directly by Modus. My visiting fee is fully included in the standard rate, and there are absolutely no hidden charges. You can pay me easily in cash or via mobile transfer (JazzCash/Easypaisa) once the job is fully done!`;
  }

  // Scheduling, Timings, Arriving
  if (text.includes("time") || text.includes("when") || text.includes("delay") || text.includes("reach") || text.includes("late") || text.includes("schedule") || text.includes("clock") || text.includes("arrive") || text.includes("slot")) {
    return `Punctuality is very important to me! I will reach your address exactly during our scheduled time slot. I will also give you a phone call 15 minutes before I reach, so you know I'm on my way.`;
  }

  // Address and Locations
  if (text.includes("address") || text.includes("location") || text.includes("where") || text.includes("area") || text.includes("house") || text.includes("street")) {
    return `Yes, I have noted down the address details provided in your booking. I am very familiar with the local routes and sectors, so I will find your home easily.`;
  }

  // Tools, materials, parts
  if (text.includes("tool") || text.includes("material") || text.includes("wire") || text.includes("pipe") || text.includes("wood") || text.includes("lock") || text.includes("spare") || text.includes("part")) {
    return `Don't worry at all! I will bring all my professional diagnostic instruments, ladder, and heavy tools myself. If any spare parts (like specific pipes, standard wires, or board locks) are needed, I can purchase high-quality local materials for you, and we can adjust that in the bill.`;
  }

  // Service Guarantees / Trust
  if (text.includes("guarantee") || text.includes("warranty") || text.includes("trust") || text.includes("honest") || text.includes("perfect") || text.includes("satisfy") || text.includes("complaint")) {
    return `Customer satisfaction is our utmost priority at Modus! All my work comes with a 30-day Modus service warranty. If anything goes wrong or isn't up to your standard, we will come back and fix it free of cost. You are in safe hands!`;
  }

  // Category Specific Default Fallbacks
  if (category === "electrician") {
    const electricianReplies = [
      `I've noted that down. AC compressors, short circuits, or wiring issues can sometimes be tricky, but I will thoroughly inspect the capacitor, voltage stabilizers, and main DB boards to isolate the issue.`,
      `Got it! Electric problems should be handled carefully. I will check the load balances and switchboards when I arrive. See you soon!`,
      `Understood. I will bring my digital multimeter and wire checkers. I'll make sure everything is completely safe and double-checked before I leave.`
    ];
    return electricianReplies[Math.floor(Math.random() * electricianReplies.length)];
  } else if (category === "plumber") {
    const plumberReplies = [
      `That makes sense. Water pressure issues, blockages, or tap leakages are very common. I'll inspect the main valves, gaskets, and concealed PPR piping to solve it permanently.`,
      `Concealed pipeline leaks can cause dampness in walls. I will bring leak detection tools and heavy piping sealants to make sure it's fully secure.`,
      `Understood! I'll inspect the tap threads and geyser valves carefully to stop any leaks. I will bring standard replacement fittings just in case.`
    ];
    return plumberReplies[Math.floor(Math.random() * plumberReplies.length)];
  } else {
    // Carpenter
    const carpenterReplies = [
      `I understand. Wood warping, cabinet hinge issues, or door lock alignments are easily fixable. I'll inspect the timber quality and bring premium replacement hinges/aligners.`,
      `Got it! I will bring sandpapers, wood glues, alignment screws, and my polish kit. I will restore the wood surface and make sure the door handles operate smoothly.`,
      `Understood! Furniture joints can loosen over time. I'll re-glue, clamp, and reinforce the frames when I arrive so they are as strong as new.`
    ];
    return carpenterReplies[Math.floor(Math.random() * carpenterReplies.length)];
  }
}

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
    const category = technician ? technician.category : "expert";
    
    // Generate context-aware response
    const replyText = generateAIResponse(text, techName, category);

    const techMsg = {
      sender: "technician",
      text: replyText,
      time: new Date().toISOString()
    };

    if (!liveDb.chats[techId]) liveDb.chats[techId] = [];
    liveDb.chats[techId].push(techMsg);
    writeDB(liveDb);
    console.log(`[Chat AI] Intelligent reply added from ${techName} for chat ${techId}`);
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
