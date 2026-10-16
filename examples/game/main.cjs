// Electron main process. The only makevideo line is attach(win).
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
// In your own game: require('makevideo/electron'). This sample uses the repo copy.
const { attach } = require('../../src/electron.cjs');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1280, height: 720, backgroundColor: '#05060a', autoHideMenuBar: true, webPreferences: { backgroundThrottling: false } });
  attach(win); // F8 = save the last 15 s; `makevideo shoot` drives shots through it
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
