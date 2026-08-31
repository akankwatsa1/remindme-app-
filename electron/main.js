/* RemindMe — Electron desktop wrapper (v1.2.0)
 *
 * The main process is the reminder authority for the packaged app:
 *   - It receives the current events from the renderer over IPC.
 *   - It schedules reminders in the MAIN process, so they fire as native
 *     Windows notifications even when the window is closed or minimized.
 *   - Closing the window hides the app to the system tray instead of quitting,
 *     so reminders keep working. Use "Quit" in the tray menu to exit fully.
 *
 * Security: contextIsolation is on, nodeIntegration is off; the renderer only
 * talks to us through the narrow preload bridge (electron/preload.js).
 */

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain } = require('electron');
const path = require('path');

const ICON_PNG = path.join(__dirname, '..', 'www', 'assets', 'app-icon.png');
const ICON_TRAY = path.join(__dirname, '..', 'www', 'assets', 'tray.ico');
const REARM_INTERVAL_MS = 60 * 60 * 1000; // re-check scheduled reminders hourly (covers capped timers & sleep)

// When launched with --hidden (e.g. at Windows sign-in via auto-start),
// start quietly in the tray without showing the window.
const startHidden = process.argv.includes('--hidden');

let win = null;
let tray = null;
let isQuitting = false;
let events = [];
let settings = {};
let timers = [];
const notified = new Map(); // eventId -> Set('advance' | 'due') — prevents duplicate notifications

/* ---------------------------------------------------------
 *  Window
 * -------------------------------------------------------*/
function createWindow() {
  win = new BrowserWindow({
    width: 1020,
    height: 780,
    minWidth: 700,
    minHeight: 560,
    title: 'RemindMe — Tasks & Reminders',
    backgroundColor: '#101320',
    icon: ICON_PNG,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false // keep the renderer's own engine alive in the background
    }
  });

  win.once('ready-to-show', () => {
    if (!startHidden) win.show();
  });
  win.on('close', (e) => {
    // Closing the window hides the app to the tray so reminders keep running.
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });

  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

function openWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendToRenderer(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

/* ---------------------------------------------------------
 *  Tray
 * -------------------------------------------------------*/
function createTray() {
  tray = new Tray(ICON_TRAY);
  tray.setToolTip('RemindMe — Tasks & Reminders');
  const menu = Menu.buildFromTemplate([
    { label: 'Open RemindMe', click: openWindow },
    { type: 'separator' },
    {
      label: 'Quit RemindMe',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', openWindow); // Windows: left-click opens the window
}

/* ---------------------------------------------------------
 *  Reminder scheduling (main process)
 * -------------------------------------------------------*/
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function isNotified(id, kind) {
  const set = notified.get(id);
  return !!(set && set.has(kind));
}

function markNotified(id, kind) {
  if (!notified.has(id)) notified.set(id, new Set());
  notified.get(id).add(kind);
}

function scheduleAll() {
  clearTimers();
  const now = Date.now();

  for (const ev of events) {
    if (!ev || ev.status !== 'pending') continue;
    const due = new Date(ev.dueISO).getTime();
    if (!Number.isFinite(due)) continue;

    // Due (or already past-due while the app was closed) → notify at due time
    if (!ev.dueAlertShown && !isNotified(ev.id, 'due')) {
      scheduleAt(due, ev, 'due');
    }
    // Advance reminder (e.g. 1 day before)
    if (ev.remindBeforeMin != null && !ev.reminded && !isNotified(ev.id, 'advance') && now < due) {
      scheduleAt(due - ev.remindBeforeMin * 60000, ev, 'advance');
    }
  }
}

function scheduleAt(target, ev, kind) {
  const now = Date.now();
  if (now >= target) {
    maybeFire(ev, kind);
    return;
  }
  // setTimeout caps out at ~24.8 days; the hourly re-arm handles longer waits
  const delay = Math.min(target - now, 2147483647);
  timers.push(setTimeout(() => maybeFire(ev, kind), delay));
}

function maybeFire(ev, kind) {
  const due = new Date(ev.dueISO).getTime();
  const target = kind === 'due' ? due : due - (ev.remindBeforeMin || 0) * 60000;
  if (!Number.isFinite(due) || Date.now() < target) return; // capped timer fired early — re-arm will catch it
  fire(ev, kind);
}

function fire(ev, kind) {
  if (isNotified(ev.id, kind)) return;
  markNotified(ev.id, kind);

  // If the window is visible, the renderer shows the in-app alert itself —
  // avoid doubling up with an OS notification.
  if (win && !win.isDestroyed() && win.isVisible()) return;

  showNotification(ev, kind);
}

function relativeLabel(ms) {
  const abs = Math.abs(ms);
  const mins = Math.max(1, Math.round(abs / 60000));
  if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's');
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ' + rem + ' minute' + (rem === 1 ? '' : 's') : hrs + ' hour' + (hrs === 1 ? '' : 's');
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH ? days + ' day' + (days === 1 ? '' : 's') + ' ' + remH + ' hour' + (remH === 1 ? '' : 's') : days + ' day' + (days === 1 ? '' : 's');
}

function showNotification(ev, kind) {
  if (!Notification.isSupported()) return;
  const due = new Date(ev.dueISO);
  const title = kind === 'due' ? 'Event due — RemindMe' : 'Reminder — RemindMe';
  let body;
  if (kind === 'due') {
    body = '"' + ev.title + '" is due now and will be marked as done.';
  } else {
    const diff = due.getTime() - Date.now();
    body = '"' + ev.title + '" is due ' + (diff <= 0 ? 'now' : 'in ' + relativeLabel(diff)) + '.';
  }
  const n = new Notification({ title, body, icon: ICON_PNG });
  n.on('click', () => {
    openWindow();
    sendToRenderer('remindme:open-event', ev.id);
  });
  n.show();
}

/* ---------------------------------------------------------
 *  IPC: renderer keeps the main process up to date
 * -------------------------------------------------------*/
ipcMain.on('remindme:events', (_event, payload) => {
  if (payload && Array.isArray(payload.events)) events = payload.events;
  if (payload && payload.settings) settings = payload.settings;
  scheduleAll();
});

/* ---------------------------------------------------------
 *  Auto-start with Windows (Settings toggle)
 * -------------------------------------------------------*/
function getAutoStartState() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (err) {
    return false;
  }
}

ipcMain.handle('remindme:get-login', () => getAutoStartState());

ipcMain.handle('remindme:set-login', (_event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: ['--hidden'] // start quietly in the tray at sign-in
    });
  } catch (err) {
    // Registry access may be unavailable in some environments; report current state
  }
  return getAutoStartState();
});

/* ---------------------------------------------------------
 *  App lifecycle
 * -------------------------------------------------------*/
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', openWindow);

  app.whenReady().then(() => {
    // Needed for Windows notifications to appear with the app's own identity
    app.setAppUserModelId('com.remindme.app');
    createWindow();
    createTray();
    setInterval(scheduleAll, REARM_INTERVAL_MS);
  });

  app.on('activate', openWindow);
  app.on('before-quit', () => { isQuitting = true; });
  // With close-to-tray we normally never reach this; keep the app alive.
  app.on('window-all-closed', () => { /* stay in the tray */ });
}
