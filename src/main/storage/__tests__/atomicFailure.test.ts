import { afterEach, expect, test, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('electron', () => ({ nativeImage: {} }));
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, renameSync: vi.fn(() => { throw new Error('EACCES'); }) };
});
import { writeProjectAtomically } from '../projectFileService.js';
let directory: string;
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); });
test('failed replacement preserves both the original and backup and removes the temporary file', () => {
  directory = mkdtempSync(join(tmpdir(), 'markd-atomic-'));
  const path = join(directory, 'safe.markd');
  writeFileSync(path, 'original');
  expect(() => writeProjectAtomically(path, 'replacement')).toThrow('EACCES');
  expect(readFileSync(path, 'utf8')).toBe('original');
  expect(readFileSync(`${path}.bak`, 'utf8')).toBe('original');
  expect(readdirSync(directory).sort()).toEqual(['safe.markd', 'safe.markd.bak']);
});
