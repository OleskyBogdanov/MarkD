import { BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';

const isTrustedOrigin = (originUrl: string): boolean => {
  if (!originUrl) {
    return false;
  }

  try {
    const parsed = new URL(originUrl);
    const configuredDevUrl = process.env['VITE_DEV_SERVER_URL'];
    const isConfiguredDevOrigin = configuredDevUrl
      ? parsed.origin === new URL(configuredDevUrl).origin
      : false;
    const isProdAppScheme = parsed.protocol === 'app:' && parsed.host === 'local';
    return isConfiguredDevOrigin || isProdAppScheme;
  } catch {
    return false;
  }
};

export const assertRendererOrigin = (event: IpcMainEvent | IpcMainInvokeEvent): void => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error('Недостаточно прав для доступа к IPC: не найдено окно.');
  }

  const windowUrl = window.webContents.getURL();
  if (!isTrustedOrigin(windowUrl)) {
    throw new Error('Недостаточно прав для доступа к IPC: недоверенный источник.');
  }

  if (event.senderFrame && event.senderFrame.url !== window.webContents.mainFrame.url) {
    throw new Error('Недостаточно прав для доступа к IPC: вызов только из главного фрейма.');
  }
};

export const registerIpcChannel = (): void => {
  // centralized IPC registration hook (kept as explicit entry point for extension/monitoring).
};
