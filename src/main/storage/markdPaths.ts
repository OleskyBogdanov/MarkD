import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type MarkdPaths = {
  root: string;
  projects: string;
  exports: string;
  logs: string;
};

let cachedPaths: MarkdPaths | null = null;

export const ensureMarkdDirectories = (): MarkdPaths => {
  if (cachedPaths) return cachedPaths;

  // userData указывает на стандартную папку данных приложения:
  // ~/Library/Application Support/<имя приложения> в macOS.
  const root = app.getPath('userData');
  const projects = join(root, 'projects');
  const exports = join(root, 'exports');
  const logs = join(root, 'logs');
  for (const directory of [projects, exports, logs]) {
    mkdirSync(directory, { recursive: true });
  }
  cachedPaths = { root, projects, exports, logs };
  return cachedPaths;
};

const UNSAFE_FILE_CHARS = /[<>:"/\\|?*]/g;

export const sanitizeProjectFileName = (title: string): string => {
  const normalized = title
    .normalize('NFKC')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(UNSAFE_FILE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 96);

  return normalized || `proposal-${Date.now()}`;
};

export const defaultProjectPath = (title: string): string =>
  join(ensureMarkdDirectories().projects, `${sanitizeProjectFileName(title)}.markd`);

export const defaultPdfPath = (title: string): string =>
  join(ensureMarkdDirectories().exports, `${sanitizeProjectFileName(title)}.pdf`);
