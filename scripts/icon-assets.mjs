import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const representations = [16, 32, 128, 256, 512].flatMap((size) =>
  [1, 2].map((scale) => ({
    name: `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`,
    pixels: size * scale,
  })),
);
const pngSizes = new Map([
  ['icp4', 16], ['icp5', 32], ['icp6', 64],
  ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
]);
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

export function inspectIcns(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'icns', 'ICNS signature');
  assert.equal(bytes.readUInt32BE(4), bytes.length, 'ICNS file length');
  const records = [];
  for (let offset = 8; offset < bytes.length;) {
    assert.ok(offset + 8 <= bytes.length, 'Complete ICNS record header');
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32BE(offset + 4);
    assert.ok(length >= 8 && offset + length <= bytes.length, `${type}: record length`);
    const payload = bytes.subarray(offset + 8, offset + length);
    if (payload.subarray(0, 8).equals(pngSignature)) {
      assert.ok(payload.length >= 24, `${type}: PNG header`);
      const width = payload.readUInt32BE(16);
      const height = payload.readUInt32BE(20);
      assert.equal(width, pngSizes.get(type), `${type}: PNG width`);
      assert.equal(height, width, `${type}: PNG height`);
      records.push({ type, length, pixels: width });
    } else {
      records.push({ type, length });
    }
    offset += length;
  }
  return records;
}

export async function validateIcns(path) {
  const records = inspectIcns(await readFile(path));
  const temporary = await mkdtemp(join(tmpdir(), 'markd-icon-check-'));
  try {
    const iconset = join(temporary, 'decoded.iconset');
    execFileSync('iconutil', ['-c', 'iconset', path, '-o', iconset], { stdio: 'pipe' });
    for (const { name, pixels } of representations) {
      const png = await readFile(join(iconset, name));
      assert.ok(png.subarray(0, 8).equals(pngSignature), `${name}: PNG signature`);
      assert.equal(png.readUInt32BE(16), pixels, `${name}: width`);
      assert.equal(png.readUInt32BE(20), pixels, `${name}: height`);
      // Force Apple's ImageIO decoder to read the full payload, beyond its PNG header.
      execFileSync('sips', ['-s', 'format', 'png', join(iconset, name), '--out', join(temporary, name)], { stdio: 'pipe' });
    }
    return records;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function generateIcns() {
  const temporary = await mkdtemp(join(tmpdir(), 'markd-icon-generate-'));
  try {
    const iconset = join(temporary, 'MarkD.iconset');
    await mkdir(iconset);
    for (const { name, pixels } of representations) {
      execFileSync('sips', ['-z', String(pixels), String(pixels), join(root, 'build/icon.png'), '--out', join(iconset, name)], { stdio: 'pipe' });
    }
    // Use Apple's encoder rather than the builder's PNG-to-ICNS conversion.
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(root, 'build/icon.icns')], { stdio: 'pipe' });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.platform, 'darwin', 'Icon generation and decoding require macOS sips and iconutil');
  const command = process.argv[2] ?? 'check';
  assert.ok(['generate', 'check'].includes(command), 'Usage: node scripts/icon-assets.mjs [generate|check] [icon.icns]');
  if (command === 'generate') await generateIcns();
  const path = resolve(process.argv[3] ?? join(root, 'build/icon.icns'));
  console.log(JSON.stringify(await validateIcns(path), null, 2));
  console.log('All 10 macOS icon representations decoded at their expected pixel sizes.');
}
