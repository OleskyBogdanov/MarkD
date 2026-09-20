import { app, BrowserWindow, ipcMain } from 'electron';
import updater from 'electron-updater';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { IPC_CHANNEL, type UpdateState } from '../../shared/ipc-channels.js';
import { assertRendererOrigin } from '../ipc/ipcRegistry.js';
import { approveDocumentClose, requestDocumentClose, resumeDocument } from '../windows/documentLifecycle.js';
import { writeLog } from '../logging/appLogger.js';
import { UpdateController } from './updateController.js';
import { parseReleaseFeed } from './releaseFeed.js';

const { autoUpdater } = updater;
let controller: UpdateController;
export const checkForUpdates = (): void => { void controller?.run('check'); };
export const registerUpdates = (): void => {
  // Only signed release builds contain this build-time configuration.
  let feed: ReturnType<typeof parseReleaseFeed> | null = null;
  if (app.isPackaged) {
    try {
      feed = parseReleaseFeed(JSON.parse(readFileSync(join(process.resourcesPath, 'markd-release.json'), 'utf8')), process.platform, process.arch);
    } catch { /* Local packages have no update feed. */ }
  }
  let preparedWindow: BrowserWindow | undefined;
  controller = new UpdateController(app.getVersion(), Boolean(feed), {
    check: () => autoUpdater.checkForUpdates(),
    download: () => autoUpdater.downloadUpdate(),
    prepare: async () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window || !await requestDocumentClose(window) || window.isDestroyed()) return false;
      preparedWindow = window;
      approveDocumentClose(window);
      return true;
    },
    install: () => autoUpdater.quitAndInstall(false, true),
    resume: () => { if (preparedWindow && !preparedWindow.isDestroyed()) resumeDocument(preparedWindow); },
    publish: (state: UpdateState) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(IPC_CHANNEL.UPDATE_STATE, state);
      writeLog(state.status === 'error' ? 'error' : 'info', `update.${state.status}`, state.message ?? state.version ?? '');
    }
  });
  ipcMain.handle(IPC_CHANNEL.UPDATE_GET, event => { assertRendererOrigin(event); return controller.state; });
  ipcMain.handle(IPC_CHANNEL.UPDATE_ACTION, async (event, payload: unknown) => {
    assertRendererOrigin(event);
    await controller.run(z.enum(['check', 'download', 'install']).parse(payload));
    return controller.state;
  });
  if (!feed) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.setFeedURL(feed);
  autoUpdater.logger = {
    info: message => writeLog('info', 'update.log', message),
    warn: message => writeLog('warn', 'update.log', message),
    error: message => writeLog('error', 'update.log', message)
  };
  autoUpdater.on('error', error => controller.fail(error));
  autoUpdater.on('update-not-available', () => controller.set({ status: 'idle', message: 'Установлена актуальная версия.' }));
  autoUpdater.on('update-available', info => {
    const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes?.map(note => note.note).join('\n');
    controller.set({ status: 'available', version: info.version, notes });
  });
  autoUpdater.on('download-progress', progress => controller.set({ status: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', info => controller.set({ status: 'downloaded', version: info.version, percent: 100 }));
  const initial = setTimeout(checkForUpdates, 15_000);
  const interval = setInterval(checkForUpdates, 6 * 60 * 60 * 1_000);
  app.on('will-quit', () => { clearTimeout(initial); clearInterval(interval); });
};
