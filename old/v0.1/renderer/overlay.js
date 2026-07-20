const { ipcRenderer } = require('electron');

let allApps = [];
let pinnedApps = JSON.parse(localStorage.getItem('pinnedApps')) || [];
let currentTheme = localStorage.getItem('theme') || 'purple';
let effects = JSON.parse(localStorage.getItem('effects')) || { transparency: true, animations: true };
let dateFormat = localStorage.getItem('dateFormat') || 'full';
let showSeconds = localStorage.getItem('showSeconds') === 'true';

let openWindows = [];
let isSwitcherActive = false;
let currentSwitcherIndex = 0;

// === Скрыть оверлей ===
function hideOverlay() {
  ipcRenderer.invoke('hide-overlay');
}

// === Получение списка приложений (как было) ===
async function loadApps() {
  allApps = await ipcRenderer.invoke('get-all-apps');
  if (pinnedApps.length === 0 && allApps.length > 0) {
    const defaultIds = ['sys_terminal', 'sys_settings'];
    const defaults = allApps.filter(a => defaultIds.includes(a.id));
    defaults.forEach((app, index) => {
      pinnedApps.push({ id: app.id, x: 40 + index * (ICON_WIDTH + 20), y: 150 });
    });
    localStorage.setItem('pinnedApps', JSON.stringify(pinnedApps));
  }
}

// === Функции рендеринга (иконок, лаунчера, настроек и т.д.) ===
// ... (перенести из app.js все функции, кроме тех, что касаются только рабочего стола)

// === Обработка IPC ===
ipcRenderer.on('window-list-updated', (event, windows) => {
  openWindows = windows;
  if (isSwitcherActive) {
    renderSwitcherCards();
    updateSwitcherSelection();
  }
});

ipcRenderer.on('activate-switcher', () => {
  if (!isSwitcherActive) {
    // Показываем переключатель
    isSwitcherActive = true;
    renderSwitcherCards();
    document.getElementById('windowSwitcher').classList.add('active');
    currentSwitcherIndex = 0;
    updateSwitcherSelection();
  } else {
    // Переключение на следующее окно
    if (openWindows.length > 0) {
      currentSwitcherIndex = (currentSwitcherIndex + 1) % openWindows.length;
      updateSwitcherSelection();
    }
  }
});

// Также нужно обрабатывать нажатие Enter для выбора окна
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && isSwitcherActive) {
    if (openWindows[currentSwitcherIndex]) {
      ipcRenderer.invoke('focus-window', openWindows[currentSwitcherIndex].id);
      hideOverlay();
    }
  }
  if (e.key === 'Escape') {
    hideOverlay();
  }
});

// Остальные функции (toggleLauncher, toggleSettings, lockScreen и т.д.) остаются без изменений,
// но теперь они работают внутри оверлея и при вызове не должны дублироваться с рабочим столом.

// === Инициализация ===
window.addEventListener('DOMContentLoaded', async () => {
  await loadApps();
  renderDesktop(); // если иконки на рабочем столе должны отображаться и в оверлее? Нет, они только в основном окне. Поэтому здесь не рисуем desktop.
  // Но в оверлее мы можем показывать список приложений в лаунчере при первом открытии.
  renderLauncherGrid();
  updateDateTime();
  setInterval(updateDateTime, 1000);
  applyEffects();
  applyDateFormat();
  document.getElementById('toggleSeconds').checked = showSeconds;
  // ... остальные инициализации
});