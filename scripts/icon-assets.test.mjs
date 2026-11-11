import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { test } from 'node:test';
import { URL } from 'node:url';
import { inspectIcns, validateIcns } from './icon-assets.mjs';

test('macOS packaging uses the validated ICNS without PNG conversion', async () => {
  const config = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(config.build.mac.icon, 'build/icon.icns');
  inspectIcns(await readFile(new URL('../build/icon.icns', import.meta.url)));
});

test('rejects incorrectly doubled Retina PNG payloads', () => {
  for (const [type, pixels] of [['ic13', 512], ['ic14', 1024]]) {
    const bytes = Buffer.alloc(40);
    bytes.write('icns');
    bytes.writeUInt32BE(bytes.length, 4);
    bytes.write(type, 8);
    bytes.writeUInt32BE(32, 12);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 16);
    bytes.writeUInt32BE(pixels, 32);
    bytes.writeUInt32BE(pixels, 36);
    assert.throws(() => inspectIcns(bytes), new RegExp(`${type}: PNG width`));
  }
});

test('Apple decodes every standard icon representation at the correct size', {
  skip: process.platform !== 'darwin',
}, async () => {
  await validateIcns(new URL('../build/icon.icns', import.meta.url).pathname);
});
