---
id: TASK-143.03.13
title: Verify the complete text workbench in a browser owner
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-09-04 14:02'
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
Own and register one canonical controlled real-browser owner for the text workbench. Reuse the exact Codex 0.151.0 protocol fake with the production server composition. Prove one short rendered create, send, approval-disclosure, and ordinary-decision flow while Excalidraw remains mounted. Existing focused owners retain startup/login recovery, render matrices, timeline items, queue operations, approval-family matrices, command reconciliation, focus, fullscreen, cleanup, performance, topology, and stress coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The owner explicitly selects the exact Codex 0.151.0 protocol fake, proves exact --version probes and one strict app-server spawn, and never resolves or spawns PATH Codex.
- [x] #2 Through a headless real browser at 1440x900 and the production server boundary, the owner expands the one-pane workbench, creates a workhorse thread, fills and sends the composer, and uses the rendered ordinary Decline control.
- [x] #3 The rendered flow exposes one ordinary command-execution approval and one dynamic create-thread approval with their concrete effects, and the ordinary decision reaches the fake as the authoritative reverse response.
- [x] #4 The seeded Excalidraw pane remains the same mounted canvas with its element, browser console and page errors stay empty, and test-owned browser, server, fake, socket, vault, and temporary resources are reaped.
- [x] #5 Against fixed base 1451e58c3e1f38a00238d5b20667b9b4f2e3f171, the normal executable browser inventory moves from 16 to 17 by appending this owner exactly once in BROWSER_TEST_PATHS and test:serial-browser; repository inventory proves no missing, duplicate, reordered, or normal/opt-in-overlap owner, and docs describe the narrow ownership without a copied count.
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

Final integration validation on codex/task-143-144-workbench: the focused serial-browser owner passed 1/1 with 24 assertions in 2.89s; repository inventory passed 54/54; root and frontend TypeScript passed; scoped Oxlint passed; the executable inventory contains 17 unique normal owners with this owner last and no opt-in overlap. The adapter cleanup completed, and a process audit found no owner, browser-lane, or controlled-fake residue.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the narrow controlled real-browser owner for the production text workbench. It proves exact Codex 0.151.0 fake selection, rendered create/send/Decline and approval disclosure, the authoritative reverse response, and an unchanged mounted Excalidraw pane. Registered it as normal browser owner 17 and verified it through the focused browser adapter, repository inventory, TypeScript, lint, diff, and cleanup checks.
<!-- SECTION:FINAL_SUMMARY:END -->
