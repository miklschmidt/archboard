---
id: TASK-143.06
title: Keep the linked workhorse current with semantic board changes
status: Done
assignee: []
created_date: '2026-08-30 13:34'
updated_date: '2026-09-03 22:05'
labels: []
dependencies:
  - TASK-143.08.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for one semantic context publisher, exact linked-workhorse delivery, and bounded removal of legacy server/runtime, control client, CLI contract, tests/fixtures, timing, and current documentation through TASK-143.06.08. Historical ADR/research remains evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Significant human/mixed board changes reach only the exact current executable thread link with one developer/input_text injection attempt; agent-only/cosmetic changes stay silent.
- [x] #2 Settled change, focus, selection, and fresh-brief ports come from one publisher without a second settle timer, board snapshot, target selector, or blind retry.
- [x] #3 The obsolete control socket, environment switches, routes, CLI, schemas, tests, support, timings, and current documentation are removed in serialized leaves without erasing historical decisions/research.
- [x] #4 Unbound/unavailable/prior-epoch/child-exit/lost-response states expose exact not_delivered or outcome_unknown reasons through the replacement graph.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish the sole semantic context publisher in TASK-143.06.01, reusing the existing settle boundary and exposing settled change, focus, selection, and fresh-brief ports without a second timer or board snapshot.
2. Compose TASK-143.06.02 with the explicit pane-to-workhorse link and private package-local stdio session so a qualified human or mixed semantic event reaches only that exact executable thread through one developer/input_text inject_items attempt; keep agent-only and cosmetic events silent.
3. Preserve the delivery graph outcomes and refusal reasons for unbound, unavailable, prior-epoch, child-exit, stale, and lost-response states, with no selector, fallback, or retry.
4. Exercise the existing focused production composition owner for the live human-delivery and silence boundary, then reconcile its result with the publisher and exact-delivery leaves.
5. Retire the legacy control client, runtime/server routes, CLI/schema contract, environment support, timing names, and current runnable guidance in serialized leaves while preserving historical ADR and research evidence. Finalize only after TASK-143.08.01 and all eight leaves are Done and the parent evidence maps each acceptance criterion to an objective owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Roll-up finalization evidence at canonical HEAD ea09607c5fcc8e177f9e334428c4fe2e212ebcdb: TASK-143.06.01 final evidence proves one settled semantic publisher with immediate focus, selection, and fresh-brief ports, no second settle timer or board snapshot. TASK-143.06.02 proves exact linked-thread delivery of one developer/input_text item, no target selector, fallback, or retry, and delivered/not_delivered/outcome_unknown outcomes for the required refusals and lost response. TASK-143.06.04 supplies the direct production owner evidence: one human change reached one private stdio thread/inject_items delivery and agent-only change stayed silent. TASK-143.06.03 through .08 finalize the serialized retirement of the control client, runtime/routes, CLI contract, environment support, timing names, and current docs while preserving historical ADR/research. Backlog CLI confirms all eight direct children and dependency TASK-143.08.01 are Done, with no recursive children.

Attempted current-head rerun: bun test --isolate tests/system/canvas-state/codex-workbench-production.test.ts could not start because node_modules/@excalidraw/excalidraw/dist/prod is absent in this checkout. It made no product assertion; accepted direct production evidence is therefore cited from TASK-143.06.04 rather than treated as a current green run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the semantic-context delivery roll-up. Accepted child evidence proves one publisher, one exact linked-workhorse developer/input_text injection for qualified human changes, silence for agent-only or cosmetic changes, explicit delivery outcomes, and removal of the retired control-socket contract. The focused production rerun was unavailable because this checkout lacks the Excalidraw bundle; the finalization relies on TASK-143.06.04's accepted direct production evidence and the completed serialized leaves.
<!-- SECTION:FINAL_SUMMARY:END -->
