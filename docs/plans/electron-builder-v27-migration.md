# electron-builder v27 migration gate

Keep production packaging on the latest verified stable `electron-builder` 26 release until all of these conditions are true:

- electron-builder v27 is published as stable rather than alpha or beta;
- its npm dependency graph no longer installs the deprecated Squirrel/`electron-winstaller` chain for an NSIS-only project;
- macOS arm64 packaging, Windows x64 NSIS packaging, Electron E2E tests, and packaged-app smoke tests pass in CI;
- signing, notarization, application icons, and release credentials are available for production artifacts.

## Migration procedure

1. Create an isolated branch and run `electron-builder migrate-schema --dry-run` before changing configuration.
2. Apply the documented v27 schema changes:
   - remove the redundant `asar: true` value because ASAR is the default;
   - move signing-related macOS values under the v27 `mac.sign` structure;
   - keep the hardened Electron fuse configuration enabled;
   - add `ignoredProductionDependencies` for dependencies already bundled into renderer/preload output, while retaining `zod` for the non-bundled main process.
3. Reinstall from an empty `node_modules` directory with `npm ci` and run `npm run deps:deprecated`. Do not replace transitive packages with npm overrides to silence warnings.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run package:mac`, and the Windows packaging job.
5. Inspect the resulting ASAR contents, verify Electron fuses, and launch the signed packaged application on clean supported macOS and Windows machines.

Do not merge the migration while any verification gate above is missing. Forge 8/MSIX and electron-builder prereleases remain evaluation options, not production replacements.
