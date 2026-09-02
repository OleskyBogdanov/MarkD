import { contextBridge, ipcRenderer } from 'electron';
import { z } from 'zod';
import { IPC_CHANNEL, OpenProjectResult, SaveProjectArgs, ImportImageResult, MenuCommandPayload, RecentProjectSummary, RendererErrorPayload } from './api-types.js';

const menuCommandSchema = z.object({
  command: z.enum(['undo', 'redo', 'new-document', 'save', 'open', 'export-pdf', 'delete'])
});

contextBridge.exposeInMainWorld('desktop', {
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
  }
});
