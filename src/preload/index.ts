import { contextBridge, ipcRenderer } from 'electron';
import { z } from 'zod';
import { IPC_CHANNEL, OpenProjectResult, SaveProjectArgs, ImportImageResult, MenuCommandPayload, RecentProjectSummary, RendererErrorPayload, type DesktopApi } from './api-types.js';

const menuCommandSchema = z.object({
  command: z.enum(['undo', 'redo', 'new-document', 'save', 'save-as', 'open', 'export-pdf', 'delete', 'duplicate'])
});

const openProjectResultSchema = z.object({ path: z.string().min(1), snapshot: z.string().min(1) });
const pendingExternalProjects: OpenProjectResult[] = [];
const externalProjectHandlers = new Set<(payload: OpenProjectResult) => void>();

ipcRenderer.on(IPC_CHANNEL.OPEN_PROJECT_FROM_OS, (_event, payload: unknown) => {
  const parsed = openProjectResultSchema.safeParse(payload);
  if (!parsed.success) return;
  if (externalProjectHandlers.size === 0) {
    pendingExternalProjects.push(parsed.data);
    return;
  }
  externalProjectHandlers.forEach((handler) => handler(parsed.data));
});

const desktop: DesktopApi = {
  onShowUpdates: handler => {
    const listener = (): void => handler();
    ipcRenderer.on(IPC_CHANNEL.UPDATE_SHOW, listener);
    return () => { ipcRenderer.removeListener(IPC_CHANNEL.UPDATE_SHOW, listener); };
  },
  getUpdateState: () => ipcRenderer.invoke(IPC_CHANNEL.UPDATE_GET),
  updateAction: command => ipcRenderer.invoke(IPC_CHANNEL.UPDATE_ACTION, command),
  onUpdateState: handler => {
    const listener = (_event: unknown, state: Parameters<typeof handler>[0]): void => handler(state);
    ipcRenderer.on(IPC_CHANNEL.UPDATE_STATE, listener);
    return () => { ipcRenderer.removeListener(IPC_CHANNEL.UPDATE_STATE, listener); };
  },
  onCloseCancelled: handler => {
    const listener = (): void => handler();
    ipcRenderer.on(IPC_CHANNEL.CLOSE_CANCELLED, listener);
    return () => { ipcRenderer.removeListener(IPC_CHANNEL.CLOSE_CANCELLED, listener); };
  },
  confirmSave: () => ipcRenderer.invoke(IPC_CHANNEL.CONFIRM_SAVE),
  readRecovery: () => ipcRenderer.invoke(IPC_CHANNEL.RECOVERY_READ),
  writeRecovery: record => ipcRenderer.invoke(IPC_CHANNEL.RECOVERY_WRITE, record),
  clearRecovery: () => ipcRenderer.invoke(IPC_CHANNEL.RECOVERY_CLEAR),
  revealProject: path => ipcRenderer.invoke(IPC_CHANNEL.REVEAL_PROJECT, path),
  nativeEdit: command => ipcRenderer.send(IPC_CHANNEL.NATIVE_EDIT, command),
  acknowledgeClose: id => ipcRenderer.send(IPC_CHANNEL.CLOSE_ACK, id),
  respondToClose: (id, allow) => ipcRenderer.send(IPC_CHANNEL.CLOSE_RESPONSE, { id, allow }),
  onCloseRequest: handler => {
    const listener = (_event: unknown, payload: unknown): void => {
      const parsed = z.object({ id: z.string().uuid() }).safeParse(payload);
      if (parsed.success) handler(parsed.data);
    };
    ipcRenderer.on(IPC_CHANNEL.REQUEST_CLOSE, listener);
    return () => { ipcRenderer.removeListener(IPC_CHANNEL.REQUEST_CLOSE, listener); };
  },
  openProject: async (): Promise<OpenProjectResult | null> => {
    return ipcRenderer.invoke(IPC_CHANNEL.OPEN_PROJECT);
  },
  openRecentProject: async (projectId: string): Promise<OpenProjectResult> => {
    return ipcRenderer.invoke(IPC_CHANNEL.OPEN_RECENT_PROJECT, projectId);
  },
  saveProject: async (snapshot: string, path?: string | null): Promise<string | null> => {
    const payload: SaveProjectArgs = { snapshot, path: path ?? null };
    return ipcRenderer.invoke(IPC_CHANNEL.SAVE_PROJECT, payload);
  },
  saveProjectAs: async (snapshot: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNEL.SAVE_PROJECT_AS, snapshot);
  },
  saveTemplate: async (snapshot: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNEL.SAVE_TEMPLATE, snapshot);
  },
  importImage: async (): Promise<ImportImageResult | null> => {
    return ipcRenderer.invoke(IPC_CHANNEL.IMPORT_IMAGE);
  },
  exportPdf: async (snapshot: string): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNEL.EXPORT_PDF, snapshot);
  },
  getRecentProjects: async (): Promise<RecentProjectSummary[]> => {
    return ipcRenderer.invoke(IPC_CHANNEL.GET_RECENT);
  },
  setDirtyState: (isDirty: boolean): void => {
    ipcRenderer.send(IPC_CHANNEL.SET_DIRTY, isDirty);
  },
  reportRendererError: (payload: RendererErrorPayload): void => {
    ipcRenderer.send(IPC_CHANNEL.LOG_RENDERER_ERROR, payload);
  },
  onMenuCommand: (handler: (payload: MenuCommandPayload) => void): (() => void) => {
    const listener = (_event: unknown, event: unknown) => {
      const parsedPayload = menuCommandSchema.safeParse(event);
      if (parsedPayload.success) {
        handler(parsedPayload.data);
      }
    };

    ipcRenderer.on(IPC_CHANNEL.MENU_CMD, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNEL.MENU_CMD, listener);
  },
  onExternalProjectOpen: (handler: (payload: OpenProjectResult) => void): (() => void) => {
    externalProjectHandlers.add(handler);
    queueMicrotask(() => {
      if (!externalProjectHandlers.has(handler)) return;
      pendingExternalProjects.splice(0).forEach(handler);
    });
    return () => externalProjectHandlers.delete(handler);
  }
};
contextBridge.exposeInMainWorld('desktop', desktop);
