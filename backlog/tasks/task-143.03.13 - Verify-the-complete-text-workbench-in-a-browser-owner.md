---
id: TASK-143.03.13
title: Verify the complete text workbench in a browser owner
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:34'
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
- [ ] #1 The controlled child implements only the exact decoded 0.151.0 methods/events needed by the text owner and proves missing/wrong binary, locked home, spawn/backoff/stopped, initialize/config/storage mismatch, signed-out/API-key/ChatGPT/Bedrock login/logout, and command-before-ready.
- [ ] #2 At 1440x900 and the Flip viewport, the owner covers one/two-pane, expanded/collapsed/fullscreen, light/dark/high-contrast, reduced motion, keyboard, accessibility-tree names/logical order, 44px targets, and unchanged Excalidraw.
- [ ] #3 It covers all 19 item renderers, submit/steer/interrupt, draft pending/refused/unknown/reconciled, queue, settings pending/refused/unknown/reconciled, multi-form approvals, off-focus request targeting, focus return, and active fullscreen Stop.
- [ ] #4 No unexpected browser/server logs, orphan child, focus leak, duplicate request, optimistic placeholder, or retargeted command is accepted; lost response and late authoritative reconciliation are directly exercised.
- [ ] #5 This task appends exactly one owner to BROWSER_TEST_PATHS, package test:serial-browser, repository inventory, count-bearing AGENTS/test-suite docs, and updates the canonical count from 19 to 20.
<!-- AC:END -->
