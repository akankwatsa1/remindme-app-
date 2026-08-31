/*!
 * RemindMe — Tasks & Reminders
 * An accessible to-do list with date/time reminders.
 * Pure HTML/CSS/JS — no dependencies. Ready to be wrapped with Electron (see /electron).
 */
'use strict';

/* =========================================================
 *  Constants
 * =======================================================*/
const STORAGE_EVENTS = 'rm.events.v1';
const STORAGE_SETTINGS = 'rm.settings.v1';
const STORAGE_THEME = 'rm.theme';
const CHECK_INTERVAL_MS = 15000;    // how often the reminder engine runs
const REFRESH_RELATIVE_MS = 60000;  // how often relative times are refreshed

const CATEGORY_LABELS = { personal: 'Personal', work: 'Work', finance: 'Finance', health: 'Health', other: 'Other' };
const REPEAT_LABELS = { none: '', daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly', yearly: 'Repeats yearly' };
const REPEAT_OPTIONS = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'];
const REPEAT_UNITS = { day: 'day', week: 'week', month: 'month', year: 'year' };

const ICONS = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  pencil: '<path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  bellOff: '<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>',
  bellRing: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-8"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M2 8a6 6 0 0 1 .7-2.7"/><path d="M22 8a6 6 0 0 0-.7-2.7"/>'
};

/* =========================================================
 *  Tiny helpers
 * =======================================================*/
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
function pad2(n) { return String(n).padStart(2, '0'); }

function toDateInput(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function toTimeInput(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function toLocalISO(d) { return toDateInput(d) + 'T' + toTimeInput(d); }

function fmtDate(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* Date and time are chosen from dropdown selects (day/month/year, hour/minute).
 * Selects are screen-reader friendly and work with the on-screen keyboard —
 * no typing, no format errors, no cursor jumping. */
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function buildDateSelects() {
  const daySel = $('#f-day');
  const monthSel = $('#f-month');
  const yearSel = $('#f-year');
  daySel.textContent = '';
  for (let d = 1; d <= 31; d++) {
    const o = document.createElement('option');
    o.value = String(d);
    o.textContent = String(d);
    daySel.appendChild(o);
  }
  monthSel.textContent = '';
  MONTH_NAMES.forEach(function (name, i) {
    const o = document.createElement('option');
    o.value = String(i + 1);
    o.textContent = name;
    monthSel.appendChild(o);
  });
  yearSel.textContent = '';
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 1; y <= currentYear + 10; y++) {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = String(y);
    yearSel.appendChild(o);
  }
}

function buildTimeSelects() {
  const hourSel = $('#f-hour');
  const minuteSel = $('#f-minute');
  hourSel.textContent = '';
  for (let h = 0; h <= 23; h++) {
    const o = document.createElement('option');
    o.value = String(h);
    o.textContent = pad2(h);
    hourSel.appendChild(o);
  }
  minuteSel.textContent = '';
  for (let m = 0; m <= 59; m++) {
    const o = document.createElement('option');
    o.value = String(m);
    o.textContent = pad2(m);
    minuteSel.appendChild(o);
  }
}

function setDateSelects(date) {
  $('#f-day').value = String(date.getDate());
  $('#f-month').value = String(date.getMonth() + 1);
  // Ensure the event's year is available when editing old events
  const yearSel = $('#f-year');
  const y = String(date.getFullYear());
  if (!Array.from(yearSel.options).some(function (o) { return o.value === y; })) {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    yearSel.appendChild(o);
    const years = Array.from(yearSel.options).map(function (op) { return Number(op.value); }).sort(function (a, b) { return a - b; });
    yearSel.textContent = '';
    years.forEach(function (yv) {
      const op = document.createElement('option');
      op.value = String(yv);
      op.textContent = String(yv);
      yearSel.appendChild(op);
    });
  }
  yearSel.value = y;
}

function setTimeSelects(date) {
  $('#f-hour').value = String(date.getHours());
  $('#f-minute').value = String(date.getMinutes());
}

function readDateSelects() {
  return {
    y: Number($('#f-year').value),
    mo: Number($('#f-month').value),
    d: Number($('#f-day').value),
    h: Number($('#f-hour').value),
    mi: Number($('#f-minute').value)
  };
}

function iconHTML(name) {
  return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

/* Human-friendly duration, e.g. "3 days 2 hours" */
function relativeTime(ms) {
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's');
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins ? hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ' + remMins + ' minute' + (remMins === 1 ? '' : 's') : hrs + ' hour' + (hrs === 1 ? '' : 's');
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs ? days + ' day' + (days === 1 ? '' : 's') + ' ' + remHrs + ' hour' + (remHrs === 1 ? '' : 's') : days + ' day' + (days === 1 ? '' : 's');
}

/* "30 day" / "1 week" — plural-aware unit label for custom repeats */
function repeatUnitLabel(unit, count) {
  const base = REPEAT_UNITS[unit] || 'day';
  return count === 1 ? base : base + 's';
}

/* Human label for a repeat setting, e.g. "Repeats weekly" or "Every 30 days" */
function repeatLabel(ev) {
  if (ev.repeat === 'custom') return 'Every ' + ev.repeatEvery + ' ' + repeatUnitLabel(ev.repeatUnit, ev.repeatEvery);
  return REPEAT_LABELS[ev.repeat] || '';
}

/* =========================================================
 *  State
 * =======================================================*/
let events = [];
let settings = { theme: null, sound: true, defaultRemind: 60, notificationsRequested: false };
let currentFilter = 'all';
let searchQuery = '';
let editingId = null;
let alertQueue = [];      // alerts waiting to be shown
let pendingAcks = [];     // alerts sent as system notifications while hidden
let alertBusy = false;
let currentAlertItem = null;
let formSnapshot = '';
let audioCtx = null;

/* =========================================================
 *  Storage
 * =======================================================*/
function defaultSettings() { return { theme: 'system', sound: true, defaultRemind: 60, notificationsRequested: false, ringtone: null }; }

function normalizeEvent(ev) {
  if (!ev || typeof ev !== 'object' || !ev.title || !ev.dueISO) return null;
  if (isNaN(new Date(ev.dueISO).getTime())) return null;
  return {
    id: typeof ev.id === 'string' && ev.id ? ev.id : uid(),
    title: String(ev.title).slice(0, 120),
    notes: typeof ev.notes === 'string' ? ev.notes.slice(0, 1000) : '',
    category: CATEGORY_LABELS[ev.category] ? ev.category : 'other',
    dueISO: ev.dueISO,
    remindBeforeMin: Number.isFinite(ev.remindBeforeMin) ? ev.remindBeforeMin : null,
    repeat: REPEAT_OPTIONS.indexOf(ev.repeat) !== -1 ? ev.repeat : 'none',
    repeatEvery: Number.isFinite(ev.repeatEvery) ? Math.max(1, Math.min(3650, Math.round(ev.repeatEvery))) : 1,
    repeatUnit: REPEAT_UNITS[ev.repeatUnit] ? ev.repeatUnit : 'day',
    status: ev.status === 'done' ? 'done' : 'pending',
    doneAt: Number.isFinite(ev.doneAt) ? ev.doneAt : null,
    reminded: !!ev.reminded,
    dueAlertShown: !!ev.dueAlertShown,
    snoozeUntil: Number.isFinite(ev.snoozeUntil) ? ev.snoozeUntil : null,
    createdAt: Number.isFinite(ev.createdAt) ? ev.createdAt : Date.now(),
    updatedAt: Number.isFinite(ev.updatedAt) ? ev.updatedAt : Date.now()
  };
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_EVENTS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalizeEvent).filter(Boolean);
  } catch (err) {
    console.error('Could not load events', err);
    return [];
  }
}

function saveEvents() {
  try {
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(events));
  } catch (err) {
    console.error('Could not save events', err);
    toast('Warning: could not save to local storage.');
  }
  syncToPlatform();
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}');
    return Object.assign(defaultSettings(), parsed);
  } catch (err) {
    return defaultSettings();
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
    // Always store the RESOLVED theme for the pre-paint script in <head>
    localStorage.setItem(STORAGE_THEME, document.documentElement.dataset.theme || 'light');
  } catch (err) {
    console.error('Could not save settings', err);
  }
  syncToPlatform();
}

/* ---------------------------------------------------------
 *  Platform bridges
 *  Electron: the main process owns OS notifications and fires
 *    reminders even when the window is closed.
 *  Android (Capacitor): notifications are scheduled with the OS,
 *    so they fire even when the app is closed.
 *  Browser: in-app alerts + optional Notification API.
 * -------------------------------------------------------*/
function isDesktopApp() {
  return !!(window.remindme && window.remindme.isDesktop);
}

function isNativeApp() {
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
}

function nativeNotifications() {
  try {
    if (!isNativeApp() || !window.Capacitor || !window.Capacitor.Plugins) return null;
    return window.Capacitor.Plugins.LocalNotifications || null;
  } catch (err) {
    return null;
  }
}

function syncToDesktop() {
  if (!isDesktopApp() || typeof window.remindme.sendEvents !== 'function') return;
  try {
    window.remindme.sendEvents({ events: events, settings: settings });
  } catch (err) { /* bridge unavailable — ignore */ }
}

/* Android: keep the OS-scheduled notifications in step with the events.
 * Scheduled with the system, they fire even when the app is closed. */
function syncNativeNotifications() {
  const ln = nativeNotifications();
  if (!ln) return;
  try {
    ln.cancelAll().then(function () {
      const now = Date.now();
      const notifications = [];
      for (const ev of events) {
        if (!ev || ev.status !== 'pending') continue;
        const due = new Date(ev.dueISO).getTime();
        if (!Number.isFinite(due)) continue;
        if (!ev.dueAlertShown && due > now) {
          notifications.push({
            id: numericId(ev.id + ':due'),
            title: 'Event due — RemindMe',
            body: '"' + ev.title + '" is due now and will be marked as done.',
            schedule: { at: new Date(due), allowWhileIdle: true },
            extra: { evId: ev.id }
          });
        }
        if (ev.remindBeforeMin != null && !ev.reminded && due - ev.remindBeforeMin * 60000 > now) {
          notifications.push({
            id: numericId(ev.id + ':advance'),
            title: 'Reminder — RemindMe',
            body: '"' + ev.title + '" is due soon.',
            schedule: { at: new Date(due - ev.remindBeforeMin * 60000), allowWhileIdle: true },
            extra: { evId: ev.id }
          });
        }
      }
      if (notifications.length) ln.schedule({ notifications: notifications });
    }).catch(function () { /* permission or scheduling failure — in-app alerts still work */ });
  } catch (err) { /* ignore */ }
}

/* Stable small integer id for the Android notification system */
function numericId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483647;
}

function syncToPlatform() {
  syncToDesktop();
  syncNativeNotifications();
}

/* "Start with Windows" toggle (desktop app only) */
function initAutoStartUI() {
  const row = $('#autostart-row');
  if (!isDesktopApp() || !row) return;
  row.hidden = false;
  const btn = $('#btn-autostart');
  const update = function (enabled) {
    btn.setAttribute('aria-pressed', String(!!enabled));
    btn.textContent = enabled ? 'On' : 'Off';
  };
  if (typeof window.remindme.getAutoStart === 'function') {
    window.remindme.getAutoStart().then(update).catch(function () { /* ignore */ });
  }
  btn.addEventListener('click', function () {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    if (typeof window.remindme.setAutoStart !== 'function') return;
    window.remindme.setAutoStart(next)
      .then(function (state) {
        update(state);
        toast(state ? 'RemindMe will start with Windows.' : 'RemindMe will not start with Windows.');
      })
      .catch(function () {
        toast('Could not change the auto-start setting.');
      });
  });
}

/* Android: react when the user taps a scheduled notification */
function initNativeNotificationTap() {
  const ln = nativeNotifications();
  if (!ln) return;
  try {
    ln.addListener('localNotificationActionPerformed', function (n) {
      const extra = n && n.notification && n.notification.extra;
      if (!extra || !extra.evId) return;
      const ev = events.find(function (e) { return e.id === extra.evId; });
      if (ev) openDialog('edit', ev.id);
    });
  } catch (err) { /* listener unavailable */ }
}

/* ---------------------------------------------------------
 *  Reminder sound (Android): pick a phone ringtone (native)
 * -------------------------------------------------------*/
function nativeReminderSound() {
  try {
    if (!isNativeApp() || !window.Capacitor || !window.Capacitor.Plugins) return null;
    return window.Capacitor.Plugins.ReminderSound || null;
  } catch (err) {
    return null;
  }
}

function initRingtoneUI() {
  const row = $('#ringtone-row');
  if (!isNativeApp() || !row) return;
  row.hidden = false;
  updateRingtoneStatus();
  const btn = $('#btn-ringtone');
  btn.addEventListener('click', function () {
    const plugin = nativeReminderSound();
    if (!plugin || typeof plugin.pick !== 'function') {
      toast('Ringtone selection is not available here.');
      return;
    }
    plugin.pick().then(function (res) {
      if (res && res.uri) {
        settings.ringtone = { name: res.name || 'Custom sound', uri: res.uri };
        saveSettings();
        updateRingtoneStatus();
        toast('Reminder sound set to: ' + (res.name || 'Custom sound'));
      }
    }).catch(function (err) {
      // cancelled by the user — not an error
      if (err && err.message && err.message.indexOf('cancel') === -1) {
        toast('Could not pick a ringtone.');
      }
    });
  });
}

function updateRingtoneStatus() {
  const statusEl = $('#ringtone-status');
  if (!statusEl) return;
  const r = settings.ringtone;
  statusEl.textContent = r && r.name
    ? 'Reminder sound: ' + r.name + '.'
    : 'Use your phone\u2019s ringtones for reminders.';
}

/* =========================================================
 *  Theme & sound
 * =======================================================*/
function resolveTheme(setting) {
  if (setting === 'light' || setting === 'dark') return setting;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(setting) {
  settings.theme = (setting === 'light' || setting === 'dark' || setting === 'system') ? setting : 'system';
  document.documentElement.dataset.theme = resolveTheme(settings.theme);
  saveSettings();
  updateThemeButton();
}

/* Cycle: Light → Dark → System → Light */
function toggleTheme() {
  const order = ['light', 'dark', 'system'];
  const idx = order.indexOf(settings.theme);
  applyTheme(order[(idx + 1) % order.length]);
}

function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const labels = { light: 'Light theme', dark: 'Dark theme', system: 'System theme' };
  const label = labels[settings.theme] || 'System theme';
  const headerBtn = $('#btn-theme');
  if (headerBtn) {
    headerBtn.setAttribute('aria-pressed', String(dark));
    $('.btn-label', headerBtn).textContent = label;
    $('.icon', headerBtn).innerHTML = iconHTML(dark ? 'sun' : 'moon');
  }
  const settingsBtn = $('#btn-theme-toggle');
  if (settingsBtn) {
    settingsBtn.setAttribute('aria-pressed', String(dark));
    settingsBtn.textContent = label;
  }
  const panelBtn = $('#btn-theme-panel');
  if (panelBtn) {
    panelBtn.setAttribute('aria-pressed', String(dark));
    panelBtn.textContent = label;
  }
}

function toggleSound() {
  settings.sound = !settings.sound;
  saveSettings();
  updateSoundButton();
  toast(settings.sound ? 'Reminder sounds on.' : 'Reminder sounds muted.');
}

function updateSoundButton() {
  const btn = $('#btn-sound');
  if (btn) {
    btn.setAttribute('aria-pressed', String(settings.sound));
    $('.btn-label', btn).textContent = settings.sound ? 'Sound on' : 'Sound muted';
    $('.icon', btn).innerHTML = iconHTML(settings.sound ? 'bell' : 'bellOff');
  }
  const sbtn = $('#btn-sound-toggle');
  if (sbtn) {
    sbtn.setAttribute('aria-pressed', String(settings.sound));
    sbtn.textContent = settings.sound ? 'On' : 'Off';
  }
  const pbtn = $('#btn-sound-panel');
  if (pbtn) {
    pbtn.setAttribute('aria-pressed', String(settings.sound));
    pbtn.textContent = settings.sound ? 'On' : 'Off';
  }
}

/* Gentle three-note chime (Web Audio — no sound files needed).
 * On Android, if the user picked a phone ringtone, play that instead. */
function playChime() {
  if (!settings.sound) return;
  const rs = nativeReminderSound();
  if (rs && settings.ringtone && settings.ringtone.uri && typeof rs.play === 'function') {
    try {
      rs.play();
      return;
    } catch (err) { /* fall back to the chime */ }
  }
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime + 0.02;
    [523.25, 659.25, 783.99].forEach(function (freq, i) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    });
  } catch (err) { /* audio unavailable — reminder still shows */ }
}

/* =========================================================
 *  Rendering
 * =======================================================*/
function filteredEvents() {
  const q = searchQuery.trim().toLowerCase();
  const now = Date.now();
  return events.filter(function (ev) {
    if (currentFilter === 'done' && ev.status !== 'done') return false;
    if (currentFilter === 'pending' && ev.status !== 'pending') return false;
    if (currentFilter === 'overdue') {
      if (ev.status !== 'pending') return false;
      if (new Date(ev.dueISO).getTime() >= now) return false;
    }
    if (q) {
      const hay = (ev.title + ' ' + (ev.notes || '') + ' ' + (CATEGORY_LABELS[ev.category] || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }).sort(function (a, b) {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    if (a.status === 'done') return (b.doneAt || 0) - (a.doneAt || 0);
    return new Date(a.dueISO).getTime() - new Date(b.dueISO).getTime();
  });
}

function renderAll() {
  renderStats();
  renderList();
  updateFilterButtons();
}

function renderStats() {
  const now = new Date();
  let pending = 0, done = 0, dueToday = 0;
  for (const ev of events) {
    if (ev.status === 'pending') {
      pending++;
      const d = new Date(ev.dueISO);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) dueToday++;
    } else {
      done++;
    }
  }
  $('#stat-pending').textContent = String(pending);
  $('#stat-done').textContent = String(done);
  $('#stat-due-today').textContent = String(dueToday);
  document.title = pending ? 'RemindMe (' + pending + ' pending) — Tasks & Reminders' : 'RemindMe — Tasks & Reminders';
}

function emptyMessage() {
  if (events.length === 0) return 'No events yet. Create your first event, or load the sample events to explore.';
  if (searchQuery.trim()) return 'No events match "' + searchQuery.trim() + '".';
  if (currentFilter === 'done') return 'No completed events yet. Finish something and it will show up here.';
  if (currentFilter === 'overdue') return 'Nothing is overdue.';
  return 'No events in this view.';
}

function dueLabel(ev) {
  const diff = new Date(ev.dueISO).getTime() - Date.now();
  if (ev.status === 'done') {
    return ev.doneAt ? 'completed ' + relativeTime(Date.now() - ev.doneAt) + ' ago' : 'completed';
  }
  if (diff < 0) return 'overdue by ' + relativeTime(-diff);
  if (diff < 60000) return 'due now';
  return 'due in ' + relativeTime(diff);
}

function chip(text, cls) {
  const s = document.createElement('span');
  s.className = 'chip ' + cls;
  s.textContent = text;
  return s;
}

function iconBtn(icon, label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn icon-btn-sm';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = iconHTML(icon);
  b.addEventListener('click', onClick);
  return b;
}

function renderCard(ev) {
  const li = document.createElement('li');
  li.className = 'event-card' + (ev.status === 'done' ? ' is-done' : '');
  li.dataset.id = ev.id;

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'event-check';
  check.checked = ev.status === 'done';
  check.setAttribute('aria-label', (ev.status === 'done' ? 'Reopen' : 'Mark as done') + ': ' + ev.title);
  check.addEventListener('change', function () { toggleDone(ev.id); });

  const body = document.createElement('div');
  body.className = 'event-body';

  const title = document.createElement('h3');
  title.className = 'event-title';
  title.textContent = ev.title;

  const due = new Date(ev.dueISO);
  const meta = document.createElement('p');
  meta.className = 'event-meta';
  meta.textContent = fmtDate(due) + ' at ' + fmtTime(due) + ' · ' + dueLabel(ev);

  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'event-chips';
  chipsWrap.appendChild(chip(CATEGORY_LABELS[ev.category] || 'Other', 'chip-cat'));
  const rl = repeatLabel(ev);
  if (rl) chipsWrap.appendChild(chip(rl, 'chip-repeat'));
  if (ev.status === 'pending') {
    const diff = due.getTime() - Date.now();
    if (diff < 0) {
      chipsWrap.appendChild(chip('Overdue', 'chip-danger'));
    } else if (ev.remindBeforeMin != null && !ev.reminded && diff <= ev.remindBeforeMin * 60000) {
      chipsWrap.appendChild(chip('Reminder coming up', 'chip-warn'));
    } else if (ev.reminded) {
      chipsWrap.appendChild(chip('Reminder set', 'chip-success'));
    }
  }
  if (ev.status === 'done') {
    chipsWrap.appendChild(chip('Done', 'chip-success'));
  }

  body.appendChild(title);
  body.appendChild(meta);
  body.appendChild(chipsWrap);

  const actions = document.createElement('div');
  actions.className = 'event-actions';
  const editBtn = iconBtn('pencil', 'Edit ' + ev.title, function () { openDialog('edit', ev.id); });
  const delBtn = iconBtn('trash', 'Delete ' + ev.title, function () { deleteEvent(ev.id); });
  delBtn.classList.add('is-danger');
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  li.appendChild(check);
  li.appendChild(body);
  li.appendChild(actions);
  return li;
}

function renderList() {
  const list = $('#event-list');
  const empty = $('#empty-state');
  const items = filteredEvents();

  list.textContent = '';

  if (!items.length) {
    list.hidden = true;
    empty.hidden = false;
    $('#empty-message').textContent = emptyMessage();
    return;
  }
  empty.hidden = true;
  list.hidden = false;
  for (const ev of items) list.appendChild(renderCard(ev));
}

function updateFilterButtons() {
  $$('.filter-btn').forEach(function (b) {
    const active = b.dataset.filter === currentFilter;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

/* =========================================================
 *  New / Edit event dialog
 * =======================================================*/
function buildRemindSelect(select, selected) {
  const defs = [
    [1440, '1 day before'],
    [120, '2 hours before'],
    [60, '1 hour before'],
    [30, '30 minutes before'],
    [15, '15 minutes before'],
    [5, '5 minutes before'],
    [0, 'At the due time'],
    ['', 'No reminder']
  ];
  select.textContent = '';
  for (const pair of defs) {
    const o = document.createElement('option');
    o.value = String(pair[0]);
    o.textContent = pair[1];
    select.appendChild(o);
  }
  select.value = selected == null ? '' : String(selected);
}

function openDialog(mode, id) {
  const dlg = $('#event-dialog');
  $('#event-form').reset();
  clearFieldErrors();
  editingId = mode === 'edit' ? id : null;
  $('#dialog-title').textContent = mode === 'edit' ? 'Edit event' : 'New event';

  buildRemindSelect($('#f-remind'), editingId ? null : settings.defaultRemind);

  if (editingId) {
    const ev = events.find(function (e) { return e.id === id; });
    if (!ev) return;
    const due = new Date(ev.dueISO);
    $('#f-title').value = ev.title;
    setDateSelects(due);
    setTimeSelects(due);
    $('#f-category').value = ev.category;
    $('#f-remind').value = ev.remindBeforeMin == null ? '' : String(ev.remindBeforeMin);
    $('#f-repeat').value = ev.repeat;
    $('#f-repeat-every').value = String(ev.repeatEvery);
    $('#f-repeat-unit').value = ev.repeatUnit;
    $('#f-notes').value = ev.notes;
  } else {
    // Defaults: today's date and the current time, rounded up to the next
    // 5 minutes so the default is always a valid future time.
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + 5 - (now.getMinutes() % 5));
    setDateSelects(now);
    setTimeSelects(now);
  }

  updateCustomRepeatVisibility();
  formSnapshot = snapshotForm();
  dlg.showModal();
  $('#f-title').focus();
}

/* Show/hide the "Repeat every N units" controls for custom repeats */
function updateCustomRepeatVisibility() {
  const custom = $('#f-repeat').value === 'custom';
  $('#repeat-custom-wrap').hidden = !custom;
  if (custom) $('#f-repeat-every').focus();
}

function snapshotForm() {
  const p = readDateSelects();
  return JSON.stringify([
    $('#f-title').value, p.y, p.mo, p.d, p.h, p.mi,
    $('#f-category').value, $('#f-remind').value, $('#f-repeat').value,
    $('#f-repeat-every').value, $('#f-repeat-unit').value, $('#f-notes').value
  ]);
}

function clearFieldErrors() {
  $$('.field-error').forEach(function (e) { e.hidden = true; e.textContent = ''; });
  $$('.field input, .field textarea, .field select').forEach(function (f) {
    f.removeAttribute('aria-invalid');
    // Restore the hint association (format guidance) once the error is gone
    const hint = document.getElementById(f.id + '-hint');
    if (hint) f.setAttribute('aria-describedby', hint.id);
    else f.removeAttribute('aria-describedby');
  });
}

function showFieldError(id, msg) {
  const field = $('#' + id);
  const err = $('#' + id + '-error');
  if (!field || !err) return;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', id + '-error');
  err.textContent = msg;
  err.hidden = false;
}

function validateAndCollect() {
  clearFieldErrors();
  const title = $('#f-title').value.trim();
  const errors = [];

  if (!title) errors.push(['f-title', 'Please enter a title for the event.']);

  // Date/time come from dropdowns, so they are always well-formed.
  const p = readDateSelects();
  const due = new Date(p.y, p.mo - 1, p.d, p.h, p.mi, 0, 0);
  if (!editingId && due.getTime() <= Date.now()) {
    errors.push(['f-time', 'Please choose a date and time in the future.']);
  }

  const repeat = $('#f-repeat').value;
  let repeatEvery = 1;
  let repeatUnit = 'day';
  if (repeat === 'custom') {
    repeatEvery = parseInt($('#f-repeat-every').value, 10);
    repeatUnit = REPEAT_UNITS[$('#f-repeat-unit').value] ? $('#f-repeat-unit').value : 'day';
    if (!Number.isInteger(repeatEvery) || repeatEvery < 1 || repeatEvery > 3650) {
      errors.push(['f-repeat-every', 'Enter a whole number from 1 to 3650.']);
    }
  }

  for (const e of errors) showFieldError(e[0], e[1]);
  if (errors.length) {
    const first = $('#' + errors[0][0]);
    if (first) first.focus();
    return null;
  }

  return {
    title: title,
    notes: $('#f-notes').value.trim(),
    category: $('#f-category').value,
    remindBeforeMin: $('#f-remind').value === '' ? null : Number($('#f-remind').value),
    repeat: repeat,
    repeatEvery: repeatEvery,
    repeatUnit: repeatUnit,
    due: due
  };
}

function onSubmitForm(e) {
  e.preventDefault();
  const data = validateAndCollect();
  if (!data) return;

  if (editingId) {
    const ev = events.find(function (x) { return x.id === editingId; });
    if (!ev) return;
    ev.title = data.title;
    ev.notes = data.notes;
    ev.category = data.category;
    ev.dueISO = toLocalISO(data.due);
    ev.remindBeforeMin = data.remindBeforeMin;
    ev.repeat = data.repeat;
    ev.repeatEvery = data.repeatEvery;
    ev.repeatUnit = data.repeatUnit;
    ev.reminded = false;
    ev.dueAlertShown = false;
    ev.snoozeUntil = null;
    ev.updatedAt = Date.now();
    toast('Event updated: ' + data.title);
  } else {
    const ev = normalizeEvent({
      id: uid(),
      title: data.title,
      notes: data.notes,
      category: data.category,
      dueISO: toLocalISO(data.due),
      remindBeforeMin: data.remindBeforeMin,
      repeat: data.repeat,
      repeatEvery: data.repeatEvery,
      repeatUnit: data.repeatUnit,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    events.push(ev);
    toast('Event added: ' + data.title);
    maybeAskNotifications();
  }

  saveEvents();
  renderAll();
  $('#event-dialog').close();
}

/* Ask once (after the first event is saved) so the user knows it is optional */
function maybeAskNotifications() {
  if (isDesktopApp()) return; // the desktop app notifies automatically
  const ln = nativeNotifications();
  if (ln) {
    // Android 13+: ask for notification permission once
    if (settings.notificationsRequested) return;
    settings.notificationsRequested = true;
    saveSettings();
    ln.requestPermissions().then(function (res) {
      if (res && res.display === 'granted') toast('Notifications enabled.');
    }).catch(function () { /* ignore */ });
    return;
  }
  if (!('Notification' in window)) return;
  if (settings.notificationsRequested || Notification.permission !== 'default') return;
  settings.notificationsRequested = true;
  saveSettings();
  Notification.requestPermission().then(updateNotificationButton);
}

/* =========================================================
 *  Event actions
 * =======================================================*/
function toggleDone(id) {
  const ev = events.find(function (e) { return e.id === id; });
  if (!ev) return;

  if (ev.status === 'pending') {
    ev.status = 'done';
    ev.doneAt = Date.now();
    ev.snoozeUntil = null;
    ev.updatedAt = Date.now();
    if (ev.repeat !== 'none') scheduleRepeat(ev);
    toast('Completed: ' + ev.title);
  } else {
    if (ev.repeat !== 'none') {
      toast('Repeating events are completed automatically and cannot be reopened.');
      renderAll();
      return;
    }
    ev.status = 'pending';
    ev.doneAt = null;
    ev.reminded = false;
    ev.dueAlertShown = false;
    ev.updatedAt = Date.now();
    toast('Reopened: ' + ev.title);
  }

  saveEvents();
  renderAll();
}

function deleteEvent(id) {
  const ev = events.find(function (e) { return e.id === id; });
  if (!ev) return;
  if (!confirm('Delete "' + ev.title + '"? This cannot be undone.')) return;
  events = events.filter(function (e) { return e.id !== id; });
  saveEvents();
  renderAll();
  toast('Deleted: ' + ev.title);
}

/* Repeating events: schedule the next occurrence after completion */
function scheduleRepeat(ev) {
  const due = new Date(ev.dueISO);
  let next = addPeriod(due, ev.repeat, ev.repeatEvery, ev.repeatUnit);
  const now = Date.now();
  while (next.getTime() <= now) next = addPeriod(next, ev.repeat, ev.repeatEvery, ev.repeatUnit);
  const nxt = normalizeEvent({
    id: uid(),
    title: ev.title,
    notes: ev.notes,
    category: ev.category,
    dueISO: toLocalISO(next),
    remindBeforeMin: ev.remindBeforeMin,
    repeat: ev.repeat,
    repeatEvery: ev.repeatEvery,
    repeatUnit: ev.repeatUnit,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  events.push(nxt);
  toast('Next occurrence scheduled: ' + fmtDate(next) + ' at ' + fmtTime(next));
}

function addPeriod(date, repeat, every, unit) {
  const d = new Date(date);
  const n = Math.max(1, every || 1);
  switch (repeat) {
    case 'daily': d.setDate(d.getDate() + n); break;
    case 'weekly': d.setDate(d.getDate() + 7 * n); break;
    case 'monthly': d.setMonth(d.getMonth() + n); break;
    case 'yearly': d.setFullYear(d.getFullYear() + n); break;
    case 'custom':
      switch (unit) {
        case 'day': d.setDate(d.getDate() + n); break;
        case 'week': d.setDate(d.getDate() + 7 * n); break;
        case 'month': d.setMonth(d.getMonth() + n); break;
        case 'year': d.setFullYear(d.getFullYear() + n); break;
      }
      break;
  }
  return d;
}

/* =========================================================
 *  Reminder engine
 * =======================================================*/
function reminderLeadText(ev) {
  const diff = new Date(ev.dueISO).getTime() - Date.now();
  return diff <= 0 ? 'now' : 'in ' + relativeTime(diff);
}

function queueAlert(ev, title, message) {
  alertQueue.push({ evId: ev.id, title: title, message: message });
}

function checkReminders() {
  // Desktop (Electron): the main process owns reminders while the window is
  // hidden/minimized/closed. Android (Capacitor): notifications are scheduled
  // with the OS. Either way, the renderer engine only runs when visible, so
  // OS notifications and in-app alerts never double up.
  if ((isDesktopApp() || isNativeApp()) && document.visibilityState !== 'visible') return;

  const now = Date.now();
  let changed = false;

  for (const ev of events) {
    if (ev.status !== 'pending') continue;
    const due = new Date(ev.dueISO).getTime();

    // Snoozed event?
    if (ev.snoozeUntil) {
      if (now < ev.snoozeUntil) continue;
      ev.snoozeUntil = null;
      changed = true;
      if (now < due) {
        queueAlert(ev, 'Reminder (snoozed)', '"' + ev.title + '" is due ' + reminderLeadText(ev) + '.');
        continue;
      }
      // otherwise fall through: it is due right now
    }

    // Due (or past due) → alert + mark done automatically
    if (now >= due) {
      if (!ev.dueAlertShown) {
        ev.dueAlertShown = true;
        ev.status = 'done';
        ev.doneAt = now;
        ev.updatedAt = now;
        changed = true;
        queueAlert(ev, 'Event due', '"' + ev.title + '" is due now. It has been marked as done.');
        if (ev.repeat !== 'none') scheduleRepeat(ev);
      }
      continue;
    }

    // Advance reminder
    if (ev.remindBeforeMin != null && !ev.reminded) {
      const leadMs = ev.remindBeforeMin * 60000;
      if (now >= due - leadMs) {
        ev.reminded = true;
        ev.updatedAt = now;
        changed = true;
        queueAlert(ev, 'Reminder', '"' + ev.title + '" is due ' + reminderLeadText(ev) + '.');
      }
    }
  }

  if (changed) {
    saveEvents();
    renderAll();
  }
  processAlertQueue();
}

/* Show alerts one at a time; if the window is hidden, use a system notification */
function processAlertQueue() {
  if (alertBusy || !alertQueue.length) return;
  const item = alertQueue.shift();
  const ev = events.find(function (e) { return e.id === item.evId; });
  if (!ev) { processAlertQueue(); return; }

  if (document.visibilityState === 'visible') {
    showAlertDialog(item, ev);
  } else {
    sendSystemNotification(item, ev);
    pendingAcks.push(item);
    processAlertQueue();
  }
}

function showAlertDialog(item, ev) {
  alertBusy = true;
  currentAlertItem = item;
  const dlg = $('#alert-dialog');
  $('#alert-title').textContent = item.title;
  $('#alert-message').textContent = item.message;
  const due = new Date(ev.dueISO);
  $('#alert-meta').textContent = fmtDate(due) + ' at ' + fmtTime(due) + ' · ' + (CATEGORY_LABELS[ev.category] || 'Other');
  playChime();
  dlg.showModal();
  $('#alert-gotit').focus();
}

function snoozeAlert(minutes) {
  const item = currentAlertItem;
  if (item) {
    const ev = events.find(function (e) { return e.id === item.evId; });
    if (ev && ev.status === 'pending') {
      ev.snoozeUntil = Date.now() + minutes * 60000;
      ev.updatedAt = Date.now();
      saveEvents();
    }
    toast('Snoozed for ' + minutes + ' minutes.');
  }
  $('#alert-dialog').close();
}

/* =========================================================
 *  System notifications
 * =======================================================*/
async function requestNotificationPermission() {
  if (isDesktopApp()) {
    toast('Notifications are handled by the desktop app automatically.');
    return true;
  }
  const ln = nativeNotifications();
  if (ln) {
    try {
      const res = await ln.requestPermissions();
      const granted = res && res.display === 'granted';
      toast(granted ? 'Notifications enabled.' : 'Notifications are off. In-app alerts will still appear.');
      return granted;
    } catch (err) {
      toast('Could not request notification permission.');
      return false;
    }
  }
  if (!('Notification' in window)) {
    toast('System notifications are not supported in this browser.');
    return false;
  }
  if (Notification.permission === 'granted') {
    toast('System notifications are already enabled.');
    updateNotificationButton();
    return true;
  }
  const perm = await Notification.requestPermission();
  settings.notificationsRequested = true;
  saveSettings();
  updateNotificationButton();
  toast(perm === 'granted' ? 'System notifications enabled.' : 'System notifications are off. In-app alerts will still appear.');
  return perm === 'granted';
}

function updateNotificationButton() {
  const btn = $('#btn-notifications');
  const statusEl = $('#notif-status');
  const enableBtn = $('#btn-notif-enable');

  if (isDesktopApp()) {
    if (btn) {
      btn.disabled = true;
      $('.btn-label', btn).textContent = 'Desktop notifications';
    }
    if (statusEl) statusEl.textContent = 'Handled by the desktop app — reminders appear as Windows notifications even when the app window is closed.';
    if (enableBtn) {
      enableBtn.disabled = true;
      enableBtn.textContent = 'Handled by app';
    }
    return;
  }

  if (isNativeApp()) {
    if (btn) {
      btn.disabled = true;
      $('.btn-label', btn).textContent = 'Android notifications';
    }
    if (statusEl) statusEl.textContent = 'Scheduled with Android — reminders appear even when the app is closed.';
    if (enableBtn) {
      enableBtn.disabled = true;
      enableBtn.textContent = 'Handled by system';
    }
    return;
  }

  if (!('Notification' in window)) {
    if (btn) {
      btn.disabled = true;
      $('.btn-label', btn).textContent = 'Notifications unsupported';
    }
    if (statusEl) statusEl.textContent = 'System notifications are not supported in this browser.';
    return;
  }

  const granted = Notification.permission === 'granted';
  if (btn) {
    $('.btn-label', btn).textContent = granted ? 'Notifications on' : 'Enable notifications';
    $('.icon', btn).innerHTML = iconHTML(granted ? 'bellRing' : 'bell');
  }
  if (statusEl) {
    statusEl.textContent = granted
      ? 'System notifications are enabled — you will get alerts even when this window is in the background.'
      : 'System notifications are off. You will still see in-app alerts while the app is open.';
  }
  if (enableBtn) {
    enableBtn.disabled = granted;
    enableBtn.textContent = granted ? 'Enabled' : 'Enable';
  }
}

function sendSystemNotification(item, ev) {
  if (isDesktopApp() || isNativeApp()) return; // the OS owns notifications on desktop & Android
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const due = new Date(ev.dueISO);
    new Notification(item.title, {
      body: item.message + ' ' + fmtDate(due) + ' at ' + fmtTime(due) + ' — ' + (CATEGORY_LABELS[ev.category] || 'Other'),
      icon: 'assets/app-icon.svg',
      tag: 'remindme-' + ev.id
    });
  } catch (err) { /* notification failed silently */ }
}

/* =========================================================
 *  Data management (export / import / samples / clear)
 * =======================================================*/
function exportJSON() {
  const data = {
    app: 'RemindMe',
    version: 1,
    exportedAt: new Date().toISOString(),
    events: events
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'remindme-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  toast('Backup exported.');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const data = JSON.parse(String(reader.result));
      const arr = Array.isArray(data) ? data : (data && Array.isArray(data.events) ? data.events : null);
      if (!arr) throw new Error('Invalid file');
      const normalized = arr.map(normalizeEvent).filter(Boolean);
      if (!normalized.length) {
        toast('No valid events found in that file.');
        return;
      }
      if (events.length && !confirm('Replace your ' + events.length + ' current event(s) with ' + normalized.length + ' from the file?')) return;
      events = normalized;
      saveEvents();
      renderAll();
      toast('Imported ' + normalized.length + ' event(s).');
    } catch (err) {
      toast('Import failed: not a valid RemindMe backup file.');
    }
  };
  reader.readAsText(file);
}

function loadSamples() {
  if (events.length && !confirm('Replace your current events with the sample set?')) return;
  const now = new Date();
  const at = function (days, h, m) {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const samples = [
    { title: 'Renew internet data', notes: 'Top up before it expires so we don\u2019t lose connection.', category: 'finance', due: at(2, 18, 0), remindBeforeMin: 1440, repeat: 'custom', repeatEvery: 30, repeatUnit: 'day' },
    { title: 'Dentist appointment', notes: 'Bring your insurance card.', category: 'health', due: at(1, 14, 30), remindBeforeMin: 120, repeat: 'none' },
    { title: 'Pay electricity bill', notes: '', category: 'finance', due: at(5, 12, 0), remindBeforeMin: 1440, repeat: 'monthly' }
  ];
  events = samples.map(function (s) {
    return normalizeEvent({
      id: uid(),
      title: s.title,
      notes: s.notes,
      category: s.category,
      dueISO: toLocalISO(s.due),
      remindBeforeMin: s.remindBeforeMin,
      repeat: s.repeat,
      repeatEvery: s.repeatEvery || 1,
      repeatUnit: s.repeatUnit || 'day',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });
  saveEvents();
  renderAll();
  toast('Sample events loaded. Edit or delete them any time.');
}

function clearCompleted() {
  const doneCount = events.filter(function (e) { return e.status === 'done'; }).length;
  if (!doneCount) {
    toast('There are no completed events to clear.');
    return;
  }
  if (!confirm('Remove ' + doneCount + ' completed event(s)?')) return;
  events = events.filter(function (e) { return e.status !== 'done'; });
  saveEvents();
  renderAll();
  toast('Cleared ' + doneCount + ' completed event(s).');
}

/* =========================================================
 *  Toasts
 * =======================================================*/
function toast(msg) {
  const region = $('#toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  region.appendChild(el);
  // Announce only the newest toast to avoid screen-reader chatter
  $$('.toast', region).forEach(function (t, i) {
    if (t !== el) t.setAttribute('aria-hidden', 'true');
  });
  requestAnimationFrame(function () { el.classList.add('show'); });
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { el.remove(); }, 300);
  }, 5000);
}

/* =========================================================
 *  Events & init
 * =======================================================*/
function onKeydown(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'n') {
    e.preventDefault();
    openDialog('new');
  } else if (key === '/') {
    e.preventDefault();
    $('#search').focus();
  }
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (pendingAcks.length) {
    alertQueue.unshift.apply(alertQueue, pendingAcks);
    pendingAcks = [];
  }
  processAlertQueue();
  checkReminders();
}

function bindEvents() {
  $('#btn-new').addEventListener('click', function () { openDialog('new'); });
  $('#btn-samples').addEventListener('click', loadSamples);
  $('#btn-samples-empty').addEventListener('click', loadSamples);
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-theme-toggle').addEventListener('click', toggleTheme);
  $('#btn-theme-panel').addEventListener('click', toggleTheme);
  $('#btn-sound').addEventListener('click', toggleSound);
  $('#btn-sound-toggle').addEventListener('click', toggleSound);
  $('#btn-sound-panel').addEventListener('click', toggleSound);
  $('#btn-notifications').addEventListener('click', requestNotificationPermission);
  $('#btn-settings').addEventListener('click', function () { $('#settings-dialog').showModal(); });

  // Customize panel (top menu)
  const menuBtn = $('#btn-menu');
  const panel = $('#customize-panel');
  function setPanel(open) {
    panel.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(!!open));
    if (open) menuBtn.setAttribute('aria-pressed', 'true');
    else menuBtn.removeAttribute('aria-pressed');
  }
  menuBtn.addEventListener('click', function () {
    setPanel(panel.hidden);
  });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !panel.contains(e.target) && !menuBtn.contains(e.target)) setPanel(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) setPanel(false);
  });

  $('#event-form').addEventListener('submit', onSubmitForm);
  $('#f-repeat').addEventListener('change', updateCustomRepeatVisibility);

  $$('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () {
      const d = b.closest('dialog');
      if (d) d.close();
    });
  });

  // Warn before discarding an edited form via Esc / backdrop
  $('#event-dialog').addEventListener('cancel', function (e) {
    if (snapshotForm() !== formSnapshot && !confirm('Discard the changes you made to this event?')) {
      e.preventDefault();
    }
  });

  $('#search').addEventListener('input', function (e) {
    searchQuery = e.target.value;
    renderList();
  });

  $$('.filter-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      currentFilter = b.dataset.filter;
      updateFilterButtons();
      renderList();
    });
  });

  // Reminder alert dialog
  $('#alert-gotit').addEventListener('click', function () { $('#alert-dialog').close(); });
  $('#alert-snooze5').addEventListener('click', function () { snoozeAlert(5); });
  $('#alert-snooze15').addEventListener('click', function () { snoozeAlert(15); });
  $('#alert-snooze60').addEventListener('click', function () { snoozeAlert(60); });
  $('#alert-dialog').addEventListener('close', function () {
    alertBusy = false;
    currentAlertItem = null;
    processAlertQueue();
  });
  $('#alert-dialog').addEventListener('click', function (e) {
    if (e.target === $('#alert-dialog')) $('#alert-dialog').close();
  });

  // Settings
  $('#btn-notif-enable').addEventListener('click', requestNotificationPermission);
  $('#btn-sound-toggle').addEventListener('click', toggleSound);
  $('#set-default-remind').addEventListener('change', function (e) {
    settings.defaultRemind = e.target.value === '' ? null : Number(e.target.value);
    saveSettings();
    toast('Default reminder updated.');
  });
  $('#btn-export').addEventListener('click', exportJSON);
  $('#btn-import').addEventListener('click', function () { $('#import-file').click(); });
  $('#import-file').addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  $('#btn-clear-done').addEventListener('click', clearCompleted);

  document.addEventListener('keydown', onKeydown);

  // Keep multiple tabs in sync
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_EVENTS) {
      events = loadEvents();
      renderAll();
      syncToPlatform();
    }
  });

  // Desktop app: clicking a system notification opens that event for editing
  if (isDesktopApp() && typeof window.remindme.onOpenEvent === 'function') {
    window.remindme.onOpenEvent(function (id) {
      const ev = events.find(function (e) { return e.id === id; });
      if (ev) openDialog('edit', id);
    });
  }

  // Android: react to system theme changes when set to "System"
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (settings.theme === 'system') applyTheme('system');
    });
  }

  window.addEventListener('focus', checkReminders);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function init() {
  events = loadEvents();
  settings = Object.assign(defaultSettings(), loadSettings());

  // Normalize the theme setting and re-apply (the <head> script already
  // applied a resolved theme before paint).
  if (['light', 'dark', 'system'].indexOf(settings.theme) === -1) settings.theme = 'system';
  applyTheme(settings.theme);

  buildRemindSelect($('#set-default-remind'), settings.defaultRemind);
  buildDateSelects();
  buildTimeSelects();
  updateSoundButton();
  updateNotificationButton();
  initAutoStartUI();
  initNativeNotificationTap();
  initRingtoneUI();
  bindEvents();
  renderAll();
  syncToPlatform();
  checkReminders();

  setInterval(checkReminders, CHECK_INTERVAL_MS);

  // Refresh relative times ("due in 2 hours") while visible, without disturbing focus
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    if (document.querySelector('dialog[open]')) return;
    if ($('#event-list').contains(document.activeElement)) return;
    renderList();
  }, REFRESH_RELATIVE_MS);
}

document.addEventListener('DOMContentLoaded', init);
