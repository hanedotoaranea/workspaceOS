const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: false,           // Убрали полный экран
    frame: false,                 // Без рамок
    skipTaskbar: true,            // Не показывать в панели задач
    alwaysOnBottom: true,         // ВСЕГДА НА ЗАДНЕМ ПЛАНЕ
    focusable: false,             // Не получать фокус (чтобы Alt+Tab работал)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('renderer/index.html');
  
  // Развернуть на весь экран, но не в полный экран
  mainWindow.maximize();
  
  // Запретить изменение размера
  mainWindow.setResizable(false);
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
    
    apps.unshift(
      { id: 'sys_terminal', name: 'Терминал', icon: '💻', exec: 'start wt' },
      { id: 'sys_settings', name: 'Параметры', icon: '⚙️', exec: 'start ms-settings:' },
      { id: 'sys_explorer', name: 'Проводник', icon: '', exec: 'start explorer' },
      { id: 'sys_calc', name: 'Калькулятор', icon: '🧮', exec: 'start calc' }
    );
    
  } else if (process.platform === 'linux') {
    const desktopPaths = [
      '/usr/share/applications/',
      path.join(process.env.HOME, '.local', 'share', 'applications'),
      '/var/lib/flatpak/exports/share/applications/',
      path.join(process.env.HOME, '.local', 'share', 'flatpak', 'exports', 'share', 'applications')
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
            if (name.toLowerCase().includes('firefox') || name.toLowerCase().includes('chrome') || name.toLowerCase().includes('browser')) icon = '🌐';
            else if (name.toLowerCase().includes('terminal') || name.toLowerCase().includes('console')) icon = '💻';
            else if (name.toLowerCase().includes('settings') || name.toLowerCase().includes('config')) icon = '⚙️';
            else if (name.toLowerCase().includes('file') || name.toLowerCase().includes('manager')) icon = '📁';
            else if (name.toLowerCase().includes('music') || name.toLowerCase().includes('audio')) icon = '';
            else if (name.toLowerCase().includes('video') || name.toLowerCase().includes('media')) icon = '🎬';
            else if (name.toLowerCase().includes('image') || name.toLowerCase().includes('photo')) icon = '🖼️';
            
            apps.push({
              id: `linux_${file.replace('.desktop', '')}`,
              name,
              icon,
              exec
            });
          } catch (e) {
            console.error(`Error parsing ${file}:`, e);
          }
        });
      } catch (e) {
        console.error(`Error reading ${desktopPath}:`, e);
      }
    });
    
    apps.unshift(
      { id: 'sys_terminal', name: 'Терминал', icon: '💻', exec: 'gnome-terminal || konsole || xterm' },
      { id: 'sys_settings', name: 'Параметры', icon: '⚙️', exec: 'gnome-control-center || kde-systemsettings' },
      { id: 'sys_files', name: 'Файлы', icon: '', exec: 'nautilus || dolphin || thunar' },
      { id: 'sys_browser', name: 'Браузер', icon: '', exec: 'firefox || google-chrome || chromium' }
    );
  }
  
  const uniqueApps = apps.filter((app, index, self) => 
    index === self.findIndex(a => a.name === app.name)
  );
  
  return uniqueApps.slice(0, 100);
});

// === ЗАПУСК ПРИЛОЖЕНИЙ ===
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

// === СИСТЕМНЫЕ КОМАНДЫ (Кроссплатформенно) ===
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});