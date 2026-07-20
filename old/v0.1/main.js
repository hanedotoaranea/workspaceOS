const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let isRaised = false;
let isSwitcherActive = false;

// Определяем платформу
const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
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
  mainWindow.setResizable(false);

  mainWindow.on('blur', () => {
    if (isRaised) {
      lowerWindow();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function raiseWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnBottom(false);
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  isRaised = true;
  mainWindow.webContents.send('raise-window');
}

function lowerWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setAlwaysOnBottom(true);
  isRaised = false;
  isSwitcherActive = false;
  mainWindow.webContents.send('lower-window');
}

// === ПОЛУЧЕНИЕ СПИСКА ОКОН (Windows + Linux) ===
function getWindowList() {
  return new Promise((resolve) => {
    if (isWindows) {
      // PowerShell скрипт для получения списка окон
      const psScript = `
        Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
          $title = $_.MainWindowTitle
          if ($title -and $title -notlike "*workspaceOS*") {
            $id = $_.Id
            [PSCustomObject]@{
              id = $id
              title = $title
              pid = $id
              desktop = "0"
            }
          }
        } | ConvertTo-Json
      `;
      
      exec(`powershell -Command "${psScript}"`, (error, stdout) => {
        if (error) {
          console.error('PowerShell error:', error);
          resolve([]);
          return;
        }
        try {
          const windows = JSON.parse(stdout);
          // Если результат не массив, превращаем в массив
          const result = Array.isArray(windows) ? windows : (windows ? [windows] : []);
          resolve(result);
        } catch (e) {
          console.error('Parse error:', e);
          resolve([]);
        }
      });
    } else if (isLinux) {
      // Linux через wmctrl
      exec('wmctrl -l', (error, stdout) => {
        if (error) {
          console.error('wmctrl error:', error);
          resolve([]);
          return;
        }
        const lines = stdout.trim().split('\n').filter(line => line.length > 0);
        const windows = lines.map(line => {
          const parts = line.split(/\s+/);
          if (parts.length < 4) return null;
          const id = parts[0];
          const desktop = parts[1];
          const pid = parts[2];
          const title = parts.slice(3).join(' ');
          if (title.includes('workspaceOS')) return null;
          return { id, desktop, pid, title };
        }).filter(w => w !== null);
        resolve(windows);
      });
    } else {
      resolve([]);
    }
  });
}

// === ФОКУСИРОВКА ОКНА (Windows + Linux) ===
function focusWindow(windowId) {
  if (isWindows) {
    // Используем PowerShell для фокусировки окна по PID
    const psScript = `
      Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class Window {
          [DllImport("user32.dll")]
          public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")]
          public static extern IntPtr FindWindowByThreadId(int pid);
        }
"@
      $hwnd = [Window]::FindWindowByThreadId(${windowId})
      if ($hwnd -ne 0) {
        [Window]::SetForegroundWindow($hwnd)
      }
    `;
    exec(`powershell -Command "${psScript}"`, (error) => {
      if (error) console.error('Focus error:', error);
    });
  } else if (isLinux) {
    exec(`wmctrl -i -a ${windowId}`, (error) => {
      if (error) console.error('Focus error:', error);
    });
  }
}

async function updateWindowList() {
  const windows = await getWindowList();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window-list-updated', windows);
  }
}

// === ПОИСК ПРИЛОЖЕНИЙ (Windows + Linux) ===
ipcMain.handle('get-all-apps', async () => {
  const apps = [];
  
  if (isWindows) {
    // Windows: поиск в меню "Пуск"
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
            else if (name.toLowerCase().includes('explorer') || name.toLowerCase().includes('file')) icon = '📁';
            
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
    
    // Системные приложения Windows
    apps.unshift(
      { id: 'sys_terminal', name: 'Терминал', icon: '💻', exec: 'start wt' },
      { id: 'sys_settings', name: 'Параметры', icon: '⚙️', exec: 'start ms-settings:' },
      { id: 'sys_explorer', name: 'Проводник', icon: '📁', exec: 'start explorer' },
      { id: 'sys_calc', name: 'Калькулятор', icon: '🧮', exec: 'start calc' }
    );
    
  } else if (isLinux) {
    // Linux: поиск .desktop файлов
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
            if (name.toLowerCase().includes('firefox') || name.toLowerCase().includes('chrome')) icon = '🌐';
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
      { id: 'sys_terminal', name: 'Терминал', icon: '💻', exec: 'gnome-terminal || xfce4-terminal || xterm' },
      { id: 'sys_settings', name: 'Параметры', icon: '⚙️', exec: 'gnome-control-center || xfce4-settings-manager' },
      { id: 'sys_files', name: 'Файлы', icon: '📁', exec: 'nautilus || thunar || pcmanfm' },
      { id: 'sys_browser', name: 'Браузер', icon: '🌐', exec: 'firefox || chromium' }
    );
  }
  
  // Удаляем дубликаты
  const uniqueApps = apps.filter((app, index, self) => 
    index === self.findIndex(a => a.name === app.name)
  );
  
  return uniqueApps.slice(0, 100);
});

// === ЗАПУСК ПРИЛОЖЕНИЙ ===
ipcMain.handle('launch-app', (event, command) => {
  try {
    if (isWindows) {
      exec(command, (error) => {
        if (error) console.error('Windows launch error:', error);
      });
    } else if (isLinux) {
      exec(`${command} &`, (error) => {
        if (error) console.error('Linux launch error:', error);
      });
    }
    // После запуска опускаем окно
    setTimeout(() => lowerWindow(), 500);
    return true;
  } catch (error) {
    console.error('Launch error:', error);
    return false;
  }
});

ipcMain.handle('system-command', (event, command) => {
  exec(command, (error) => { if (error) console.error(error); });
  return true;
});

// === УПРАВЛЕНИЕ ОКНОМ ===
ipcMain.handle('raise-window', () => raiseWindow());
ipcMain.handle('lower-window', () => lowerWindow());
ipcMain.handle('get-window-list', getWindowList);
ipcMain.handle('focus-window', (event, id) => focusWindow(id));

// === ГОРЯЧИЕ КЛАВИШИ ===
app.whenReady().then(() => {
  createWindow();

  // Super+Space (Windows: Win+Space, Linux: Super+Space)
  globalShortcut.register('Super+Space', () => {
    if (isRaised) {
      lowerWindow();
    } else {
      raiseWindow();
    }
  });

  // Alt+Tab (переключатель окон)
  globalShortcut.register('Alt+Tab', () => {
    if (!isRaised) {
      raiseWindow();
      setTimeout(() => {
        mainWindow.webContents.send('activate-switcher');
        isSwitcherActive = true;
      }, 100);
    } else {
      mainWindow.webContents.send('switch-window-next');
      isSwitcherActive = true;
    }
  });

  // Escape
  globalShortcut.register('Escape', () => {
    if (isRaised) lowerWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});