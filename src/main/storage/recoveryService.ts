import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ensureMarkdDirectories } from './markdPaths.js';
import { ensureSafeProjectSnapshot, MAX_PROJECT_BYTES, writeProjectAtomically } from './projectFileService.js';
import type { RecoveryRecord } from '../../shared/ipc-channels.js';

const recordSchema = z.object({ snapshot: z.string(), path: z.string().nullable(), savedAt: z.string().datetime() });
const recoveryPath = (): string => join(ensureMarkdDirectories().root, 'recovery.json');

export const writeRecovery = (payload: unknown): void => {
  const record = recordSchema.parse(payload);
  record.snapshot = ensureSafeProjectSnapshot(record.snapshot);
  writeProjectAtomically(recoveryPath(), JSON.stringify(record));
};

export const readRecovery = (): RecoveryRecord | null => {
  for (const path of [recoveryPath(), `${recoveryPath()}.bak`]) {
    if (!existsSync(path)) continue;
    try {
      if (statSync(path).size > MAX_PROJECT_BYTES * 2 + 4096) continue;
      const record = recordSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
      record.snapshot = ensureSafeProjectSnapshot(record.snapshot);
      return record;
    } catch { /* Try the previous valid recovery generation. */ }
  }
  return null;
};

export const clearRecovery = (): void => {
  for (const path of [recoveryPath(), `${recoveryPath()}.bak`]) {
    try { unlinkSync(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
};
