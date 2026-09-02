declare global {
  interface DesktopMenuCommand {
    command: 'undo' | 'redo' | 'new-document' | 'save' | 'open' | 'export-pdf' | 'delete';
  }

  interface Window {
    desktop: {
      openProject: () => Promise<{ path: string; snapshot: string } | null>;
      openRecentProject: (projectId: string) => Promise<{ path: string; snapshot: string }>;
      saveProject: (snapshot: string, path?: string | null) => Promise<string | null>;
      saveProjectAs: (snapshot: string) => Promise<string | null>;
      saveTemplate: (snapshot: string) => Promise<string | null>;
      importImage: () => Promise<{
        id: string;
        name: string;
        mimeType: string;
        width: number;
        height: number;
        dataUrl: string;
      } | null>;
      exportPdf: (snapshot: string) => Promise<string | null>;
      getRecentProjects: () => Promise<Array<{
        id: string;
        displayName: string;
        fileName: string;
        path: string;
        modifiedAt: string;
        legacyFormat: boolean;
      }>>;
      setDirtyState: (isDirty: boolean) => void;
      reportRendererError: (payload: {
        event: 'window.error' | 'unhandledrejection' | 'react.error-boundary';
        message: string;
        stack?: string;
      }) => void;
      onMenuCommand: (handler: (payload: DesktopMenuCommand) => void) => () => void;
      onExternalProjectOpen: (handler: (payload: { path: string; snapshot: string }) => void) => () => void;
    };
  }
}

export {};
