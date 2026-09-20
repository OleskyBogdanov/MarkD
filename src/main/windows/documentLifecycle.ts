import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { IPC_CHANNEL } from '../../shared/ipc-channels.js';
import { assertRendererOrigin } from '../ipc/ipcRegistry.js';

const approved = new WeakSet<BrowserWindow>();
const requests = new Map<number, { id: string; acknowledge: () => void; finish: (allow: boolean) => void }>();
let quitting = false;

export const requestDocumentClose = (window: BrowserWindow): Promise<boolean> => {
  if (requests.has(window.id)) return Promise.resolve(false);
  return new Promise(resolve => {
    const id = randomUUID();
    let finished = false;
    const finish = (allow: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      requests.delete(window.id);
      resolve(allow);
    };
    const timeout = setTimeout(() => {
      if (window.isDestroyed()) { finish(false); return; }
      void dialog.showMessageBox(window, {
        type: 'warning', buttons: ['Закрыть', 'Отмена'], defaultId: 1, cancelId: 1,
        message: 'Редактор не отвечает',
        detail: 'Последние изменения могут быть потеряны. При следующем запуске будет предложен последний доступный черновик.'
      }).then(result => finish(result.response === 0), () => finish(false));
    }, 30_000);
    requests.set(window.id, { id, finish, acknowledge: () => clearTimeout(timeout) });
    window.webContents.send(IPC_CHANNEL.REQUEST_CLOSE, { id });
  });
};

export const approveDocumentClose = (window: BrowserWindow): void => { approved.add(window); };
export const resumeDocument = (window: BrowserWindow): void => {
  approved.delete(window);
  window.webContents.send(IPC_CHANNEL.CLOSE_CANCELLED);
};

export const guardDocumentWindow = (window: BrowserWindow): void => {
  window.on('close', event => {
    if (approved.has(window)) return;
    event.preventDefault();
    void requestDocumentClose(window).then(allow => {
      if (!allow || window.isDestroyed()) return;
      approved.add(window);
      window.close();
    });
  });
  window.on('closed', () => requests.get(window.id)?.finish(false));
};

export const registerDocumentLifecycle = (): void => {
  ipcMain.on(IPC_CHANNEL.CLOSE_ACK, (event, id: unknown) => {
    assertRendererOrigin(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    const request = window ? requests.get(window.id) : undefined;
    if (request && request.id === id) request.acknowledge();
  });
  ipcMain.on(IPC_CHANNEL.CLOSE_RESPONSE, (event, payload: unknown) => {
    assertRendererOrigin(event);
    if (!payload || typeof payload !== 'object' || !('id' in payload) || !('allow' in payload) || typeof payload.allow !== 'boolean') return;
    const window = BrowserWindow.fromWebContents(event.sender);
    const request = window ? requests.get(window.id) : undefined;
    if (request && request.id === payload.id) request.finish(payload.allow);
  });
  app.on('before-quit', event => {
    if (quitting) return;
    const window = BrowserWindow.getAllWindows()[0];
    if (!window || approved.has(window)) return;
    event.preventDefault();
    void requestDocumentClose(window).then(allow => {
      if (!allow || window.isDestroyed()) return;
      quitting = true;
      approved.add(window);
      app.quit();
    });
  });
};
