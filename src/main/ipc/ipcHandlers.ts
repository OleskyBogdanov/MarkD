import { app, BrowserWindow, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { z } from 'zod';
import { IPC_CHANNEL, type RecentProjectSummary, type SaveProjectArgs } from '../../shared/ipc-channels.js';
import { migrateProject, projectSchema, serializeProject } from '../../shared/projectSchema.js';
import { assertRendererOrigin, registerIpcChannel } from './ipcRegistry.js';
import { defaultPdfPath, defaultProjectPath, ensureMarkdDirectories } from '../storage/markdPaths.js';
import { writeLog } from '../logging/appLogger.js';

const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PDF_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_BYTES = Math.ceil(MAX_IMAGE_BYTES * 1.45);

const importImageResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  dataUrl: z.string().max(MAX_IMAGE_DATA_URL_BYTES)
});

const rendererErrorSchema = z.object({
  event: z.enum(['window.error', 'unhandledrejection', 'react.error-boundary']),
  message: z.string().max(2_000),
  stack: z.string().max(12_000).optional()
});

type RecentProjectEntry = { id: string; path: string; lastOpenedAt: string };

const recentProjectEntrySchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1),
  lastOpenedAt: z.string().datetime()
});

const recentProjectListSchema = z.array(recentProjectEntrySchema).max(100);
let recentProjects: RecentProjectEntry[] | null = null;

const isProjectFile = (filePath: string): boolean => {
  const extension = extname(filePath).toLowerCase();
  return extension === '.markd' || extension === '.kpdoc';
};

const recentProjectsPath = (): string => join(ensureMarkdDirectories().root, 'recent-projects.json');

const loadRecentProjects = (): RecentProjectEntry[] => {
  if (recentProjects) return recentProjects;
  try {
    const parsed = JSON.parse(readFileSync(recentProjectsPath(), 'utf8')) as unknown;
    recentProjects = recentProjectListSchema.parse(parsed);
  } catch {
    recentProjects = [];
  }
  return recentProjects;
};

const persistRecentProjects = (): void => {
  const entries = loadRecentProjects().slice(0, 20);
  const targetPath = recentProjectsPath();
  const tempPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(entries, null, 2), 'utf8');
    renameSync(tempPath, targetPath);
  } catch (error) {
    try { unlinkSync(tempPath); } catch { /* временный файл мог не создаться */ }
    writeLog('warn', 'recent-projects.persist-failed', error);
  }
};

const discoverProjectFiles = (): void => {
  const entries = loadRecentProjects();
  const knownPaths = new Set(entries.map((entry) => entry.path));
  const appDataRoot = app.getPath('appData');
  const projectDirectories = [
    ensureMarkdDirectories().projects,
    join(appDataRoot, 'KP Редактор', 'projects'),
    join(appDataRoot, 'kp-editor-macos', 'projects')
  ];

  for (const directory of new Set(projectDirectories)) {
    if (!existsSync(directory)) continue;
    try {
      for (const name of readdirSync(directory)) {
        const filePath = join(directory, name);
        if (!isProjectFile(filePath) || knownPaths.has(filePath)) continue;
        const stats = statSync(filePath);
        if (!stats.isFile()) continue;
        entries.push({ id: randomUUID(), path: filePath, lastOpenedAt: stats.mtime.toISOString() });
        knownPaths.add(filePath);
      }
    } catch (error) {
      writeLog('warn', 'recent-projects.scan-failed', error, { path: directory });
    }
  }
};

const getRecentProjectSummaries = (): RecentProjectSummary[] => {
  discoverProjectFiles();
  const entries = loadRecentProjects().filter((entry) => existsSync(entry.path) && isProjectFile(entry.path));
  entries.sort((first, second) => second.lastOpenedAt.localeCompare(first.lastOpenedAt));
  recentProjects = entries.slice(0, 20);
  persistRecentProjects();

  return recentProjects.map((entry) => {
    const extension = extname(entry.path);
    let modifiedAt = entry.lastOpenedAt;
    try { modifiedAt = statSync(entry.path).mtime.toISOString(); } catch { /* файл уже отфильтрован */ }
    return {
      id: entry.id,
      displayName: basename(entry.path, extension),
      fileName: basename(entry.path),
      path: entry.path,
      modifiedAt,
      legacyFormat: extension.toLowerCase() === '.kpdoc'
    };
  });
};

const withMainWindowFromEvent = (_event: IpcMainInvokeEvent | IpcMainEvent): BrowserWindow => {
  assertRendererOrigin(_event);

  const window = BrowserWindow.fromWebContents(_event.sender);
  if (!window) {
    throw new Error('Нет активного окна приложения.');
  }

  return window;
};

const ensureSafeProjectSnapshot = (snapshot: string): string => {
  if (typeof snapshot !== 'string') {
    throw new Error('Неверный тип проекта.');
  }
  if (snapshot.length > MAX_PROJECT_BYTES) {
    throw new Error('Слишком большой проектный снимок.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    throw new Error('Неверный JSON-проект.');
  }

  return serializeProject(migrateProject(parsed));
};

const readSafeProject = (filePath: string): { path: string; snapshot: string } => {
  const raw = readFileSync(filePath, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_PROJECT_BYTES) {
    throw new Error('Слишком большой проектный файл.');
  }

  return {
    path: filePath,
    snapshot: ensureSafeProjectSnapshot(raw)
  };
};

const ensurePath = (path: string | null | undefined): string => {
  if (!path) {
    throw new Error('Не указан путь для сохранения проекта.');
  }

  if (path.includes('\\0')) {
    throw new Error('Некорректный путь для сохранения проекта.');
  }

  return path;
};

const normalizeProjectPath = (path: string): string => {
  const normalized = path.trim();
  if (!normalized) {
    throw new Error('Пустой путь для сохранения проекта.');
  }

  const lower = normalized.toLowerCase();
  if (lower.endsWith('.markd')) return normalized;
  if (lower.endsWith('.kpdoc')) return `${normalized.slice(0, -'.kpdoc'.length)}.markd`;
  return `${normalized}.markd`;
};

const normalizePdfPath = (path: string): string => {
  const normalized = path.trim();
  if (!normalized) {
    throw new Error('Пустой путь для сохранения PDF.');
  }

  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
};

const writeProjectAtomically = (filePath: string, contents: string): void => {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, contents, 'utf8');
    renameSync(tempPath, filePath);
  } catch (renameOrFallbackError) {
    try {
      writeFileSync(filePath, contents, 'utf8');
    } catch (writeError) {
      try {
        unlinkSync(tempPath);
      } catch {
        // игнорировать ошибку удаления временного файла
      }
      if (writeError instanceof Error) {
        throw writeError;
      }
      throw renameOrFallbackError instanceof Error
        ? renameOrFallbackError
        : new Error('Не удалось записать файл проекта.');
    } finally {
      try {
        unlinkSync(tempPath);
      } catch {
        // игнорировать ошибку удаления временного файла
      }
    }
  }
};

const registerRecent = (path: string): void => {
  const entries = loadRecentProjects();
  const existingIndex = entries.findIndex((item) => item.path === path);
  const existing = existingIndex >= 0 ? entries[existingIndex] : undefined;
  if (existingIndex >= 0) {
    entries.splice(existingIndex, 1);
  }
  entries.unshift({ id: existing?.id ?? randomUUID(), path, lastOpenedAt: new Date().toISOString() });
  if (entries.length > 20) {
    entries.length = 20;
  }
  persistRecentProjects();
};

export const registerIpcHandlers = (): void => {
  ipcMain.handle(IPC_CHANNEL.OPEN_PROJECT, async (event) => {
    const window = withMainWindowFromEvent(event);
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [
        { name: 'Проекты MarkD', extensions: ['markd'] },
        { name: 'Старые проекты KP Editor', extensions: ['kpdoc'] }
      ]
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    try {
      const loaded = readSafeProject(result.filePaths[0]);
      registerRecent(loaded.path);
      writeLog('info', 'project.opened', undefined, { path: loaded.path });
      return loaded;
    } catch (error) {
      writeLog('error', 'project.open-failed', error, { path: result.filePaths[0] });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNEL.OPEN_RECENT_PROJECT, async (event, projectId: unknown) => {
    withMainWindowFromEvent(event);
    const safeProjectId = z.string().uuid().parse(projectId);
    getRecentProjectSummaries();
    const entry = loadRecentProjects().find((candidate) => candidate.id === safeProjectId);
    if (!entry) throw new Error('Проект отсутствует в списке недавних.');

    try {
      const loaded = readSafeProject(entry.path);
      registerRecent(loaded.path);
      writeLog('info', 'project.opened-recent', undefined, { path: loaded.path });
      return loaded;
    } catch (error) {
      recentProjects = loadRecentProjects().filter((candidate) => candidate.id !== safeProjectId);
      persistRecentProjects();
      writeLog('error', 'project.open-recent-failed', error, { path: entry.path });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNEL.SAVE_PROJECT, async (event, payload: SaveProjectArgs) => {
    withMainWindowFromEvent(event);
    const safeSnapshot = ensureSafeProjectSnapshot(payload.snapshot);

    const existingPath = ensurePath(payload.path);
    const resolvedPath = normalizeProjectPath(existingPath);
    try {
      writeProjectAtomically(resolvedPath, safeSnapshot);
      registerRecent(resolvedPath);
      writeLog('info', 'project.saved', undefined, { path: resolvedPath });
      return resolvedPath;
    } catch (error) {
      writeLog('error', 'project.save-failed', error, { path: resolvedPath });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNEL.SAVE_PROJECT_AS, async (event, snapshot: string) => {
    withMainWindowFromEvent(event);
    const safeSnapshot = ensureSafeProjectSnapshot(snapshot);

    const window = withMainWindowFromEvent(event);
    const project = projectSchema.parse(JSON.parse(safeSnapshot));
    const result = await dialog.showSaveDialog(window, {
      defaultPath: defaultProjectPath(project.metadata.title),
      filters: [{ name: 'Проект MarkD', extensions: ['markd'] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const resolvedPath = normalizeProjectPath(result.filePath);
    try {
      writeProjectAtomically(resolvedPath, safeSnapshot);
      registerRecent(resolvedPath);
      writeLog('info', 'project.saved-as', undefined, { path: resolvedPath });
      return resolvedPath;
    } catch (error) {
      writeLog('error', 'project.save-as-failed', error, { path: resolvedPath });
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNEL.IMPORT_IMAGE, async (event) => {
    const window = withMainWindowFromEvent(event);
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const filePath = result.filePaths[0];
    const raw = readFileSync(filePath);
    if (raw.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Слишком большое изображение (лимит 12 МБ).');
    }

    const lower = filePath.toLowerCase();
    const mimeType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${raw.toString('base64')}`;

    const reply = {
      id: `asset_${randomUUID()}`,
      name: filePath.split('/').at(-1) ?? 'image',
      mimeType,
      width: 0,
      height: 0,
      dataUrl
    };

    return importImageResultSchema.parse(reply);
  });

  ipcMain.handle(IPC_CHANNEL.EXPORT_PDF, async (event, snapshot: string) => {
    withMainWindowFromEvent(event);
    const safeSnapshot = ensureSafeProjectSnapshot(snapshot);
    const project = projectSchema.parse(JSON.parse(safeSnapshot));

    const window = withMainWindowFromEvent(event);
    const result = await dialog.showSaveDialog(window, {
      defaultPath: defaultPdfPath(project.metadata.title),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    const resolvedPath = normalizePdfPath(result.filePath);

    await window.webContents.executeJavaScript(`
      Promise.all([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        ...Array.from(document.images).map((image) => image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }))
      ])
    `);

    const pdfData = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: project.orientation === 'landscape'
    });

    if (pdfData.byteLength > MAX_PDF_BYTES) {
      throw new Error('Слишком большой PDF (лимит 64 МБ).');
    }

    writeFileSync(resolvedPath, pdfData);
    writeLog('info', 'project.pdf-exported', undefined, { path: resolvedPath });
    return resolvedPath;
  });

  ipcMain.handle(IPC_CHANNEL.GET_RECENT, async (event) => {
    withMainWindowFromEvent(event);
    return getRecentProjectSummaries();
  });

  ipcMain.on(IPC_CHANNEL.SET_DIRTY, (event, isDirty: boolean) => {
    const window = withMainWindowFromEvent(event);
    window.setDocumentEdited(Boolean(isDirty));
  });

  ipcMain.on(IPC_CHANNEL.LOG_RENDERER_ERROR, (event, payload: unknown) => {
    assertRendererOrigin(event);
    const parsed = rendererErrorSchema.safeParse(payload);
    if (!parsed.success) {
      writeLog('warn', 'renderer.invalid-error-payload');
      return;
    }
    writeLog(
      'error',
      `renderer.${parsed.data.event}`,
      parsed.data.stack ? new Error(`${parsed.data.message}\n${parsed.data.stack}`) : parsed.data.message,
      {},
      'renderer'
    );
  });
};

registerIpcChannel();
