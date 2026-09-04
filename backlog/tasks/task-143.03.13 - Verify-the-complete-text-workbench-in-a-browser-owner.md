---
id: TASK-143.03.13
title: Verify the complete text workbench in a browser owner
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-09-04 13:53'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the existing exact-version Codex 0.151.0 production fake and server fixture to start one owned canvas without resolving or spawning PATH Codex.
2. Add one focused real-browser owner that opens the production shell at 1440x900, expands the integrated workbench, creates the pane workhorse thread, sends one turn, observes the ordinary and dynamic approval disclosures, settles a rendered decision, and proves the Excalidraw pane remains mounted with its seeded element.
3. Append that owner after the current 16-owner executable baseline in BROWSER_TEST_PATHS and the package lane, then document the owner narrow rendered-product contract. Keep module-owned matrices, startup failures, topology, performance, stress, process concurrency, and combinatorial visual modes out of this browser owner.
4. Run the owner through the focused serial-browser adapter, the focused repository inventory and static owners for changed registration and docs, applicable type, lint, and format checks, plus clean diff and process audits. Leave the task In Progress for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the narrow production browser owner against the fixed executable baseline. Reused the exact Codex 0.151.0 production fake and server fixture; the owner claims each explicit one-shot browser command lease through the current rendered pane transport, while create, send, ordinary decline, approval disclosure, and all assertions run through the rendered browser UI. It verifies one ordinary command-execution approval, one dynamic create-thread approval, the authoritative ordinary reverse response, a still-mounted seeded Excalidraw pane, exact version probes, one app-server spawn, and clean browser logs.

Registration appends the owner after the existing 16 normal browser owners, so this fixed base moves from 16 to 17. The task acceptance text expecting a 19-to-20 baseline is stale on this branch; existing focused owners retain startup/login, renderer, queue, approval-family, reconciliation, focus, shell-matrix, fullscreen, cleanup, performance, and stress contracts instead of duplicating them here.

Validation: focused serial browser owner passed in 2.7s (23 assertions); focused repository inventory passed 54/54; root and frontend TypeScript passed; scoped Oxlint and Oxfmt passed; git diff --check passed; normal inventory reports 17 owners; no test-owned browser, server, or Codex processes remained. Left In Progress with acceptance criteria unchecked for independent review.

Final post-format browser rerun passed in 2.5s with the explicit 1440x900 viewport assertion (24 assertions total).
<!-- SECTION:NOTES:END -->
