/* ========================================================
   MODUS: PREMIUM PWA CORE LOGICS (Vanilla JS)
   ======================================================== */

// Global Application State
let appState = {
  services: {},
  technicians: [],
  bookings: [],
  budget: [],
  activeChatTechId: null,
  chatPoller: null,
  
  // Wizard Booking state
  bookingFlow: {
    step: 1,
    category: null,
    taskName: null,
    price: 0,
    technician: null,
    technicianId: null,
    date: null,
    timeSlot: null
  }
};

// ==========================================
// 1. INITIALIZER & EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

// Primary initialization
async function initApp() {
  // Load Theme
  const savedTheme = localStorage.getItem('modus-theme') || 'light-theme';
  document.body.className = savedTheme;

  // Set default minimum date to today for scheduler
  const dateInput = document.getElementById('booking-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }

  // Load User Login Status (PWA Session persistence)
  const savedUser = localStorage.getItem('modus-user');
  if (savedUser) {
    const user = JSON.parse(savedUser);
    applyUserProfile(user);
    hideLoginGate();
  } else {
    initializeGoogleSignIn();
  }

  // Fetch initial data from APIs
  await refreshAllData();
}


// Global API Refresh
async function refreshAllData() {
  try {
    const [servicesData, techsData, bookingsData, budgetData] = await Promise.all([
      fetchAPI('/api/services'),
      fetchAPI('/api/technicians'),
      fetchAPI('/api/bookings'),
      fetchAPI('/api/budget')
    ]);

    appState.services = servicesData;
    appState.technicians = techsData;
    appState.bookings = bookingsData;
    appState.budget = budgetData;

    // Populators
    renderHomeDashboard();
    renderOrdersTab();
    renderBudgetTab();
    renderChatList();
  } catch (error) {
    console.error("Critical error loading initial app data:", error);
  }
}

// API Fetch Helper
async function fetchAPI(url, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }
  return response.json();
}

// Event Listeners setup
function setupEventListeners() {
  // Theme Toggle
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    if (document.body.classList.contains('light-theme')) {
      document.body.classList.replace('light-theme', 'dark-theme');
      localStorage.setItem('modus-theme', 'dark-theme');
    } else {
      document.body.classList.replace('dark-theme', 'light-theme');
      localStorage.setItem('modus-theme', 'light-theme');
    }
  });

  // Date picker listener
  const dateInput = document.getElementById('booking-date');
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      appState.bookingFlow.date = e.target.value;
      validateStep4();
    });
  }
}

// ==========================================
// 2. SPA ROUTER & NAVIGATION
// ==========================================

function switchTab(tabId, tabElement = null) {
  // Clear any dynamic pollers if leaving chat
  if (tabId !== 'chat') {
    closeChatRoom();
  }

  // Deactivate all views and navigation tabs
  const views = document.querySelectorAll('.app-view');
  views.forEach(v => v.classList.remove('active'));

  const tabs = document.querySelectorAll('.tab-item');
  tabs.forEach(t => t.classList.remove('active'));

  // Activate selected view
  const targetView = document.getElementById(`${tabId}-view`);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Highlight selected tab
  if (tabElement) {
    tabElement.classList.add('active');
  } else {
    // Find tab based on dynamic trigger
    const matchingTab = Array.from(document.querySelectorAll('.tab-item')).find(t => 
      t.getAttribute('onclick').includes(`'${tabId}'`)
    );
    if (matchingTab) matchingTab.classList.add('active');
  }

  // Scroll active view content to top
  const scroller = document.querySelector('.view-content');
  if (scroller) scroller.scrollTop = 0;

  // Specific view entry logic
  if (tabId === 'home') {
    renderHomeDashboard();
  } else if (tabId === 'orders') {
    renderOrdersTab();
  } else if (tabId === 'budget') {
    renderBudgetTab();
  } else if (tabId === 'chat') {
    renderChatList();
  }
}

// ==========================================
// 3. HOME VIEW LOGICS
// ==========================================

function renderHomeDashboard() {
  // 1. Update Active Bookings Count
  const activeBookings = appState.bookings.filter(b => b.status !== 'Completed');
  const countBadge = document.getElementById('active-bookings-count');
  countBadge.textContent = activeBookings.length;

  // 2. Calculate Renovation Spent metrics
  let totalAllocated = 0;
  let totalSpent = 0;

  appState.budget.forEach(item => {
    totalAllocated += item.allocated;
    totalSpent += item.spent;
  });

  const spentPercentage = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;
  
  // Update dashboard visual elements
  document.getElementById('budget-spent-percentage').textContent = `${spentPercentage}%`;
  document.getElementById('budget-fraction').textContent = `$${totalSpent.toLocaleString()} / $${totalAllocated.toLocaleString()}`;
  
  const dashboardBar = document.getElementById('dashboard-budget-bar');
  dashboardBar.style.width = `${Math.min(spentPercentage, 100)}%`;
}

// ==========================================
// 4. MULTI-STEP SERVICE BOOKING FUNNEL (WIZARD)
// ==========================================

function startBookingFlow(preSelectedCategory = null) {
  // Reset Wizard State
  appState.bookingFlow = {
    step: 1,
    category: null,
    taskName: null,
    price: 0,
    technician: null,
    technicianId: null,
    date: null,
    timeSlot: null
  };

  // Reset UI selectors
  const dateInput = document.getElementById('booking-date');
  if (dateInput) dateInput.value = '';
  
  const selectedChips = document.querySelectorAll('.time-chip.selected');
  selectedChips.forEach(c => c.classList.remove('selected'));
  
  document.getElementById('step-4-next-btn').disabled = true;

  // Switch to book tab
  switchTab('book');

  if (preSelectedCategory) {
    selectBookingCategory(preSelectedCategory);
  } else {
    renderWizardStep();
  }
}

function renderWizardStep() {
  const currentStep = appState.bookingFlow.step;
  
  // Toggle step wrappers visibility
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`booking-step-${i}`);
    if (i === currentStep) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }

  // Update navbar indicator
  document.getElementById('current-step-num').textContent = currentStep;
  document.getElementById('wizard-progress-fill').style.width = `${currentStep * 20}%`;

  // Hide/Show Back Button for Step 1
  const backBtn = document.getElementById('wizard-back-btn');
  if (currentStep === 1) {
    backBtn.style.visibility = 'hidden';
  } else {
    backBtn.style.visibility = 'visible';
  }

  // Update Dynamic Step Titles
  const titleEl = document.getElementById('wizard-title');
  if (currentStep === 1) titleEl.textContent = 'Select Category';
  else if (currentStep === 2) titleEl.textContent = 'Select Task';
  else if (currentStep === 3) titleEl.textContent = 'Select Expert';
  else if (currentStep === 4) titleEl.textContent = 'Schedule Date';
  else if (currentStep === 5) titleEl.textContent = 'Review & Book';
}

function nextBookingStep() {
  if (appState.bookingFlow.step < 5) {
    appState.bookingFlow.step++;
    renderWizardStep();
  }
}

function prevBookingStep() {
  if (appState.bookingFlow.step > 1) {
    appState.bookingFlow.step--;
    renderWizardStep();
  }
}

// STEP 1: Select Category
function selectBookingCategory(category) {
  appState.bookingFlow.category = category;
  
  // Fetch tasks matching this category
  const tasks = appState.services[category] || [];
  
  // Render Step 2 list
  const listContainer = document.getElementById('tasks-list');
  listContainer.innerHTML = '';

  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-item-card';
    card.onclick = () => selectBookingTask(task.name, task.price, card);

    card.innerHTML = `
      <div class="task-item-left">
        <span class="task-item-name">${task.name}</span>
        <span class="task-item-duration">⏱️ Duration: ${task.duration}</span>
      </div>
      <div class="task-item-right">
        <span class="task-item-price">$${task.price}</span>
        <div class="task-checkbox-ring"></div>
      </div>
    `;
    listContainer.appendChild(card);
  });

  // Proceed
  appState.bookingFlow.step = 2;
  renderWizardStep();
}

// STEP 2: Select Task
function selectBookingTask(taskName, price, cardElement) {
  appState.bookingFlow.taskName = taskName;
  appState.bookingFlow.price = price;

  // Toggle visual active state
  const cards = document.querySelectorAll('.task-item-card');
  cards.forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');

  // Load Technicians in Category
  const categoryTechs = appState.technicians.filter(t => t.category === appState.bookingFlow.category);
  const techContainer = document.getElementById('technicians-list');
  techContainer.innerHTML = '';

  categoryTechs.forEach(tech => {
    const card = document.createElement('div');
    card.className = 'tech-option-card';
    card.onclick = () => selectBookingTechnician(tech.id, tech.name, card);

    card.innerHTML = `
      <div class="tech-profile-row">
        <img src="${tech.avatar}" alt="${tech.name}" class="tech-option-avatar">
        <div class="tech-meta-info">
          <h5>${tech.name}</h5>
          <div class="tech-rating-stars">
            ⭐ ${tech.rating.toFixed(1)} <span class="reviews-cnt">(${tech.reviews} reviews)</span>
          </div>
        </div>
        <div class="tech-select-ring"></div>
      </div>
      <p class="tech-bio-text">${tech.bio}</p>
    `;
    techContainer.appendChild(card);
  });

  // Delay transition slightly for haptic animation effect
  setTimeout(() => {
    appState.bookingFlow.step = 3;
    renderWizardStep();
  }, 250);
}

// STEP 3: Select Technician
function selectBookingTechnician(techId, techName, cardElement) {
  appState.bookingFlow.technicianId = techId;
  appState.bookingFlow.technician = techName;

  const cards = document.querySelectorAll('.tech-option-card');
  cards.forEach(c => c.classList.remove('selected'));
  cardElement.classList.add('selected');

  setTimeout(() => {
    appState.bookingFlow.step = 4;
    renderWizardStep();
  }, 250);
}

// STEP 4: Date & Time Schedule validation
function selectTimeSlot(slot, element) {
  appState.bookingFlow.timeSlot = slot;

  const chips = document.querySelectorAll('.time-chip');
  chips.forEach(c => c.classList.remove('selected'));
  element.classList.add('selected');

  validateStep4();
}

function validateStep4() {
  const nextBtn = document.getElementById('step-4-next-btn');
  if (appState.bookingFlow.date && appState.bookingFlow.timeSlot) {
    nextBtn.disabled = false;
    
    // Update Step 5 review content immediately on validation
    populateStep5Review();
  } else {
    nextBtn.disabled = true;
  }
}

// STEP 5: Populate Review
function populateStep5Review() {
  document.getElementById('review-category').textContent = appState.bookingFlow.category;
  document.getElementById('review-task').textContent = appState.bookingFlow.taskName;
  document.getElementById('review-date').textContent = appState.bookingFlow.date;
  document.getElementById('review-time').textContent = appState.bookingFlow.timeSlot;
  document.getElementById('review-price').textContent = `$${appState.bookingFlow.price.toFixed(2)}`;

  // Find technician details
  const tech = appState.technicians.find(t => t.id === appState.bookingFlow.technicianId);
  if (tech) {
    document.getElementById('review-tech-img').src = tech.avatar;
    document.getElementById('review-tech-name').textContent = tech.name;
  }
}

// Submit Booking to Server
async function submitBooking() {
  const submitBtn = document.querySelector('.confirm-btn');
  submitBtn.disabled = true;
  submitBtn.querySelector('span').textContent = 'Scheduling Booking...';

  try {
    const response = await fetchAPI('/api/bookings', 'POST', {
      category: appState.bookingFlow.category,
      taskName: appState.bookingFlow.taskName,
      price: appState.bookingFlow.price,
      technician: appState.bookingFlow.technician,
      date: appState.bookingFlow.date,
      timeSlot: appState.bookingFlow.timeSlot
    });

    // Refresh UI Data
    await refreshAllData();

    // Trigger visual iOS Haptic Vibe / Booking successful modal
    alert(`🎉 Booking Confirmed! \nYour expert ${appState.bookingFlow.technician} is scheduled for ${appState.bookingFlow.date} (${appState.bookingFlow.timeSlot}).`);
    
    // Switch to Orders View to let them track it
    switchTab('orders');
  } catch (error) {
    alert(`Booking failed: ${error.message}`);
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Confirm & Book Service';
  }
}

// ==========================================
// 5. ORDERS TRACKING LOGICS
// ==========================================

function renderOrdersTab() {
  const container = document.getElementById('orders-container');
  container.innerHTML = '';

  if (appState.bookings.length === 0) {
    container.innerHTML = `
      <div class="info-banner" style="background-color: var(--bg-secondary); border-left-color: var(--border);">
        <div class="info-banner-icon">📋</div>
        <div class="info-banner-text">
          <h5>No bookings scheduled</h5>
          <p>You haven't scheduled any maintenance services yet. Visit the Book tab to schedule a technician.</p>
        </div>
      </div>
    `;
    return;
  }

  appState.bookings.forEach(booking => {
    const card = document.createElement('div');
    card.className = 'order-card';

    // Status classes
    let statusClass = 'status-assigned';
    if (booking.status.toLowerCase() === 'in progress') statusClass = 'status-inprogress';
    else if (booking.status.toLowerCase() === 'completed') statusClass = 'status-completed';

    // Find technician ID for chat launcher
    const techObj = appState.technicians.find(t => t.name === booking.technician);
    const techId = techObj ? techObj.id : 't1';

    card.innerHTML = `
      <div class="order-card-header">
        <div>
          <h4 class="order-service-name">${booking.taskName}</h4>
          <span class="order-date-slot">📅 ${booking.date} | ${booking.timeSlot}</span>
        </div>
        <span class="order-status-badge ${statusClass}">${booking.status}</span>
      </div>

      <div class="order-tech-bar">
        <div class="order-tech-left">
          <img src="${techObj ? techObj.avatar : '/images/naveed.png'}" alt="Technician" class="order-tech-avatar">
          <span class="order-tech-name">${booking.technician}</span>
        </div>
        ${booking.status !== 'Completed' ? `
          <button class="order-tech-chat-btn" onclick="startChatFromOrder('${techId}')">
            💬 Message Expert
          </button>
        ` : ''}
      </div>

      <div class="order-card-footer">
        <span class="order-price-label">Pre-priced Fee:</span>
        <span class="order-price-val">$${booking.price.toFixed(2)}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function startChatFromOrder(techId) {
  switchTab('chat');
  openChatRoom(techId);
}

// ==========================================
// 6. RENOVATION BUDGET TRACKER
// ==========================================

function renderBudgetTab() {
  // 1. Calculate and update metrics
  let allocatedSum = 0;
  let spentSum = 0;

  appState.budget.forEach(item => {
    allocatedSum += item.allocated;
    spentSum += item.spent;
  });

  const percentage = allocatedSum > 0 ? Math.round((spentSum / allocatedSum) * 100) : 0;

  // Update text elements
  document.getElementById('budget-percentage-text').textContent = `${percentage}%`;
  document.getElementById('budget-total-allocated').textContent = `$${allocatedSum.toLocaleString()}`;
  document.getElementById('budget-total-spent').textContent = `$${spentSum.toLocaleString()}`;

  // Animate dynamic Circular SVG stroke
  const circle = document.getElementById('budget-svg-circle');
  if (circle) {
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius; // 314.15
    circle.strokeDasharray = circumference;
    
    // Stroke offset animation
    const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }

  // 2. Render Budget Allocations list
  const listContainer = document.getElementById('budget-items-list');
  listContainer.innerHTML = '';

  if (appState.budget.length === 0) {
    listContainer.innerHTML = `
      <div class="info-banner" style="background-color: var(--bg-secondary); border-left-color: var(--border);">
        <div class="info-banner-icon">💰</div>
        <div class="info-banner-text">
          <h5>No itemized expenses allocated</h5>
          <p>Click the button above to add custom renovation items to plan your budget.</p>
        </div>
      </div>
    `;
    return;
  }

  appState.budget.forEach(item => {
    const rowPercentage = item.allocated > 0 ? Math.round((item.spent / item.allocated) * 100) : 0;
    
    const row = document.createElement('div');
    row.className = 'budget-item-row';

    row.innerHTML = `
      <div class="budget-item-main-row">
        <div class="budget-item-left">
          <span class="budget-item-title">${item.item}</span>
          <span class="budget-item-tag">🏷️ ${item.category} • ${item.status}</span>
        </div>
        <div class="budget-item-right">
          <div class="budget-item-finances">
            <span class="budget-item-spent-val">$${item.spent.toLocaleString()}</span>
            <span class="budget-item-alloc-val">allocated: $${item.allocated.toLocaleString()}</span>
          </div>
          <button class="budget-action-btn" onclick="deleteBudgetItem('${item.id}')" aria-label="Delete budget item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>
      <div class="budget-item-progress-bar-container">
        <div class="budget-item-progress-bar" style="width: ${Math.min(rowPercentage, 100)}%;"></div>
      </div>
    `;
    listContainer.appendChild(row);
  });
}

function toggleBudgetForm(show) {
  const formCard = document.getElementById('budget-form-overlay');
  const triggerBtn = document.querySelector('.add-item-trigger-btn');
  
  if (show) {
    formCard.style.display = 'block';
    triggerBtn.style.display = 'none';
    
    // Clear inputs
    document.getElementById('budget-item-id').value = '';
    document.getElementById('budget-item-name').value = '';
    document.getElementById('budget-item-allocated').value = '';
    document.getElementById('budget-item-spent').value = '';
    document.getElementById('budget-item-status').value = 'Planned';
  } else {
    formCard.style.display = 'none';
    triggerBtn.style.display = 'flex';
  }
}

async function saveBudgetItem(event) {
  event.preventDefault();

  const id = document.getElementById('budget-item-id').value;
  const item = document.getElementById('budget-item-name').value;
  const category = document.getElementById('budget-item-category').value;
  const status = document.getElementById('budget-item-status').value;
  const allocated = Number(document.getElementById('budget-item-allocated').value);
  const spent = Number(document.getElementById('budget-item-spent').value);

  try {
    await fetchAPI('/api/budget', 'POST', {
      id: id || undefined,
      item,
      category,
      allocated,
      spent,
      status
    });

    // Refresh UI data
    await refreshAllData();
    toggleBudgetForm(false);
  } catch (error) {
    alert(`Failed to save budget allocation: ${error.message}`);
  }
}

async function deleteBudgetItem(itemId) {
  if (!confirm("Are you sure you want to remove this renovation budget item?")) return;

  try {
    await fetchAPI(`/api/budget/${itemId}`, 'DELETE');
    await refreshAllData();
  } catch (error) {
    alert(`Failed to delete budget item: ${error.message}`);
  }
}

// ==========================================
// 7. REAL-TIME CHAT & MESSAGING
// ==========================================

function renderChatList() {
  const container = document.getElementById('chats-threads-list');
  container.innerHTML = '';

  appState.technicians.forEach(tech => {
    // Read local chat snippets or fetch history
    const threadCard = document.createElement('div');
    threadCard.className = 'chat-thread-card';
    threadCard.onclick = () => openChatRoom(tech.id);

    // Call API helper to get last message for this tech if it exists locally in database
    fetch(`/api/chat/${tech.id}`)
      .then(res => res.json())
      .then(messages => {
        let snippet = `Send a message to start conversation with ${tech.name}.`;
        let timeFormatted = '';

        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          snippet = lastMsg.sender === 'user' ? `You: ${lastMsg.text}` : lastMsg.text;
          
          const msgDate = new Date(lastMsg.time);
          timeFormatted = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        threadCard.innerHTML = `
          <img src="${tech.avatar}" alt="${tech.name}" class="chat-thread-avatar">
          <div class="chat-thread-meta">
            <div class="chat-thread-header">
              <span class="chat-thread-name">${tech.name}</span>
              <span class="chat-thread-time">${timeFormatted}</span>
            </div>
            <span class="chat-thread-snippet">${snippet}</span>
          </div>
        `;
      });

    container.appendChild(threadCard);
  });
}

async function openChatRoom(techId) {
  appState.activeChatTechId = techId;

  // Find technician details
  const tech = appState.technicians.find(t => t.id === techId);
  if (!tech) return;

  // Setup header
  document.getElementById('chat-recipient-avatar').src = tech.avatar;
  document.getElementById('chat-recipient-name').textContent = tech.name;
  
  // Display active chat views
  document.getElementById('chat-room-container').classList.add('active');
  
  // Clear any past input values
  document.getElementById('chat-message-input').value = '';

  // Initial load messages
  await fetchAndRenderChatMessages(techId);

  // Focus input field on iOS
  document.getElementById('chat-message-input').focus();

  // Setup automated polling interval to check for mock technician replies every 1.5 seconds!
  if (appState.chatPoller) clearInterval(appState.chatPoller);
  appState.chatPoller = setInterval(() => {
    if (appState.activeChatTechId === techId) {
      fetchAndRenderChatMessages(techId, false); // Fetch silently in background without resetting scroll unless new messages arrive
    }
  }, 1500);
}

function closeChatRoom() {
  if (appState.chatPoller) {
    clearInterval(appState.chatPoller);
    appState.chatPoller = null;
  }
  
  appState.activeChatTechId = null;
  document.getElementById('chat-room-container').classList.remove('active');
  renderChatList(); // Refresh lists
}

let lastMsgCountForScroll = 0;

async function fetchAndRenderChatMessages(techId, forceScroll = true) {
  try {
    const messages = await fetchAPI(`/api/chat/${techId}`);
    const scroller = document.getElementById('chat-messages-scroller');
    
    // If no new messages, skip updating DOM to avoid UI flicker
    if (messages.length === lastMsgCountForScroll && !forceScroll) {
      return;
    }

    scroller.innerHTML = '';

    if (messages.length === 0) {
      scroller.innerHTML = `
        <div class="info-box" style="margin: 20px auto; background-color: var(--bg-secondary);">
          <p style="text-align: center; width: 100%;">No messages yet. Send a message to start conversing!</p>
        </div>
      `;
      lastMsgCountForScroll = 0;
      return;
    }

    messages.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${msg.sender}`;

      const msgTime = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      bubble.innerHTML = `
        ${msg.text}
        <span class="chat-bubble-time">${msgTime}</span>
      `;
      scroller.appendChild(bubble);
    });

    // Auto Scroll to bottom
    if (forceScroll || messages.length > lastMsgCountForScroll) {
      scroller.scrollTop = scroller.scrollHeight;
    }
    
    lastMsgCountForScroll = messages.length;
  } catch (error) {
    console.error("Error fetching chats:", error);
  }
}

async function sendChatMessage(event) {
  event.preventDefault();

  const input = document.getElementById('chat-message-input');
  const text = input.value.trim();
  const techId = appState.activeChatTechId;

  if (!text || !techId) return;

  // Clear input immediately to make UI feel snappy (optimistic UI rendering)
  input.value = '';

  try {
    // POST to Express API
    await fetchAPI(`/api/chat/${techId}`, 'POST', { text });

    // Instantly refresh and show bubble
    await fetchAndRenderChatMessages(techId, true);
  } catch (error) {
    alert(`Failed to send message: ${error.message}`);
  }
}

// ==========================================
// 8. GOOGLE SIGN-IN INTERFACES & PARSERS
// ==========================================

function initializeGoogleSignIn() {
  if (typeof google === 'undefined') {
    // If the Google SDK is still loading, wait 300ms and try again
    setTimeout(initializeGoogleSignIn, 300);
    return;
  }
  
  google.accounts.id.initialize({
    // Standard Project Sandbox Client ID
    client_id: '957864096057-clt110v45791oipqshn91tcrbfj2fep2.apps.googleusercontent.com',
    callback: handleCredentialResponse,
    auto_select: false,
    cancel_on_tap_outside: true
  });
  
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn-wrapper'),
    { 
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: 240
    }
  );
}

// Handler for verified Google JWT response
async function handleCredentialResponse(response) {
  try {
    const payload = parseJwt(response.credential);
    const userData = {
      name: payload.name,
      email: payload.email,
      avatar: payload.picture,
      isLoggedIn: true
    };
    
    // 1. Persist Google User Information on the Server-side Database (db.json)
    await fetchAPI('/api/auth/login', 'POST', userData);
    
    // 2. Save locally for offline PWA session persistence
    localStorage.setItem('modus-user', JSON.stringify(userData));
    applyUserProfile(userData);
    
    // Smooth transition splash screen out
    hideLoginGate();
  } catch (error) {
    console.error("JWT credential decoding error:", error);
  }
}

// Decodes JWT Web Token (JSON payload payload) without external libraries
function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => 
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join(''));
  return JSON.parse(jsonPayload);
}

function applyUserProfile(userData) {
  // Personalize greetings
  const firstName = userData.name.split(' ')[0];
  document.getElementById('home-greeting-title').textContent = `Hello, ${firstName}`;
  
  // Dynamic header profile picture updates
  const avatarEl = document.getElementById('user-profile-avatar');
  avatarEl.src = userData.avatar;
  
  // Set tooltip details
  document.getElementById('user-profile-email').textContent = userData.email;
}

async function bypassLogin() {
  const guestData = {
    name: 'Guest User',
    email: 'guest@modus.com',
    avatar: '/images/icon.png',
    isLoggedIn: true
  };
  
  try {
    // Persist Guest login in server database
    await fetchAPI('/api/auth/login', 'POST', guestData);
  } catch (e) {
    console.warn("Server login offline, bypassing to local offline mode.");
  }
  
  localStorage.setItem('modus-user', JSON.stringify(guestData));
  applyUserProfile(guestData);
  hideLoginGate();
}

function hideLoginGate() {
  const gate = document.getElementById('login-gate-screen');
  gate.classList.add('fade-out');
}

function showLoginGate() {
  const gate = document.getElementById('login-gate-screen');
  gate.classList.remove('fade-out');
  initializeGoogleSignIn();
}

function toggleSignOutPanel() {
  const panel = document.getElementById('sign-out-tooltip');
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

async function handleSignOut() {
  try {
    // Clear active session from server database
    await fetchAPI('/api/auth/logout', 'POST');
  } catch (e) {
    console.warn("Server logout request failed.");
  }
  
  localStorage.removeItem('modus-user');
  toggleSignOutPanel();
  showLoginGate();
}

