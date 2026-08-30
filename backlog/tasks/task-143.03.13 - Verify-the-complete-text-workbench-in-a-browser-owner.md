---
id: TASK-143.03.13
title: Verify the complete text workbench in a browser owner
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 17:27'
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
- [ ] #1 The controlled child proves missing/wrong binary, locked home, backoff/stopped, config/storage mismatch, signed-out, API-key, hosted ChatGPT, explicit Bedrock API-key, explicit Bedrock access-key/session-token login, refused profile/environment setup, logout, and command-before-ready.
- [ ] #2 At 1440x900 and Flip viewport it covers one/two-pane, expanded/collapsed/fullscreen, light/dark/high-contrast, reduced motion, keyboard, accessibility order, 44px targets, and unchanged Excalidraw.
- [ ] #3 It covers all 19 item renderers, submit/steer/interrupt, pending/refused/unknown/reconciled commands, all six queue operations and Edit/update + Cancel/delete labels, settings, forms/approvals, focus return, and fullscreen Stop.
- [ ] #4 No unexpected logs, orphan, focus leak, duplicate request, optimistic placeholder, or retargeted command is accepted; lost response and late authoritative reconciliation are exercised.
- [ ] #5 TASK-143.06.08 first reconciles the existing executable/docs baseline to 19. This task then appends exactly owner 20 across BROWSER_TEST_PATHS, package lane, repository inventory, AGENTS.md, and docs/agents/test-suite.md.
<!-- AC:END -->
