import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_CHANNEL } from '../../shared/ipc-channels.js';
import { importExcelCatalog } from '../import/excelCatalogService.js';
import { assertRendererOrigin } from './ipcRegistry.js';

export const registerExcelImportIpc = (): void => {
  ipcMain.handle(IPC_CHANNEL.IMPORT_EXCEL, async event => {
    assertRendererOrigin(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('Нет активного окна приложения.');
    const result = await dialog.showOpenDialog(window, {
      title: 'Импортировать Excel',
      buttonLabel: 'Импортировать',
      properties: ['openFile'],
      filters: [{ name: 'Прайс Excel', extensions: ['xlsx'] }]
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return null;
    return importExcelCatalog(filePath);
  });
};
