const { ipcRenderer } = require('electron');

let allApps = [];
let pinnedApps = JSON.parse(localStorage.getItem('pinnedApps')) || [];
let currentTheme = localStorage.getItem('theme') || 'purple';
let contextMenuAppId = null;
let overviewContextAppId = null;
let effects = JSON.parse(localStorage.getItem('effects')) || { transparency: true, animations: true };
let notifications = JSON.parse(localStorage.getItem('notifications')) || [];
let dateFormat = localStorage.getItem('dateFormat') || 'full';
let showSeconds = localStorage.getItem('showSeconds') === 'true';

let dragState = {
  active: false,
  element: null,
  appId: null,
  startX: 0,
  startY: 0,
  initialLeft: 0,
  initialTop: 0,
  moved: false
};

const ICON_WIDTH = 120;
const ICON_HEIGHT = 130;
const DRAG_THRESHOLD = 5;

function getRandomGradient(seed) {
  const gradients = [
    'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
  ];
  return gradients[seed.length % gradients.length];
}

function findFreePosition() {
  const margin = 40;
  const stepX = ICON_WIDTH + 20;
  const stepY = ICON_HEIGHT + 20;
  const desktopWidth = window.innerWidth;
  const desktopHeight = window.innerHeight - 100;
  
  let x = margin;
  let y = margin + 80;
  
  const occupied = new Set(pinnedApps.map(p => `${Math.round(p.x/stepX)},${Math.round(p.y/stepY)}`));
  
  while (y < desktopHeight) {
    while (x + ICON_WIDTH < desktopWidth) {
      const key = `${Math.round(x/stepX)},${Math.round(y/stepY)}`;
      if (!occupied.has(key)) {
        return { x, y };
      }
      x += stepX;
    }
    x = margin;
    y += stepY;
  }
  
  return { x: margin, y: margin + 80 };
}

function renderDesktop() {
  const desktop = document.getElementById('desktop');
  desktop.innerHTML = '';
  
  pinnedApps.forEach(pinned => {
    const app = allApps.find(a => a.id === pinned.id);
    if (!app) return;
    
    const icon = document.createElement('div');
    icon.className = 'desktop-icon';
    icon.dataset.appId = app.id;
    icon.style.left = `${pinned.x}px`;
    icon.style.top = `${pinned.y}px`;
    
    const gradient = getRandomGradient(app.name);
    icon.innerHTML = `
      <div class="desktop-icon-wrapper" style="background: ${gradient}">${app.icon}</div>
      <div class="desktop-icon-name">${app.name}</div>
    `;
    
    icon.addEventListener('click', (e) => {
      if (!dragState.moved) {
        launchApp(app);
      }
    });
    
    icon.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e, app.id);
    });
    
    icon.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      
      dragState = {
        active: true,
        element: icon,
        appId: app.id,
        startX: e.clientX,
        startY: e.clientY,
        initialLeft: pinned.x,
        initialTop: pinned.y,
        moved: false
      };
      
      icon.classList.add('dragging');
    });
    
    desktop.appendChild(icon);
  });
}

document.addEventListener('mousemove', (e) => {
  if (!dragState.active || !dragState.element) return;
  
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
    dragState.moved = true;
  }
  
  if (dragState.moved) {
    const newLeft = dragState.initialLeft + dx;
    const newTop = dragState.initialTop + dy;
    
    const maxX = window.innerWidth - ICON_WIDTH;
    const maxY = window.innerHeight - ICON_HEIGHT;
    
    dragState.element.style.left = `${Math.max(0, Math.min(newLeft, maxX))}px`;
    dragState.element.style.top = `${Math.max(0, Math.min(newTop, maxY))}px`;
  }
});

document.addEventListener('mouseup', (e) => {
  if (!dragState.active) return;
  
  if (dragState.moved && dragState.element) {
    const newLeft = parseFloat(dragState.element.style.left);
    const newTop = parseFloat(dragState.element.style.top);
    
    const pinned = pinnedApps.find(p => p.id === dragState.appId);
    if (pinned) {
      pinned.x = newLeft;
      pinned.y = newTop;
      localStorage.setItem('pinnedApps', JSON.stringify(pinnedApps));
    }
  }
  
  if (dragState.element) {
    dragState.element.classList.remove('dragging');
  }
  
  setTimeout(() => {
    dragState = {
      active: false,
      element: null,
      appId: null,
      startX: 0,
      startY: 0,
      initialLeft: 0,
      initialTop: 0,
      moved: false
    };
  }, 50);
});

window.addEventListener('DOMContentLoaded', async () => {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  applyEffects();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overview = document.getElementById('overviewScreen');
      if (overview.classList.contains('active')) { toggleOverview(); return; }
      
      const settings = document.getElementById('settingsModal');
      if (settings.classList.contains('active')) { toggleSettings(); return; }
      
      const power = document.getElementById('powerMenu');
      if (power.classList.contains('active')) { power.classList.remove('active'); return; }
      
      const lock = document.getElementById('lockScreen');
      if (lock.classList.contains('active')) { unlockScreen(); return; }

      const notif = document.getElementById('notificationsPanel');
      if (notif.classList.contains('active')) { toggleNotifications(); return; }
    }
  });

  const savedBg = localStorage.getItem('bgImage');
  const savedTheme = localStorage.getItem('theme');

  if (savedBg) document.body.style.background = `url(${savedBg}) center/cover no-repeat`;
  else if (savedTheme && savedTheme !== 'custom' && savedTheme !== 'default-wallpaper') {
    applyTheme(savedTheme); currentTheme = savedTheme;
  } else setDefaultWallpaper();

  allApps = await ipcRenderer.invoke('get-all-apps');
  
  if (pinnedApps.length === 0 && allApps.length > 0) {
    const defaultIds = ['sys_terminal', 'sys_settings'];
    const defaults = allApps.filter(a => defaultIds.includes(a.id));
    
    defaults.forEach((app, index) => {
      pinnedApps.push({
        id: app.id,
        x: 40 + index * (ICON_WIDTH + 20),
        y: 150
      });
    });
    
    localStorage.setItem('pinnedApps', JSON.stringify(pinnedApps));
  } else if (pinnedApps.length > 0 && typeof pinnedApps[0] === 'string') {
    const oldIds = pinnedApps;
    pinnedApps = [];
    oldIds.forEach((id, index) => {
      const app = allApps.find(a => a.id === id);
      if (app) {
        pinnedApps.push({
          id: app.id,
          x: 40 + index * (ICON_WIDTH + 20),
          y: 150
        });
      }
    });
    localStorage.setItem('pinnedApps', JSON.stringify(pinnedApps));
  }

  renderDesktop();
  renderSettingsAppList();
  updateThemeSelection();
  renderNotifications();
  
  applyDateFormat();
  document.getElementById('toggleSeconds').checked = showSeconds;
});

function setDefaultWallpaper() {
  document.body.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  localStorage.setItem('theme', 'purple');
}

function setDateFormat(format) {
  dateFormat = format;
  localStorage.setItem('dateFormat', format);
  updateDateTime();
}

function applyDateFormat() {
  const radios = document.querySelectorAll('input[name="dateFormat"]');
  radios.forEach(r => {
    r.checked = (r.value === dateFormat);
  });
}

function toggleSecondsDisplay(enabled) {
  showSeconds = enabled;
  localStorage.setItem('showSeconds', enabled);
  updateDateTime();
}

function formatDate(now) {
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const daysShort = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  
  const day = now.getDate();
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const dayName = days[now.getDay()];
  const dayNameShort = daysShort[now.getDay()];
  
  switch (dateFormat) {
    case 'full':
      return `${dayName} ${day} ${month} ${year} год`;
    case 'short':
      return `${dayNameShort} ${day} ${month} ${year}`;
    case 'numeric':
      return `${String(day).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${year}`;
    default:
      return `${dayName} ${day} ${month} ${year} год`;
  }
}

function formatTime(now, withSeconds = false) {
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  return withSeconds ? `${h}:${m}:${s}` : `${h}:${m}`;
}

// === УВЕДОМЛЕНИЯ ===
function toggleNotifications() {
  const panel = document.getElementById('notificationsPanel');
  panel.classList.toggle('active');
}

function renderNotifications() {
  const list = document.getElementById('notificationsList');
  const noNotif = document.getElementById('noNotifications');
  const badge = document.getElementById('notificationBadge');
  
  list.innerHTML = '';
  
  if (notifications.length === 0) {
    list.appendChild(noNotif);
    noNotif.style.display = 'flex';
    badge.style.display = 'none';
  } else {
    noNotif.style.display = 'none';
    badge.style.display = 'flex';
    badge.innerText = notifications.length;
    
    notifications.slice().reverse().forEach((notif, index) => {
      const realIndex = notifications.length - 1 - index;
      const item = document.createElement('div');
      item.className = 'notification-item';
      item.innerHTML = `
        <button class="notification-delete" onclick="deleteNotification(${realIndex})">×</button>
        <div class="notification-item-header">
          <span class="notification-app">${notif.app}</span>
          <span class="notification-time">${notif.time}</span>
        </div>
        <div class="notification-title">${notif.title}</div>
        <div class="notification-message">${notif.message}</div>
      `;
      list.appendChild(item);
    });
  }
}

function addNotification(app, title, message) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  
  notifications.push({ app, title, message, time });
  localStorage.setItem('notifications', JSON.stringify(notifications));
  renderNotifications();
  
  const panel = document.getElementById('notificationsPanel');
  if (!panel.classList.contains('active')) {
    showBriefNotification(title, message);
  }
}

function showBriefNotification(title, message) {
  const brief = document.createElement('div');
  brief.style.cssText = `
    position: fixed; top: 30px; right: 30px; z-index: 500;
    background: rgba(30,30,40,0.95); backdrop-filter: blur(20px);
    padding: 20px 25px; border-radius: 16px; border-left: 3px solid #007aff;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3); max-width: 350px;
    transition: opacity 0.3s; opacity: 1; color: white;
  `;
  brief.innerHTML = `
    <div style="font-weight:600;margin-bottom:5px;">${title}</div>
    <div style="font-size:0.9rem;opacity:0.85;">${message}</div>
  `;
  document.body.appendChild(brief);
  
  setTimeout(() => {
    brief.style.opacity = '0';
    setTimeout(() => brief.remove(), 300);
  }, 3000);
}

function deleteNotification(index) {
  notifications.splice(index, 1);
  localStorage.setItem('notifications', JSON.stringify(notifications));
  renderNotifications();
}

function clearAllNotifications() {
  if (notifications.length > 0 && confirm('Очистить все уведомления?')) {
    notifications = [];
    localStorage.setItem('notifications', JSON.stringify(notifications));
    renderNotifications();
  }
}

function addTestNotification() {
  const apps = ['Система', 'Календарь', 'Почта', 'Обновления'];
  const titles = ['Новое событие', 'Входящее письмо', 'Доступно обновление', 'Напоминание'];
  const messages = [
    'Встреча через 30 минут',
    'Важное сообщение от команды',
    'workspaceOS v1.1.0 готова к установке',
    'Не забудьте выполнить задачу'
  ];
  
  const randomIndex = Math.floor(Math.random() * apps.length);
  addNotification(apps[randomIndex], titles[randomIndex], messages[randomIndex]);
}

// === ОБЗОР ПРИЛОЖЕНИЙ ===
function toggleOverview() {
  const screen = document.getElementById('overviewScreen');
  if (screen.classList.contains('active')) {
    screen.classList.remove('active');
  } else {
    renderAllAppsGrid();
    screen.classList.add('active');
    setTimeout(() => document.querySelector('.search-bar')?.focus(), 100);
  }
}

function renderAllAppsGrid(filter = '') {
  const grid = document.getElementById('allAppsGrid');
  grid.innerHTML = '';
  
  const filteredApps = allApps.filter(app => 
    app.name.toLowerCase().includes(filter.toLowerCase())
  );

  filteredApps.forEach(app => {
    const isPinned = pinnedApps.some(p => p.id === app.id);
    const card = document.createElement('div');
    card.className = 'grid-app-card glass';
    if (isPinned) card.classList.add('pinned-indicator');
    
    const gradient = getRandomGradient(app.name);
    card.innerHTML = `
      <div class="grid-app-icon" style="background: ${gradient}">${app.icon}</div>
      <div class="grid-app-name">${app.name}</div>
    `;
    
    // ЛКМ — запуск приложения
    card.addEventListener('click', (e) => {
      // Не запускаем, если это был правый клик
      if (e.button !== 0) return;
      launchApp(app);
    });
    
    // ПКМ — показать меню закрепить/открепить
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showOverviewContextMenu(e, app.id);
    });
    
    grid.appendChild(card);
  });
}

function filterApps(query) {
  renderAllAppsGrid(query);
}

// === КОНТЕКСТНОЕ МЕНЮ ДЛЯ ОБЗОРА ===
function showOverviewContextMenu(e, appId) {
  overviewContextAppId = appId;
  const menu = document.getElementById('overviewContextMenu');
  const actionItem = document.getElementById('overviewContextAction');
  
  const isPinned = pinnedApps.some(p => p.id === appId);
  actionItem.innerText = isPinned ? 'Убрать с рабочего стола' : 'Закрепить на рабочем столе';
  
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
  menu.classList.add('active');
}

function togglePinFromOverview() {
  if (!overviewContextAppId) return;
  
  const existing = pinnedApps.find(p => p.id === overviewContextAppId);
  if (existing) {
    pinnedApps = pinnedApps.filter(p => p.id !== overviewContextAppId);
  } else {
    const pos = findFreePosition();
    pinnedApps.push({ id: overviewContextAppId, x: pos.x, y: pos.y });
  }
  
  localStorage.setItem('pinnedApps', JSON.stringify(pinnedApps));
  renderDesktop();
  renderAllAppsGrid(document.querySelector('.search-bar')?.value || '');
  renderSettingsAppList();
  hideOverviewContextMenu();
}

function hideOverviewContextMenu() {
  document.getElementById('overviewContextMenu').classList.remove('active');
  overviewContextAppId = null;
}

// === ЗАПУСК ПРИЛОЖЕНИЯ ===
function launchApp(app) {
  ipcRenderer.invoke('launch-app', app.exec);
}

// === КОНТЕКСТНОЕ МЕНЮ РАБОЧЕГО СТОЛА ===
function showContextMenu(e, appId) {
  e.preventDefault();
  contextMenuAppId = appId;
  const menu = document.getElementById('contextMenu');
  menu.style.left = `${e.pageX}px`;
  menu.style.top = `${e.pageY}px`;
  menu.classList.add('active');
}

function unpinFromContext() {
  if (contextMenuAppId) {
    pinnedApps = pinnedApps.filter(p => p.id !== contextMenuAppId);
    localStorage.setItem('pinnedApps', JSON.stringify(pinnedApps));
    renderDesktop();
    hideContextMenu();
  }
}

function hideContextMenu() {
  document.getElementById('contextMenu').classList.remove('active');
  contextMenuAppId = null;
}

// Глобальный клик — закрывает все контекстные меню
document.addEventListener('click', (e) => {
  if (!e.target.closest('#contextMenu')) hideContextMenu();
  if (!e.target.closest('#overviewContextMenu')) hideOverviewContextMenu();
  
  const powerMenu = document.getElementById('powerMenu');
  const powerBtn = document.querySelector('.power-btn');
  if (!powerMenu.contains(e.target) && e.target !== powerBtn) powerMenu.classList.remove('active');
  
  const notifPanel = document.getElementById('notificationsPanel');
  const notifBtn = document.querySelector('.notifications-btn');
  if (!notifPanel.contains(e.target) && e.target !== notifBtn && !notifBtn.contains(e.target)) {
    notifPanel.classList.remove('active');
  }
});

// === НАСТРОЙКИ И ТЕМЫ ===
function toggleSettings() {
  const settingsModal = document.getElementById('settingsModal');
  settingsModal.classList.toggle('active');
  document.getElementById('powerMenu').classList.remove('active');
  updateThemeSelection();
  document.getElementById('toggleTransparency').checked = effects.transparency;
  document.getElementById('toggleAnimations').checked = effects.animations;
  applyDateFormat();
  document.getElementById('toggleSeconds').checked = showSeconds;
  
  if (settingsModal.classList.contains('active')) {
    document.getElementById('aboutPlatform').innerText = process.platform === 'win32' ? 'Windows' : process.platform;
    document.getElementById('aboutNode').innerText = process.versions.node;
    document.getElementById('aboutElectron').innerText = process.versions.electron;
    document.getElementById('aboutArch').innerText = process.arch;
  }
}

function togglePowerMenu() {
  document.getElementById('powerMenu').classList.toggle('active');
}

function switchTab(tabName, btnElement) {
  document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btnElement.classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

function setTheme(themeName) {
  currentTheme = themeName;
  localStorage.setItem('theme', themeName);
  applyTheme(themeName);
  updateThemeSelection();
}

function applyTheme(themeName) {
  const themes = {
    'blue': 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'dark': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    'purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'sunset': 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
  };
  document.body.style.background = themes[themeName] || themes['purple'];
}

function updateThemeSelection() {
  document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active-theme'));
  const active = document.querySelector(`.theme-card.${currentTheme}`);
  if (active) active.classList.add('active-theme');
}

function setCustomColor(color) {
  document.body.style.background = color;
  localStorage.setItem('theme', 'custom');
  updateThemeSelection();
}

function setCustomImage(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.body.style.background = `url(${e.target.result}) center/cover no-repeat`;
      localStorage.setItem('bgImage', e.target.result);
      localStorage.setItem('theme', 'custom-image');
      updateThemeSelection();
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function toggleEffect(type, isEnabled) {
  effects[type] = isEnabled;
  localStorage.setItem('effects', JSON.stringify(effects));
  applyEffects();
}

function applyEffects() {
  if (effects.animations) document.body.classList.remove('no-animations');
  else document.body.classList.add('no-animations');

  if (effects.transparency) document.body.classList.remove('no-transparency');
  else document.body.classList.add('no-transparency');
}

function openSystemApp(id) {
  const app = allApps.find(a => a.id === id);
  if (app) launchApp(app);
  toggleSettings();
}

function renderSettingsAppList() {
  const list = document.getElementById('settingsAppList');
  if (!list) return;
  list.innerHTML = '';
  const sortedApps = [...allApps].sort((a, b) => {
    const aPinned = pinnedApps.some(p => p.id === a.id);
    const bPinned = pinnedApps.some(p => p.id === b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return a.name.localeCompare(b.name);
  });

  sortedApps.forEach(app => {
    const isPinned = pinnedApps.some(p => p.id === app.id);
    const item = document.createElement('div');
    item.className = `app-item solid-bg ${isPinned ? 'pinned' : ''}`;
    item.innerHTML = `
      <div style="width:30px;height:30px;border-radius:50%;background:${getRandomGradient(app.name)};display:flex;align-items:center;justify-content:center;font-size:1rem;">${app.icon}</div>
      <span>${app.name}</span>
      <span class="pin-indicator">${isPinned ? '' : '+'}</span>
    `;
    item.onclick = () => togglePin(app.id);
    list.appendChild(item);
  });
}

function togglePin(id) {
  const existing = pinnedApps.find(p => p.id === id);
  if (existing) {
    pinnedApps = pinnedApps.filter(p => p.id !== id);
  } else {
    const pos = findFreePosition();
    pinnedApps.push({ id, x: pos.x, y: pos.y });
  }
  localStorage.setItem('pinnedApps', JSON.stringify(pinnedApps));
  renderDesktop();
  renderSettingsAppList();
}

function lockScreen() {
  document.getElementById('powerMenu').classList.remove('active');
  const ls = document.getElementById('lockScreen');
  ls.classList.add('active');
  updateLockScreen();
}

function updateLockScreen() {
  const now = new Date();
  document.getElementById('lockTime').innerText = formatTime(now, showSeconds);
  document.getElementById('lockDate').innerText = formatDate(now);
}

function unlockScreen() {
  document.getElementById('lockScreen').classList.remove('active');
}

function sleepSystem() {
  const cmd = process.platform === 'win32' ? 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0' : 'systemctl suspend';
  ipcRenderer.invoke('launch-app', cmd);
  document.getElementById('powerMenu').classList.remove('active');
}

function shutdownSystem() {
  const cmd = process.platform === 'win32' ? 'shutdown /s /t 0' : 'poweroff';
  if(confirm('Вы действительно хотите выключить компьютер?')) {
    ipcRenderer.invoke('launch-app', cmd);
  }
  document.getElementById('powerMenu').classList.remove('active');
}

function updateDateTime() {
  const now = new Date();
  document.getElementById('dateText').innerText = formatDate(now);
  document.getElementById('timeText').innerText = formatTime(now, showSeconds);
  
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen.classList.contains('active')) {
    updateLockScreen();
  }
}