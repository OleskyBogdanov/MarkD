import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type LogProcess = 'main' | 'renderer' | 'launcher';

export type LogContext = Record<string, string | number | boolean | null | undefined>;

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const MAX_LOG_FILES = 14;
let logsDirectory: string | null = null;

const datePart = (date = new Date()): string => date.toISOString().slice(0, 10);
const timestampPart = (date = new Date()): string => date.toISOString().replace(/[:.]/g, '-');

const redactHome = (value: string): string => {
  const home = homedir();
  return home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
};

const sanitizeContext = (context: LogContext): LogContext => Object.fromEntries(
  Object.entries(context).map(([key, value]) => [key, typeof value === 'string' ? redactHome(value).slice(0, 2_000) : value])
);

const errorDetails = (error: unknown): { message?: string; stack?: string } => {
  if (error instanceof Error) {
    return { message: error.message.slice(0, 2_000), stack: error.stack?.slice(0, 12_000) };
  }
  if (typeof error === 'string') return { message: error.slice(0, 2_000) };
  return {};
};

const cleanupOldLogs = (): void => {
  if (!logsDirectory) return;
  try {
    const files = readdirSync(logsDirectory)
      .filter((name) => name.startsWith('markd-') && name.endsWith('.log'))
      .flatMap((name) => {
        try {
          return [{ name, modifiedAt: statSync(join(logsDirectory!, name)).mtimeMs }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt);

    files.slice(MAX_LOG_FILES).forEach(({ name }) => {
      try {
        unlinkSync(join(logsDirectory!, name));
      } catch {
        // Ротация не должна мешать запуску приложения.
      }
    });
  } catch (error) {
    console.error('Не удалось выполнить ротацию журналов Markd:', error);
  }
};

const currentLogPath = (): string | null => {
  if (!logsDirectory) return null;
  try {
    const path = join(logsDirectory, `markd-${datePart()}.log`);
    if (existsSync(path) && statSync(path).size >= MAX_LOG_BYTES) {
      renameSync(path, join(logsDirectory, `markd-${timestampPart()}.log`));
      cleanupOldLogs();
    }
    return path;
  } catch (error) {
    console.error('Не удалось подготовить журнал Markd:', error);
    return null;
  }
};

export const initializeLogger = (directory: string): void => {
  try {
    mkdirSync(directory, { recursive: true });
    logsDirectory = directory;
    cleanupOldLogs();
  } catch (error) {
    logsDirectory = null;
    console.error('Не удалось инициализировать журнал Markd:', error);
  }
};

export const getLogsDirectory = (): string | null => logsDirectory;

export const writeLog = (
  level: LogLevel,
  event: string,
  error?: unknown,
  context: LogContext = {},
  processName: LogProcess = 'main'
): void => {
  const path = currentLogPath();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    process: processName,
    event: event.slice(0, 160),
    ...errorDetails(error),
    context: sanitizeContext(context),
    appVersion: app.isReady() ? app.getVersion() : undefined,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    pid: process.pid
  };

  if (!path) {
    console.error(JSON.stringify(entry));
    return;
  }

  try {
    appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (writeError) {
    console.error('Не удалось записать журнал Markd:', writeError);
  }
};
