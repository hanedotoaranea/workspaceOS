const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;
const appWindows = new Map(); // Хранилище запущенных окон

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: false,
    frame: false,
    skipTaskbar: true,
    alwaysOnBottom: true,
    focusable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.maximize();
  mainWindow.setResizable(false);

  // Глобальный хоткей Super+D (Показать рабочий стол)
  globalShortcut.register('Super+D', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      mainWindow.webContents.send('toggle-desktop-view');
    }
  });
}

// === ПОИСК ПРИЛОЖЕНИЙ ===
ipcMain.handle('get-all-apps', async () => {
  const apps = [];
  
  if (process.platform === 'win32') {
    const startMenuPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    
    const scanDir = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) scanDir(fullPath);
          else if (file.endsWith('.lnk')) {
            const name = file.replace('.lnk', '');
            let icon = '📦';
            if (name.toLowerCase().includes('chrome') || name.toLowerCase().includes('browser')) icon = '🌐';
            else if (name.toLowerCase().includes('terminal') || name.toLowerCase().includes('cmd')) icon = '💻';
            else if (name.toLowerCase().includes('settings')) icon = '⚙️';
            else if (name.toLowerCase().includes('explorer') || name.toLowerCase().includes('file')) icon = '';
            
            apps.push({ 
              id: `win_${name.replace(/\s+/g, '_')}`, 
              name, 
              icon, 
              exec: `start "" "${fullPath}"` 
            });
          }
        });
      } catch (e) {}
    };
    
    scanDir(startMenuPath);
    
    apps.unshift(
      { id: 'sys_terminal', name: 'Терминал', icon: '💻', exec: 'start wt' },
      { id: 'sys_settings', name: 'Параметры', icon: '️', exec: 'start ms-settings:' },
      { id: 'sys_explorer', name: 'Проводник', icon: '', exec: 'start explorer' },
      { id: 'sys_calc', name: 'Калькулятор', icon: '🧮', exec: 'start calc' }
    );
    
  } else if (process.platform === 'linux') {
    const desktopPaths = [
      '/usr/share/applications/',
      path.join(process.env.HOME, '.local', 'share', 'applications')
    ];
    
    desktopPaths.forEach(desktopPath => {
      if (!fs.existsSync(desktopPath)) return;
      
      try {
        const files = fs.readdirSync(desktopPath);
        files.forEach(file => {
          if (!file.endsWith('.desktop')) return;
          
          try {
            const content = fs.readFileSync(path.join(desktopPath, file), 'utf8');
            
            const nameMatch = content.match(/^Name=(.+)$/m);
            const execMatch = content.match(/^Exec=(.+)$/m);
            const noDisplayMatch = content.match(/^NoDisplay=(.+)$/m);
            
            if (!nameMatch || !execMatch) return;
            if (noDisplayMatch && noDisplayMatch[1] === 'true') return;
            
            const name = nameMatch[1].split('\n')[0];
            let exec = execMatch[1].split(' ')[0];
            
            let icon = '📦';
            if (name.toLowerCase().includes('firefox') || name.toLowerCase().includes('chrome')) icon = '';
            else if (name.toLowerCase().includes('terminal') || name.toLowerCase().includes('console')) icon = '💻';
            else if (name.toLowerCase().includes('settings') || name.toLowerCase().includes('config')) icon = '⚙️';
            else if (name.toLowerCase().includes('file') || name.toLowerCase().includes('manager')) icon = '📁';
            
            apps.push({
              id: `linux_${file.replace('.desktop', '')}`,
              name,
              icon,
              exec
            });
          } catch (e) {}
        });
      } catch (e) {}
    });
    
    apps.unshift(
      { id: 'sys_terminal', name: 'Терминал', icon: '', exec: 'gnome-terminal || xfce4-terminal || xterm' },
      { id: 'sys_settings', name: 'Параметры', icon: '⚙️', exec: 'gnome-control-center || xfce4-settings-manager' },
      { id: 'sys_files', name: 'Файлы', icon: '📁', exec: 'nautilus || thunar || pcmanfm' },
      { id: 'sys_browser', name: 'Браузер', icon: '🌐', exec: 'firefox || chromium' }
    );
  }
  
  const uniqueApps = apps.filter((app, index, self) => 
    index === self.findIndex(a => a.name === app.name)
  );
  
  return uniqueApps.slice(0, 100);
});

// === ЗАПУСК И ТРЕКИНГ ОКОН ===
ipcMain.handle('launch-app', (event, command) => {
  try {
    if (process.platform === 'win32') {
      exec(command, (error) => {
        if (error) console.error('Windows launch error:', error);
      });
    } else if (process.platform === 'linux') {
      exec(`${command} &`, (error) => {
        if (error) console.error('Linux launch error:', error);
      });
    }
    return true;
  } catch (error) {
    console.error('Launch error:', error);
    return false;
  }
});

// Отслеживаем создание окон другими приложениями
app.on('browser-window-created', (_, window) => {
  if (window === mainWindow) return; // Игнорируем само workspaceOS
  
  const id = window.id;
  appWindows.set(id, window);
  
  window.on('closed', () => {
    appWindows.delete(id);
    mainWindow.webContents.send('windows-updated');
  });
  
  window.on('focus', () => {
    mainWindow.webContents.send('windows-updated');
  });
});

// IPC для получения списка активных окон
ipcMain.handle('get-open-windows', () => {
  const windows = [];
  for (const [id, win] of appWindows) {
    if (!win.isDestroyed() && !win.isMinimized()) {
      windows.push({
        id,
        title: win.getTitle(),
        isFocused: win.isFocused()
      });
    }
  }
  return windows.sort((a, b) => (b.isFocused ? 1 : 0) - (a.isFocused ? 1 : 0));
});

// IPC для фокусировки окна
ipcMain.handle('focus-window', (event, id) => {
  const win = appWindows.get(id);
  if (win && !win.isDestroyed()) {
    win.restore();
    win.focus();
  }
});

// Системные команды
ipcMain.handle('system-command', (event, command) => {
  try {
    exec(command, (error) => {
      if (error) console.error('System command error:', error);
    });
    return true;
  } catch (error) {
    return false;
  }
});

app.whenReady().then(createWindow);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});