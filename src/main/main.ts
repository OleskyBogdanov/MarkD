import { app, BrowserWindow, Menu, MenuItemConstructorOptions, protocol, session, shell } from 'electron';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSecureWindow } from './windows/createWindow.js';
import { IPC_CHANNEL } from '../shared/ipc-channels.js';
import { openProjectFromPath, registerIpcHandlers } from './ipc/ipcHandlers.js';
import { isProjectFile } from './storage/projectFileService.js';
import { ensureMarkdDirectories } from './storage/markdPaths.js';
import { getLogsDirectory, initializeLogger, writeLog } from './logging/appLogger.js';
import { installProcessLogging, installWindowLogging } from './logging/installCrashHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env['NODE_ENV'] === 'development';
const scheme = 'app';
const host = 'local';
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const isHeadlessTest = process.env['MARKD_E2E_HEADLESS'] === '1';
const pendingProjectPaths: string[] = [];
app.setName('MarkD');
app.setPath('userData', process.env['MARKD_USER_DATA_DIR'] ?? join(app.getPath('appData'), 'MarkD'));
const markdPaths = ensureMarkdDirectories();
initializeLogger(markdPaths.logs);
installProcessLogging();
writeLog('info', 'app.starting');

protocol.registerSchemesAsPrivileged([
  {
    scheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function getRendererUrl(): string {
  if (isDev && VITE_DEV_SERVER_URL) {
    return VITE_DEV_SERVER_URL;
  }
  return `${scheme}://${host}/index.html`;
}

function getMime(ext?: string): string {
  switch (ext) {
    case 'html':
      return 'text/html; charset=utf-8';
    case 'js':
      return 'text/javascript';
    case 'css':
      return 'text/css';
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'ttf':
      return 'font/ttf';
    case 'woff2':
      return 'font/woff2';
    default:
      return 'text/plain';
  }
}

function setupProtocol(): void {
  protocol.handle(scheme, async (request) => {
    const requestUrl = new URL(request.url);
    const decoded = decodeURIComponent(requestUrl.pathname);
    const normalized = decoded.replace(/^\/+/, '') || 'index.html';

    if (requestUrl.host !== host || normalized.includes('..')) {
      return new Response('Bad request', { status: 400 });
    }

    const baseDir = resolve(__dirname, '../../renderer');
    const filePath = resolve(baseDir, normalized);
    const relativePath = relative(baseDir, filePath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      return new Response('Bad request', { status: 400 });
    }

    try {
      const fileBuffer = readFileSync(filePath);
      const ext = filePath.split('.').pop();
      const headers = { 'Content-Type': getMime(ext) };
      return new Response(fileBuffer, { headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function configureSecurity(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}

function configureMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Файл',
      submenu: [
        { role: 'close' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Команда',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выбрать всё' },
        { type: 'separator' },
        {
          label: 'Новый документ',
          accelerator: 'CmdOrCtrl+N',
          click: (_, baseWindow) => {
            if (baseWindow && baseWindow instanceof BrowserWindow) {
              baseWindow.webContents.send(IPC_CHANNEL.MENU_CMD, { command: 'new-document' });
            }
          }
        },
        {
          label: 'Открыть',
          accelerator: 'CmdOrCtrl+O',
          click: (_, baseWindow) => {
            if (baseWindow && baseWindow instanceof BrowserWindow) {
              baseWindow.webContents.send(IPC_CHANNEL.MENU_CMD, { command: 'open' });
            }
          }
        },
        {
          label: 'Сохранить',
          accelerator: 'CmdOrCtrl+S',
          click: (_, baseWindow) => {
            if (baseWindow && baseWindow instanceof BrowserWindow) {
              baseWindow.webContents.send(IPC_CHANNEL.MENU_CMD, { command: 'save' });
            }
          }
        },
        {
          label: 'Экспорт PDF',
          accelerator: 'CmdOrCtrl+E',
          click: (_, baseWindow) => {
            if (baseWindow && baseWindow instanceof BrowserWindow) {
              baseWindow.webContents.send(IPC_CHANNEL.MENU_CMD, { command: 'export-pdf' });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Удалить',
          accelerator: 'Backspace',
          click: (_, baseWindow) => {
            if (baseWindow && baseWindow instanceof BrowserWindow) {
              baseWindow.webContents.send(IPC_CHANNEL.MENU_CMD, { command: 'delete' });
            }
          }
        }
      ]
    },
    {
      label: 'Помощь',
      submenu: [
        {
          label: 'Показать папку с журналами',
          click: () => {
            const logsDirectory = getLogsDirectory() ?? markdPaths.logs;
            void shell.openPath(logsDirectory).then((message) => {
              if (message) writeLog('error', 'logs.open-failed', message, { path: logsDirectory });
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): BrowserWindow {
  const window = createSecureWindow();
  installWindowLogging(window);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const allowed = isDev && VITE_DEV_SERVER_URL ? VITE_DEV_SERVER_URL : `${scheme}://${host}/`;
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(allowed)) {
      event.preventDefault();
    }
  });

  window.webContents.on('did-stop-loading', () => flushPendingProjectPaths(window));

  void window.loadURL(getRendererUrl()).catch((error: unknown) => {
    writeLog('error', 'renderer.load-url-failed', error, { url: getRendererUrl() });
    console.error('Не удалось загрузить интерфейс редактора:', error);
  });
  return window;
}

const findProjectPath = (args: readonly string[], workingDirectory = process.cwd()): string | null => {
  const candidate = args.find((argument) => !argument.startsWith('-') && isProjectFile(argument));
  if (!candidate) return null;
  return isAbsolute(candidate) ? candidate : resolve(workingDirectory, candidate);
};

const enqueueProjectPath = (filePath: string): void => {
  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(filePath);
  if (!isProjectFile(resolvedPath) || pendingProjectPaths.includes(resolvedPath)) return;
  pendingProjectPaths.push(resolvedPath);
};

function flushPendingProjectPaths(window = BrowserWindow.getAllWindows()[0]): void {
  if (!window || window.isDestroyed() || window.webContents.isLoading()) {
    writeLog('info', 'project.open-from-os-deferred', undefined, {
      hasWindow: Boolean(window),
      isLoading: window && !window.isDestroyed() ? window.webContents.isLoading() : undefined,
      pendingCount: pendingProjectPaths.length
    });
    return;
  }
  while (pendingProjectPaths.length > 0) {
    const filePath = pendingProjectPaths.shift();
    if (!filePath) continue;
    try {
      window.webContents.send(IPC_CHANNEL.OPEN_PROJECT_FROM_OS, openProjectFromPath(filePath));
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    } catch (error) {
      writeLog('error', 'project.open-from-os-failed', error, { path: filePath });
    }
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  const initialProjectPath = findProjectPath(process.argv);
  if (initialProjectPath) enqueueProjectPath(initialProjectPath);

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    enqueueProjectPath(filePath);
    flushPendingProjectPaths();
  });

  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    const filePath = findProjectPath(commandLine, workingDirectory);
    if (filePath) enqueueProjectPath(filePath);
    flushPendingProjectPaths();
  });
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  if (isHeadlessTest && process.platform === 'darwin') app.dock?.hide();
  if (!isDev) {
    setupProtocol();
  }

  configureSecurity();
  configureMenu();
  registerIpcHandlers();
  createWindow();
  writeLog('info', 'app.ready');
}).catch((error: unknown) => {
  writeLog('fatal', 'app.ready-failed', error);
  throw error;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
