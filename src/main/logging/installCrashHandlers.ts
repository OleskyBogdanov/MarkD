import { app, type BrowserWindow, type RenderProcessGoneDetails } from 'electron';
import { writeLog } from './appLogger.js';

let processHandlersInstalled = false;

export const installProcessLogging = (): void => {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    writeLog('fatal', 'main.uncaught-exception', error, { origin });
  });
  process.on('unhandledRejection', (reason) => {
    writeLog('error', 'main.unhandled-rejection', reason);
  });
  app.on('child-process-gone', (_event, details) => {
    writeLog('error', 'electron.child-process-gone', undefined, {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName ?? null,
      name: details.name ?? null
    });
  });
};

const renderGoneContext = (details: RenderProcessGoneDetails) => ({
  reason: details.reason,
  exitCode: details.exitCode
});

export const installWindowLogging = (window: BrowserWindow): void => {
  window.webContents.on('did-finish-load', () => {
    writeLog('info', 'renderer.did-finish-load');
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    writeLog('fatal', 'renderer.process-gone', undefined, renderGoneContext(details));
  });
  window.webContents.on('unresponsive', () => {
    writeLog('warn', 'renderer.unresponsive');
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeLog('error', 'renderer.did-fail-load', undefined, {
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame
    });
  });
};
