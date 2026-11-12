# Repository guidelines

MarkD is an Electron/React/TypeScript editor with Vite and Zustand. Use the Node 24 version in `.nvmrc` (minimum 24.19), `npm ci`, and `@types/node` 24 until Electron changes its embedded Node major. Commands are in [README](README.md).

## Local skills

Treat `.agents/skills/` as dependencies. Before matching work, read the complete `SKILL.md`, follow its routing, and load only needed references:

- `context7-mcp`: third-party APIs, configuration and upgrades.
- `vercel-react-best-practices`: renderer React and performance. Ignore Next.js, RSC, server actions, SSR and hydration unless introduced explicitly.
- `playwright-best-practices`: Electron E2E, selectors, waits, traces and test architecture; start with `testing-patterns/electron.md`.
- `better-accessibility`: UI changes/reviews; preserve keyboard access, focus, semantics, names, reduced motion and target sizes.
- `systematic-debugging`: reproduce bugs and establish their root cause before fixing.
- `verification-before-completion`: run fresh proof before claiming success; report unrun checks.

For API-dependent code/configuration, resolve the official library through Context7 and query one focused topic, matching installed versions. If unavailable, say so and use official primary documentation; never silently substitute another major version.

Before security-sensitive Electron changes, consult current Electron docs. Keep context isolation enabled, renderer Node access disabled, preload minimal, and IPC typed/allowlisted. Cover windows/navigation, protocols, file access and permissions; exceptions need current documentation and a documented requirement.

## Discovery and boundaries

Use the codebase-memory graph before broad code search: `search_graph`, `trace_path`, then `get_code_snippet` for an exact name; `query_graph` and `get_architecture` for relationships. Index `markd` only if missing/stale. Text search is for literals, configuration, non-code files or insufficient graph results.

- `src/main/`: lifecycle, windows, storage, logging, IPC.
- `src/preload/`: typed renderer bridge.
- `src/renderer/`: React, domain logic, Zustand and CSS.
- `src/shared/`: cross-process schemas and IPC contracts.
- `scripts/`: development, packaging and smoke checks.
- `docs/`: current guides; `docs/plans/`: pending plans.

Do not hand-edit generated `dist/`, `dist-package/`, `output/` or `test-results/`. See [project notes](docs/project-notes.md) for compatibility and editor invariants.

## Style and verification

Use two spaces, single quotes, semicolons, ES modules and explicit boundary types; no explicit `any`. Components/types use PascalCase, functions/variables camelCase, hooks/stores `useX`; prefer `@/` imports. IPC definitions belong in `src/shared/`.

Use Vitest `__tests__/*.test.ts` for domain/store behavior and Playwright `e2e/*.spec.ts` for Electron workflows. Add regression tests for behavior changes, prioritizing editing, persistence, migration, IPC and export. Before handoff run `npm run typecheck`, `npm run lint` (zero warnings) and relevant tests; rebuild all bundles after shared-contract changes.

Keep commits focused with short imperative subjects. PRs describe user-visible changes, verification, relevant issues/plans and UI screenshots; call out schema, IPC, migration and packaging changes.
