---
id: TASK-143.03
title: 'Build the text, tools, queue, and approvals workbench UI'
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-09-04 09:50'
labels: []
dependencies:
  - TASK-143.08.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for browser transport, pinned assistant-ui useExternalStoreRuntime/providers, thread-link selection, owned timelines/composer/queue/approvals, coordinator disclosure, board status, text frame, shell integration, and the canonical text browser owner delivered by TASK-143.03.01-.13.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The thirteen leaves compose one workhorse-first desktop workbench; @assistant-ui/react 0.15.17 supplies only useExternalStoreRuntime, AssistantRuntimeProvider, ReadonlyThreadProvider, and assigned headless message/composer primitives. Archboard owns every rendered component and app-server state remains authoritative.
- [ ] #2 Every executable action names its link/turn/request target; all empty/loading/progress/unavailable/stale/prior-epoch/reconnect/approval/queue/interruption/completion/failure/recovery/unknown states have one module owner and test path.
- [ ] #3 Ordinary approvals render the broker identity and remain separate from voice eligibility; root dependency, module, shell, and browser-inventory edits are explicitly serialized.
- [ ] #4 The text browser owner proves desktop one/two-pane/fullscreen, collapsed/expanded, themes, keyboard, logs, focus, reduced motion, screen reader, Samsung Flip touch, exact targeting, and unchanged Excalidraw.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-04 serialized root dependency edit (AC #3), branch codex/task-143-03-dom-testing on 1cc5f345.

Packages, exact versions, all devDependencies (bunfig.toml [install] exact = true): happy-dom 20.14.0, @happy-dom/global-registrator 20.14.0, @testing-library/react 16.3.3, @testing-library/dom 10.4.1, @testing-library/user-event 14.6.7. user-event installed cleanly against React 19.2.8 and bun 1.4.0 (no dependencies, one peer on @testing-library/dom), so it was kept rather than skipped.

Why: rendered UI owners were hand-rolling DOM. src/ui/workbench-runtime/tests/minimal-dom.ts is 192 lines of TestNode/TestElement and every other src/ui/*/tests owner renders through renderToStaticMarkup, which cannot answer focus, real pointer sequences, or accessible names.

Opt-in mechanism: happy-dom is NOT registered suite-wide. bunfig.toml's preload stays the repository-policy wall-clock reporter and server/process/system owners keep a plain Node-like global, because a suite-wide document would change what those owners prove. src/ui/dom-testing is a proper UI module root exporting registerHappyDom(), unregisterHappyDom(), and loadRenderedUiTools(). That shape is the one docs/agents/boundaries.md permits: a module's tests/ folder may import support only from its own owner and product behavior only through module-root entrypoints, so a shared tests/support/ helper would have been unreachable from src/ui/<module>/tests. A rendered owner writes: registerHappyDom(); const { render, screen, userEvent } = await loadRenderedUiTools(); afterAll(unregisterHappyDom). The loader exists because @testing-library/user-event captures globalThis.document while its module body evaluates and ES imports run before any statement in the importing file, so a static import binds to the document-free Node global; the loader imports both libraries after registration and refuses to run before it.

Proving owner: src/ui/dom-testing/tests/mounted-button.test.ts mounts the real @/ui/button Button, clicks it through user-event, and asserts the accessible name and resulting focus. Existing hand-written harnesses were not migrated; that stays with their leaf owners. Documented in docs/agents/test-suite.md under 'Rendered UI owners'.

No repository-policy allowlist was extended. The assistant-ui audit (tests/system/repository-policy/assistant-ui-imports.test.ts) still passes unchanged: @testing-library/react declares react, react-dom and @testing-library/dom as peers so nothing nested resolves, bun.lock keeps exactly one react@19.2.8 and one react-dom@19.2.8 record, no direct Radix declaration was added, and the shared @babel/runtime stayed at 7.29.7 because ^7.12.5 is satisfied by the existing record. bun.lock gains only the five packages and their closure; the sole collateral change is hoisting (pretty-format@27 wants ansi-regex ^5 / ansi-styles ^5, so 5.0.1/5.2.0 hoisted and the previous 6.x records were re-keyed as strip-ansi/ansi-regex and wrap-ansi/ansi-styles, every declared range still satisfied).

Verification: bun install clean and idempotent; bun run type-check both projects 0; bun run lint 0; bun run fmt:check 0; bun test --isolate src/ui 293 pass / 0 fail / 4548 assertions; bun run test:repository 122 pass / 0 fail / 1060 assertions; bun run test:modules 1968 pass / 0 fail / 18635 assertions; bun run test:system (serial) 324 pass / 0 fail / 4904 assertions, confirming the preload and global surface are unchanged for non-UI owners. Commits: 2357e9cb (build), 6ef30009 (docs).
<!-- SECTION:NOTES:END -->
