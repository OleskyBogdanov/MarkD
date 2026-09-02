# Repository Guidelines

## Project-Local Agent Skills

Treat the skills committed under `.agents/skills/` as project dependencies. Before acting on a matching task, read the relevant `SKILL.md` completely and follow its routing instructions. Load only the referenced material needed for the current task.

- `context7-mcp`: use for library/framework APIs, configuration, upgrades, and library-dependent code examples.
- `vercel-react-best-practices`: use when writing, reviewing, or refactoring renderer React code or investigating renderer performance. MarkD is a Vite-powered Electron client, so ignore Next.js, React Server Components, server actions, SSR, and hydration guidance unless those technologies are introduced explicitly.
- `playwright-best-practices`: use for `e2e/`, Playwright configuration, Electron workflow tests, flaky tests, selectors, waits, traces, and test architecture. For MarkD E2E work, consult `testing-patterns/electron.md` plus the smallest relevant core references.
- `better-accessibility`: use for renderer UI changes and UI reviews. Preserve complete keyboard operation, visible focus, semantic controls, accessible names, reduced-motion behavior, and usable target sizes.
- `systematic-debugging`: use for bugs, failed tests, build failures, crashes, and unexpected behavior. Establish a reproducible root cause before implementing a fix.
- `verification-before-completion`: use before claiming work is complete or correct. Run fresh commands that directly prove the claim and report any checks that could not be run.

## Current Documentation with Context7

Before generating or changing code/configuration that depends on a third-party API, use the Context7 MCP tools: resolve the official library ID, then query one focused documentation topic at a time. Prefer documentation matching the exact version in `package.json` or the lockfile. This requirement applies especially to Electron, React, Playwright, Vitest, Vite, Zustand, Zod, pdfjs-dist, Motion, react-moveable, and electron-builder.

Do not rely on model memory for version-sensitive APIs or configuration. If Context7 is unavailable in the current session, state that limitation and use the library's official primary documentation as the fallback. Never silently substitute a different major version.

For Electron security-sensitive changes, consult current Electron documentation before modifying `BrowserWindow` or `webPreferences`, preload exposure, IPC validation, navigation/window creation, custom protocols, file access, or permission handling. Keep `contextIsolation` enabled, renderer Node.js access disabled, the preload surface minimal, and IPC channels typed and allowlisted unless current documentation and a documented requirement justify otherwise.

## Codebase Discovery

Use the codebase-memory MCP graph before broad code search:

1. `search_graph` for symbols, routes, types, and definitions.
2. `trace_path` for callers, callees, data flow, and impact analysis.
3. `get_code_snippet` after resolving an exact qualified name.
4. `query_graph` for complex relationships and `get_architecture` for high-level structure.

Use text search only for literals, configuration, non-code files, or when graph results are insufficient. Index the repository first only when the `markd` graph is missing or stale.

## Project Structure & Module Organization

MarkD is an Electron desktop editor built with React and TypeScript. Keep process boundaries explicit:

- `src/main/` owns Electron lifecycle, windows, storage, logging, and IPC handlers.
- `src/preload/` exposes the typed, security-sensitive renderer bridge.
- `src/renderer/` contains React UI, editor features, domain logic, Zustand state, and CSS.
- `src/shared/` holds schemas and IPC contracts used across processes.
- `e2e/` contains Playwright Electron tests; unit tests live beside code in `__tests__/`.
- `scripts/` contains development, packaging, and packaged-app smoke helpers. `docs/plans/` stores implementation plans.

Generated output belongs in `dist/`, `dist-package/`, `output/`, or `test-results/`; do not edit it by hand.

## Build, Test, and Development Commands

Use Node.js 24.19+ and install exact dependencies with `npm ci`. Prefer the Node 24 LTS version pinned in `.nvmrc`; it matches the Node.js major embedded in Electron 44. Keep `@types/node` on the Node 24 line until Electron moves to a newer embedded Node.js major.

- `npm run dev` builds Electron code and starts Vite plus the desktop app.
- `npm run build` compiles main, preload, and renderer bundles.
- `npm run typecheck` runs strict TypeScript checks without emitting files.
- `npm run lint` runs ESLint and fails on warnings.
- `npm test` runs the Vitest unit suite once.
- `npm run test:e2e` builds the app, then runs Playwright serially.
- `npm run package:mac` / `npm run package:win` create platform packages.

## Coding Style & Naming Conventions

Follow the existing style: two-space indentation, single quotes, semicolons, ES modules, and explicit types at process/API boundaries. Use `PascalCase` for React components and types, `camelCase` for functions and variables, and `useX` for hooks/stores. Prefer the `@/` alias for `src/` imports. Keep IPC channel definitions and payload types in `src/shared/`. ESLint enforces TypeScript, React Hooks, React Refresh, and forbids explicit `any`.

## Testing Guidelines

Name unit tests `*.test.ts` under a nearby `__tests__/` directory and end-to-end tests `*.spec.ts` in `e2e/`. Use Vitest for domain/store behavior and Playwright for full Electron workflows. Add regression coverage with behavior changes. No coverage threshold is configured; prioritize critical editing, persistence, migration, IPC, and export paths. Run typecheck, lint, and relevant tests before submitting.

## Commit & Pull Request Guidelines

History currently contains only `Initial MarkD application`, so no formal convention exists. Use short, imperative commit subjects such as `Fix table resize history`. Keep commits focused. Pull requests should explain user-visible behavior, list verification commands, link relevant issues or plans, and include screenshots for UI changes. Call out schema, IPC, migration, or packaging changes explicitly.
