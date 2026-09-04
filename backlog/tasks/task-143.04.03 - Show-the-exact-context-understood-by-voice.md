---
id: TASK-143.04.03
title: Show the exact context understood by voice
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 12:08'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-143.06.01
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-context
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 211000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Show what the current voice session actually captured and what later context delivery did. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The panel renders the exact start brief captured for the active child/coordinator/realtime session, including repository, workhorse, coordinator, board, pane, version, selection/focus freshness, claim, doing, cursor, ambiguity, and truncation.
- [ ] #2 Later semantic/focus/selection/callback entries show attempted timestamp plus delivered, not_delivered, or outcome_unknown from the adapter; the UI never substitutes the publisher's current sample for what the session received.
- [ ] #3 Stale brief, session replacement, disconnected append, uncertain response, and history recovery are labelled against immutable session identity and remain inspectable after Stop.
- [ ] #4 Screen-reader structure, bounded expansion, copy behavior, and freshness language distinguish captured baseline from live delivery outcomes.
- [ ] #5 Module tests prove immutable baseline capture, ordered later outcomes, stale/replaced session labeling, bounded expansion, and retention after Stop; TASK-143.04.07 owns rendered browser coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a framework-neutral src/ui/voice-context contract for an immutable realtime session identity, its exact captured semantic start brief, and typed semantic/focus/selection/callback delivery records. Mirror the established semantic and delivery vocabulary without importing runtime code or inventing a live publisher read.
2. Add one voice-context history owner that copies and freezes every accepted baseline and delivery, keeps entries ordered under the session identity they name, labels replacement/disconnect/stop/recovery explicitly, and retains prior sessions after Stop. Current publisher state never participates in projection.
3. Project the captured baseline and later delivery ledger into bounded collapsed/expanded views with explicit fresh/stale, delivered/not delivered/outcome unknown, recovered, ambiguous, and truncated language. Preserve the exact canonical brief/body as the copy source.
4. Render the panel as a flat semantic-token composition with named baseline and later-delivery regions, definition lists and ordered history, accessible status/detail text, 44px copy and expansion controls, and technical values in the mono role. Use the shared opt-in DOM stack for interactions.
5. Add focused module owners for immutable capture, ordered outcomes, stale/replaced/disconnected/uncertain/recovered labeling, bounded expansion, exact copy behavior, accessible structure, and retention after Stop; leave rendered browser coverage to TASK-143.04.07.
6. Validate focused voice-context tests, both strict TypeScript projects, scoped Oxlint and Oxfmt, repository boundary/inventory owners only if required by new files, frontend build, and git diff --check. Commit only src/ui/voice-context plus this task record; keep acceptance criteria unchecked and status In Progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation ready for independent review. Scope is src/ui/voice-context/** plus this task record.

Design: one UI-owned immutable ledger accepts an exact canonical start brief and typed semantic/focus/selection/callback outcomes under a full child/epoch/workhorse/coordinator/realtime/pane identity. Starting a new identity labels prior active sessions replaced; stop labels only the matching active identity and retains its baseline and entries. Disconnected, outcome_unknown, and recovered records remain inspectable. No method reads live publisher state, so later samples cannot rewrite captured evidence.

AC evidence: #1 contract.ts and projection.ts expose and render repository, identity, board/note, pane, version, distinct focus and selection freshness, claim/doing, cursor, ambiguity, truncation, and the byte-exact canonical copy source. #2 ordered ledger entries render captured and attempted timestamps, attempted/not-attempted, delivered/not_delivered/outcome_unknown, reason, connection, provenance, and exact body. #3 history.ts preserves stale, replaced, stopped, disconnected, uncertain, and recovered evidence under immutable identities. #4 VoiceContextPanel.tsx uses labelled semantic regions, definition and ordered lists, bounded disclosure, 44px Button controls, exact clipboard writes, and polite success/actionable failure announcements. #5 focused history/projection/panel/boundary owners prove immutable capture, stale focus distinct from fresh selection, ordered outcomes, bounded expansion without ledger loss, keyboard/pointer/touch operation, exact copy, replacement, and retention after Stop.

Validation: bun test --isolate src/ui/voice-context = 16 pass / 0 fail / 106 expectations; bunx tsc --noEmit and bunx tsc --noEmit -p tsconfig.frontend.json both exit 0; bunx oxlint src/ui/voice-context exits 0; bunx oxfmt --check src/ui/voice-context reports all 10 files correct; repository boundary and test-inventory owners = 62 pass / 0 fail / 139 expectations; bun run build:frontend succeeds with only the existing chunk-size warning; git diff --check is clean.

Remaining risk is deliberate integration scope: TASK-143.04.06 must supply this closed UI contract from the workbench frame, and TASK-143.04.07 owns real rendered browser coverage. No browser, system, broad module, performance, or full-suite lane was run here.
<!-- SECTION:NOTES:END -->
