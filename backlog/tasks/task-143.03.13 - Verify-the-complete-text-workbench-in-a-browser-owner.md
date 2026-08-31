---
id: TASK-143.03.13
title: Verify the complete text workbench in a browser owner
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 14:27'
labels: []
dependencies:
  - TASK-143.03.11
  - TASK-143.03.12
  - TASK-143.06.06
  - TASK-143.06.08
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - tests/system/browser/codex-text-workbench.test.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/browser/run-browser-lane.ts
  - tests/system/repository-policy/test-inventory.test.ts
  - package.json
  - AGENTS.md
  - docs/agents/test-suite.md
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 227000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own and register the canonical controlled browser owner for the complete text workbench. This is the first serialized browser-inventory edit and uses an exact-version protocol fake so unrelated browser owners never spawn PATH Codex. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The controlled child proves missing or wrong binary, locked home, backoff or stopped, config or storage mismatch, signed out, API-key, hosted ChatGPT, explicit Bedrock API-key, explicit Bedrock access-key with optional session token login, refused profile or environment setup, logout, and command-before-ready.
- [ ] #2 At 1440x900 and the Flip viewport it covers one and two panes, expanded, collapsed, and fullscreen, light, dark, and high contrast, reduced motion, keyboard, accessibility order, 44px targets, and unchanged Excalidraw.
- [ ] #3 It covers all 19 item renderers, submit, steer, interrupt, pending, refused, unknown, and reconciled commands, all six queue operations with Edit or update and Cancel or delete labels, settings, all seven ordinary approval families, all three dynamic create, fork, and send approval effects, exact effect disclosure, focus return, and fullscreen Stop.
- [ ] #4 No unexpected log, orphan, focus leak, duplicate request, optimistic placeholder, retargeted command, stale dynamic effect, reused approval, or approval_required resume is accepted. Approve, decline, expiry, cancellation, browser disconnect, lost response, child exit, and late authoritative reconciliation are exercised.
- [ ] #5 TASK-143.06.08 first reconciles the existing executable and documentation baseline to 19. This task then appends exactly owner 20 across BROWSER_TEST_PATHS, package lane, repository inventory, AGENTS.md, and docs/agents/test-suite.md.
<!-- AC:END -->
