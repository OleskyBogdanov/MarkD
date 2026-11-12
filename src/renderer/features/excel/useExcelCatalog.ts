import { useRef, useState } from 'react';
import type { ExcelCatalog } from '@/shared/excelCatalog';
import { flushPendingEdits } from '@/renderer/domain/pendingEdits';
import { useEditorStore } from '@/renderer/store/useEditorStore';

type ExcelCatalogOptions = {
  readonly enabled: boolean;
  readonly reportError: (error: unknown) => void;
};

export const useExcelCatalog = ({ enabled, reportError }: ExcelCatalogOptions) => {
  const sessionId = useEditorStore(state => state.sessionId);
  const [catalog, setCatalog] = useState<ExcelCatalog | null>(null);
  const [importing, setImporting] = useState(false);
  const [dialogSessionId, setDialogSessionId] = useState<number | null>(null);
  const importingRef = useRef(false);

  const importExcel = async (): Promise<void> => {
    if (!enabled || importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    try {
      const imported = await window.desktop.importExcel();
      if (imported) {
        setCatalog(imported);
        setDialogSessionId(null);
      }
    } catch (error) {
      reportError(error);
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  const openFill = (): void => {
    if (!enabled || importingRef.current || !catalog) return;
    try {
      flushPendingEdits();
      setDialogSessionId(useEditorStore.getState().sessionId);
    } catch (error) {
      reportError(error);
    }
  };

  return {
    catalog,
    importing,
    sessionId,
    dialogOpen: dialogSessionId === sessionId,
    importExcel,
    openFill,
    closeFill: (): void => setDialogSessionId(null)
  };
};
