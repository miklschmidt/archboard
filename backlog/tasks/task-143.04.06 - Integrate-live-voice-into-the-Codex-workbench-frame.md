---
id: TASK-143.04.06
title: Integrate live voice into the Codex workbench frame
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 13:54'
labels: []
dependencies:
  - TASK-143.03.11
  - TASK-143.04.02
  - TASK-143.04.03
  - TASK-143.04.04
  - TASK-143.04.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-frame
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend only `src/ui/workbench-frame` to fill its optional voice slot with controls, context, transcript, and spoken-approval presentation. Preserve the text workbench as canonical fallback; fullscreen projection is a separate shell leaf.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Voice ready/start/active/recovering/stopping/failure states occupy the approved regions without hiding text composer, ordinary approvals, queue, board status, source thread link, or Stop.
- [ ] #2 The bound source link remains visible and immutable across pane focus, one/two panes, collapse/expand, and frame-level failure; terminal stop restores the text-only layout with no stale slot content.
- [ ] #3 Frame tests at src/ui/workbench-frame/tests/voice-composition.test.ts cover every voice-slot state, focus/log order, both themes, reduced motion, keyboard/pointer/touch, and no duplicate state owner.
- [ ] #4 This leaf owns no browser inventory or real-audio smoke; deterministic integration belongs to TASK-143.04.07 and real acceptance to TASK-143.04.09.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the workbench-frame public contract with one optional, caller-owned voice slot that carries the existing VoiceSession, immutable VoiceContextHistory evidence, canonical realtime transcript records and their sibling links. Keep lifecycle, media, transcript ordering, and evidence retention in their existing owners.
2. Compose VoiceControls, VoiceContextPanel, and VoiceTranscript inside the expanded active-pane frame. Give VoiceControls sole voice-state announcement ownership, keep the text timeline/composer and operations visible, and remove the slot completely when the caller withdraws it.
3. Project the current application-wide ordinary approval card through the existing workbench approval projection and place VoiceSpokenApproval immediately above the unchanged WorkbenchApprovals surface when authoritative spoken state exists.
4. Add one focused voice-composition owner for reachable slot states, interaction routing, immutable source identity, log/focus order, slot removal, and structural no-second-owner facts without theme/input cross-products.
5. Run the focused workbench-frame owners, root and frontend TypeScript, scoped Oxlint/Oxfmt, frontend build, and diff/tracked-state checks. Keep the task In Progress with acceptance criteria unchecked for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the caller-owned optional voice slot entirely within src/ui/workbench-frame. The frame now composes the existing controls, transcript, context evidence, and spoken approval presentation without creating a second session or state owner. It captures immutable source-pane identity, shows the exact bound workhorse thread, fails closed on binding drift, supplies real frame-owned transcript cross-links, and removes the voice presentation when the authoritative session reaches stopped.

Added focused mounted coverage for canonical text-surface preservation, command routing, reachable voice states, sole announcement ownership, immutable source identity across pane focus and frame failure, binding mismatch, transcript link targets and order, spoken approval adjacency and decision ownership, terminal stop cleanup, and explicit slot withdrawal.

Validation: bun test --isolate src/ui/workbench-frame/tests/voice-composition.test.tsx src/ui/workbench-frame/tests/frame-layout.test.tsx passed 19 tests with 236 assertions; root and frontend TypeScript passed; scoped Oxfmt and Oxlint passed; the frontend build passed; git diff --check passed. The frontend build retained its existing unresolved runtime CSS and chunk-size advisory warnings. An initial non-isolated two-file test invocation exposed the known per-file Happy DOM teardown collision, so the final owner command used Bun isolation and passed cleanly.

The task remains In Progress with every acceptance criterion unchecked for independent review. Browser, fullscreen-shell, and real-audio evidence remain with the downstream owners named by the task.
<!-- SECTION:NOTES:END -->
