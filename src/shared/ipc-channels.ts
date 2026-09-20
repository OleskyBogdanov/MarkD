export const IPC_CHANNEL = {
  OPEN_PROJECT: 'project:open',
  OPEN_RECENT_PROJECT: 'project:openRecent',
  SAVE_PROJECT: 'project:save',
  SAVE_PROJECT_AS: 'project:saveAs',
  SAVE_TEMPLATE: 'project:saveTemplate',
  IMPORT_IMAGE: 'file:importImage',
  EXPORT_PDF: 'project:exportPdf',
  NEW_DOC: 'project:new',
  GET_RECENT: 'project:recent',
  SET_DIRTY: 'project:setDirty',
  LOG_RENDERER_ERROR: 'diagnostics:rendererError',
  MENU_CMD: 'menu:command',
  OPEN_PROJECT_FROM_OS: 'project:openFromOs',
  REQUEST_CLOSE: 'document:requestClose',
  CLOSE_ACK: 'document:closeAck',
  CLOSE_RESPONSE: 'document:closeResponse',
  CONFIRM_SAVE: 'document:confirmSave',
  RECOVERY_READ: 'recovery:read',
  RECOVERY_WRITE: 'recovery:write',
  RECOVERY_CLEAR: 'recovery:clear',
  REVEAL_PROJECT: 'project:reveal',
  CLOSE_CANCELLED: 'document:closeCancelled',
  UPDATE_SHOW: 'update:show',
  UPDATE_GET: 'update:get',
  UPDATE_ACTION: 'update:action',
  UPDATE_STATE: 'update:state',
  NATIVE_EDIT: 'document:nativeEdit'
} as const;

export type RendererErrorPayload = {
  event: 'window.error' | 'unhandledrejection' | 'react.error-boundary';
  message: string;
  stack?: string;
};

export type MenuCommandPayload = {
  command: 'undo' | 'redo' | 'new-document' | 'save' | 'save-as' | 'open' | 'export-pdf' | 'delete' | 'duplicate';
};

export type CloseRequest = { id: string };
export type RecoveryRecord = { snapshot: string; path: string | null; savedAt: string };
export type SaveDecision = 'save' | 'discard' | 'cancel';

export type UpdateState = {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
  notes?: string;
  message?: string;
};

export interface DesktopApi {
  onShowUpdates: (handler: () => void) => () => void;
  getUpdateState: () => Promise<UpdateState>;
  updateAction: (command: 'check' | 'download' | 'install') => Promise<UpdateState>;
  onUpdateState: (handler: (state: UpdateState) => void) => () => void;
  onCloseCancelled: (handler: () => void) => () => void;
  openProject: () => Promise<OpenProjectResult | null>;
  openRecentProject: (id: string) => Promise<OpenProjectResult>;
  saveProject: (snapshot: string, path?: string | null) => Promise<string | null>;
  saveProjectAs: (snapshot: string) => Promise<string | null>;
  saveTemplate: (snapshot: string) => Promise<string | null>;
  importImage: () => Promise<ImportImageResult | null>;
  exportPdf: (snapshot: string) => Promise<string | null>;
  getRecentProjects: () => Promise<RecentProjectSummary[]>;
  setDirtyState: (dirty: boolean) => void;
  reportRendererError: (payload: RendererErrorPayload) => void;
  onMenuCommand: (handler: (payload: MenuCommandPayload) => void) => () => void;
  onExternalProjectOpen: (handler: (payload: OpenProjectResult) => void) => () => void;
  confirmSave: () => Promise<SaveDecision>;
  onCloseRequest: (handler: (payload: CloseRequest) => void) => () => void;
  acknowledgeClose: (id: string) => void;
  respondToClose: (id: string, allow: boolean) => void;
  readRecovery: () => Promise<RecoveryRecord | null>;
  writeRecovery: (record: RecoveryRecord) => Promise<void>;
  clearRecovery: () => Promise<void>;
  revealProject: (path: string) => Promise<void>;
  nativeEdit: (command: 'undo' | 'redo' | 'delete') => void;
}

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
