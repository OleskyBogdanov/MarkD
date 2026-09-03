import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

export const createSecureWindow = (): BrowserWindow => {
  const preloadPath = join(app.getAppPath(), 'dist', 'preload', 'preload.cjs');
  const windowIconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const isHeadlessTest = process.env['MARKD_E2E_HEADLESS'] === '1';

  const window = new BrowserWindow({
    show: !isHeadlessTest,
    icon: windowIconPath,
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
      backgroundThrottling: !isHeadlessTest
    }
  });

  return window;
};
