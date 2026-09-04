---
id: TASK-143.04.03
title: Show the exact context understood by voice
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 12:29'
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

7. Review remediation supersedes the parallel session lifecycle in the earlier plan: derive identity, binding, and status from the existing public voice-session view, and let voice-context own only immutable evidence retention plus presentation.
8. Make the exact canonical semantic brief string the single baseline source. Parse and validate its complete lossless semantic_context shape locally for display, including workhorse turnId, one authoritative freshness object, pane.focused, selection IDs, description, child, and thread-link state.
9. Require each delivery to carry authoritative adapter order plus captured/attempted/fresh-until values. Insert deterministically or refuse duplicates so semantic, focus, selection, and callback records render in source order with attempt-time fresh/stale language and no current publisher read.
10. Replace Show all disclosures with bounded windows/pages and remaining counts while preserving the full ledger. On copy failure, reveal the exact target automatically before directing manual copy.
11. Remove duplicated boundary/lint owners and the local 500-line assertion, retaining only a focused no-runtime/deep-import contract if it catches a gap not owned by repository checks. Rerun only the requested focused, type, scoped lint/format, relevant repository, build-if-needed, and diff gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation ready for independent rereview. Scope is src/ui/voice-context/** plus this task record.

Design: voice-context retains immutable evidence supplied by the existing public voice-session owner; it does not mint session identity or transition lifecycle. The byte-exact canonical semantic_context string is the sole baseline source and is locally validated against its complete current shape. Structured display is derived from those bytes, including the full workhorse turn, pane focus, selection, freshness window, description, child, and thread-link fields. Valid byte-capped briefs remain accepted when identity-shaped display fields are clipped; the stable session key and stopped/replaced status derive from VoiceSessionView.

Delivery evidence carries either a semantic feed sequence or one authoritative adapter-ledger position plus captured, fresh-until, and attempted timestamps. History sorts deterministically within one source stream and refuses duplicate positions or mixed streams. Projection reports fresh or stale at attempt and preserves exact delivered, not-delivered, uncertain, disconnected, and recovered bodies without consulting current publisher state.

The panel uses bounded session, entry, brief, and body windows with explicit remaining counts and collapse controls. Clipboard writes use the immutable canonical bytes; failure expands the exact target before giving manual-copy guidance. The redundant local boundary owner was removed because repository policy already enforces the boundary and file-size rule.

Validation: focused voice-context tests 14 pass, 0 fail, 84 expectations; both TypeScript projects pass; scoped Oxlint and Oxfmt pass; repository boundary and inventory owners 62 pass, 0 fail, 139 expectations; frontend build passes with only existing asset and chunk-size warnings; git diff --check is clean.

Remaining integration risk is deliberate: TASK-143.04.06 must map the existing semantic sequence or adapter inspect-ledger order into this closed UI contract, and TASK-143.04.07 owns real rendered-browser coverage. No browser, broad, system, performance, stress, load, capacity, topology, or concurrency lane was run.
<!-- SECTION:NOTES:END -->
