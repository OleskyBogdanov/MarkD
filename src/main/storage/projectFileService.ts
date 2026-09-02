import {
  copyFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { migrateProject, projectSchema, serializeProject, type KpProject } from '../../shared/projectSchema.js';

export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_DATA_URL_BYTES = Math.ceil(MAX_IMAGE_BYTES * 1.45);

type AllowedImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export const isProjectFile = (filePath: string): boolean => {
  const extension = extname(filePath).toLowerCase();
  return extension === '.markd' || extension === '.kpdoc';
};

export const detectImageMimeType = (contents: Buffer): AllowedImageMimeType | null => {
  if (contents.length >= 8 && contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff) return 'image/jpeg';
  if (contents.length >= 12 && contents.toString('ascii', 0, 4) === 'RIFF' && contents.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (contents.length >= 6 && ['GIF87a', 'GIF89a'].includes(contents.toString('ascii', 0, 6))) return 'image/gif';
  return null;
};

const decodeImageDataUrl = (dataUrl: string): { contents: Buffer; mimeType: AllowedImageMimeType } => {
  if (dataUrl.length > MAX_IMAGE_DATA_URL_BYTES) throw new Error('Изображение в проекте превышает лимит 12 МБ.');
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match) throw new Error('Проект содержит повреждённое или неподдерживаемое изображение.');
  const declaredMimeType = match[1] as AllowedImageMimeType;
  const contents = Buffer.from(match[2], 'base64');
  if (contents.byteLength > MAX_IMAGE_BYTES) throw new Error('Изображение в проекте превышает лимит 12 МБ.');
  const detectedMimeType = detectImageMimeType(contents);
  if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
    throw new Error('Тип изображения не соответствует его содержимому.');
  }
  return { contents, mimeType: detectedMimeType };
};

const removeOrphanAssets = (project: KpProject): KpProject => {
  const referencedAssetIds = new Set<string>();
  for (const page of project.pages) {
    for (const element of page.elements) {
      if (element.type === 'image') referencedAssetIds.add(element.assetId);
    }
  }
  return { ...project, assets: project.assets.filter((asset) => referencedAssetIds.has(asset.id)) };
};

const validateEmbeddedImages = (project: KpProject): void => {
  for (const asset of project.assets) {
    const decoded = decodeImageDataUrl(asset.dataUrl);
    if (asset.mimeType !== decoded.mimeType) throw new Error(`Неверный MIME-тип ресурса «${asset.name}».`);
  }
  for (const page of project.pages) {
    if (page.background?.type === 'image') decodeImageDataUrl(page.background.value);
  }
};

export const ensureSafeProjectSnapshot = (snapshot: string): string => {
  if (typeof snapshot !== 'string') throw new Error('Неверный тип проекта.');
  if (Buffer.byteLength(snapshot, 'utf8') > MAX_PROJECT_BYTES) throw new Error('Слишком большой проектный снимок.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    throw new Error('Неверный JSON-проект.');
  }

  const project = removeOrphanAssets(migrateProject(parsed));
  validateEmbeddedImages(project);
  const serialized = serializeProject(projectSchema.parse(project));
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROJECT_BYTES) throw new Error('Слишком большой проектный файл.');
  return serialized;
};

export const readSafeProject = (filePath: string): { path: string; snapshot: string } => {
  if (!isProjectFile(filePath)) throw new Error('Поддерживаются только файлы .markd и .kpdoc.');
  const raw = readFileSync(filePath, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_PROJECT_BYTES) throw new Error('Слишком большой проектный файл.');
  return { path: filePath, snapshot: ensureSafeProjectSnapshot(raw) };
};

export const writeProjectAtomically = (filePath: string, contents: string): void => {
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  const backupPath = `${filePath}.bak`;
  let descriptor: number | null = null;

  try {
    descriptor = openSync(tempPath, 'wx');
    writeFileSync(descriptor, contents, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;

    if (existsSync(filePath)) copyFileSync(filePath, backupPath);
    try {
      renameSync(tempPath, filePath);
    } catch (replaceError) {
      if (!existsSync(filePath)) throw replaceError;
      unlinkSync(filePath);
      try {
        renameSync(tempPath, filePath);
      } catch (writeError) {
        if (existsSync(backupPath)) copyFileSync(backupPath, filePath);
        throw writeError;
      }
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
};
