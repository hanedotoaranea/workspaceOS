const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920, height: 1080, fullscreen: true, frame: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  mainWindow.loadFile('renderer/index.html');
}

// 1. Получаем список ВСЕХ установленных приложений
ipcMain.handle('get-all-apps', async () => {
  const apps = [];
  
  // Для Windows: сканируем меню Пуск и Program Files
  if (process.platform === 'win32') {
    const startMenuPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    
    // Функция рекурсивного поиска .lnk файлов
    const scanDir = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) scanDir(fullPath);
          else if (file.endsWith('.lnk')) {
            // Извлекаем имя без расширения
            const name = file.replace('.lnk', '');
            // Простая эмуляция иконки (в реальном Linux будет читать .desktop)
            let icon = '📦';
            if (name.toLowerCase().includes('chrome') || name.toLowerCase().includes('browser')) icon = '🌐';
            else if (name.toLowerCase().includes('word') || name.toLowerCase().includes('doc')) icon = '📝';
            else if (name.toLowerCase().includes('steam') || name.toLowerCase().includes('game')) icon = '';
            
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
    
    // Добавляем системные утилиты вручную для удобства
    apps.unshift(
      { id: 'sys_terminal', name: 'Терминал', icon: '💻', exec: 'start wt' }, // Windows Terminal
      { id: 'sys_settings', name: 'Параметры', icon: '⚙️', exec: 'start ms-settings:' },
      { id: 'sys_wifi', name: 'Wi-Fi', icon: '📶', exec: 'start ms-settings:network-wifi' },
      { id: 'sys_sound', name: 'Звук', icon: '', exec: 'start ms-settings:sound' }
    );
  } 
  
  // Для Linux (будет работать после переноса):
  /*
  const linuxAppsDir = '/usr/share/applications/';
  if (fs.existsSync(linuxAppsDir)) {
    const files = fs.readdirSync(linuxAppsDir).filter(f => f.endsWith('.desktop'));
    files.forEach(file => {
      const content = fs.readFileSync(path.join(linuxAppsDir, file), 'utf8');
      const name = content.match(/Name=(.+)/)?.[1]?.split('\n')[0] || file;
      const icon = content.match(/Icon=(.+)/)?.[1] || '📦';
      const execCmd = content.match(/Exec=(.+)/)?.[1]?.split(' ')[0] || '';
      if (!content.includes('NoDisplay=true') && execCmd) {
        apps.push({ id: file.replace('.desktop',''), name, icon, exec: execCmd });
      }
    });
  }
  */

  return apps.slice(0, 50); // Ограничиваем 50 приложениями для скорости
});

// 2. Запуск приложений
ipcMain.handle('launch-app', (event, command) => {
  exec(command, (error) => { if (error) console.error(error); });
  return true;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });