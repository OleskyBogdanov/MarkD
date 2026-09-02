/* global console */
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));

const allowed = new Map([
  ['boolean@3.2.0', 'electron-builder 26 -> @electron/get -> global-agent'],
  ['glob@7.2.3', 'electron-builder 26 -> @electron/asar and electron-winstaller'],
  ['inflight@1.0.6', 'electron-builder 26 -> @electron/asar -> glob'],
  ['rimraf@2.6.3', 'electron-builder 26 -> electron-winstaller -> temp'],
]);

const deprecated = new Map();

for (const [packagePath, metadata] of Object.entries(lockfile.packages ?? {})) {
  if (!metadata?.deprecated || !metadata.version) {
    continue;
  }

  const nodeModulesMarker = 'node_modules/';
  const markerIndex = packagePath.lastIndexOf(nodeModulesMarker);
  const packageName = metadata.name ?? packagePath.slice(markerIndex + nodeModulesMarker.length);
  deprecated.set(`${packageName}@${metadata.version}`, metadata.deprecated);
}

const unexpected = [...deprecated.keys()].filter((dependency) => !allowed.has(dependency));
const stale = [...allowed.keys()].filter((dependency) => !deprecated.has(dependency));

if (unexpected.length > 0 || stale.length > 0) {
  if (unexpected.length > 0) {
    console.error('Unexpected deprecated dependencies:');
    for (const dependency of unexpected) {
      console.error(`- ${dependency}: ${deprecated.get(dependency)}`);
    }
  }

  if (stale.length > 0) {
    console.error('Stale deprecation allowlist entries (remove them):');
    for (const dependency of stale) {
      console.error(`- ${dependency}: ${allowed.get(dependency)}`);
    }
  }

  process.exitCode = 1;
} else {
  console.log(`Deprecated dependency allowlist is exact (${deprecated.size} known electron-builder 26 packages).`);
}
