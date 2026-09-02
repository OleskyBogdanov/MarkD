import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureSafeProjectSnapshot, readSafeProject, writeProjectAtomically } from '../projectFileService.js';

const tempDirectories: string[] = [];
const pixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgAH/l5qzVAAAAABJRU5ErkJggg==';

const makeProject = () => {
  const now = new Date().toISOString();
  return {
    schemaVersion: 4,
    metadata: { id: 'project-test', title: 'Переносимый проект', createdAt: now, updatedAt: now, renderProfileVersion: 1 },
    orientation: 'portrait',
    layers: [{ id: 'layer_main', name: 'Основной', order: 0, visible: true, locked: false }],
    pages: [{
      id: 'page-1', widthMm: 210, heightMm: 297, background: null, flowStartYmm: 8,
      elements: [{ id: 'image-1', type: 'image', rect: { x: 10, y: 10, width: 20, height: 20 }, assetId: 'asset-used', layerId: 'layer_main', zIndex: 0 }]
    }],
    assets: [
      { id: 'asset-used', name: 'used.png', mimeType: 'image/png', dataUrl: pixelPng },
      { id: 'asset-orphan', name: 'orphan.png', mimeType: 'image/png', dataUrl: pixelPng }
    ],
    styles: {}
  };
};

afterEach(() => {
  tempDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('переносимый файл проекта', () => {
  test('проверяет изображения и исключает неиспользуемые ресурсы', () => {
    const parsed = JSON.parse(ensureSafeProjectSnapshot(JSON.stringify(makeProject()))) as ReturnType<typeof makeProject>;
    expect(parsed.assets.map((asset) => asset.id)).toEqual(['asset-used']);
    expect(parsed.assets[0].dataUrl).toBe(pixelPng);
  });

  test('отклоняет изображение, MIME которого не совпадает с содержимым', () => {
    const project = makeProject();
    project.assets[0].mimeType = 'image/jpeg';
    expect(() => ensureSafeProjectSnapshot(JSON.stringify(project))).toThrow('MIME-тип');
  });

  test('оставляет резервную копию при атомарной перезаписи', () => {
    const directory = mkdtempSync(join(tmpdir(), 'markd-project-file-'));
    tempDirectories.push(directory);
    const filePath = join(directory, 'proposal.markd');
    writeFileSync(filePath, 'previous', 'utf8');

    const snapshot = ensureSafeProjectSnapshot(JSON.stringify(makeProject()));
    writeProjectAtomically(filePath, snapshot);

    expect(readFileSync(`${filePath}.bak`, 'utf8')).toBe('previous');
    expect(readSafeProject(filePath).snapshot).toBe(snapshot);
  });
});
