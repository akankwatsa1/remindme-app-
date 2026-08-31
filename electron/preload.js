/* RemindMe — preload bridge (runs in an isolated context).
 * Exposes only a tiny, safe API to the renderer:
 *   window.remindme.isDesktop     — true when running as a desktop app
 *   window.remindme.sendEvents()  — renderer → main: current events/settings
 *   window.remindme.onOpenEvent() — main → renderer: user clicked a notification
 *   window.remindme.getAutoStart()/setAutoStart() — "start with Windows" toggle
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('remindme', {
  isDesktop: true,

  sendEvents: function (payload) {
    ipcRenderer.send('remindme:events', payload);
  },

  onOpenEvent: function (callback) {
    ipcRenderer.on('remindme:open-event', function (_event, id) {
      callback(id);
    });
  },

  getAutoStart: function () {
    return ipcRenderer.invoke('remindme:get-login');
  },

  setAutoStart: function (enabled) {
    return ipcRenderer.invoke('remindme:set-login', enabled);
  }
});
