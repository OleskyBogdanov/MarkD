export const IPC_CHANNEL = {
  OPEN_PROJECT: 'project:open',
  OPEN_RECENT_PROJECT: 'project:openRecent',
  SAVE_PROJECT: 'project:save',
  SAVE_PROJECT_AS: 'project:saveAs',
  IMPORT_IMAGE: 'file:importImage',
  EXPORT_PDF: 'project:exportPdf',
  NEW_DOC: 'project:new',
  GET_RECENT: 'project:recent',
  SET_DIRTY: 'project:setDirty',
  LOG_RENDERER_ERROR: 'diagnostics:rendererError',
  MENU_CMD: 'menu:command'
} as const;

export type RendererErrorPayload = {
  event: 'window.error' | 'unhandledrejection' | 'react.error-boundary';
  message: string;
  stack?: string;
};

export type MenuCommandPayload = {
  command: 'undo' | 'redo' | 'new-document' | 'save' | 'open' | 'export-pdf' | 'delete';
};

export type OpenProjectResult = {
  path: string;
  snapshot: string;
};

export type RecentProjectSummary = {
  id: string;
  displayName: string;
  fileName: string;
  path: string;
  modifiedAt: string;
  legacyFormat: boolean;
};

export type SaveProjectArgs = {
  snapshot: string;
  path?: string | null;
};

export type ImportImageResult = {
  id: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
  dataUrl: string;
};
