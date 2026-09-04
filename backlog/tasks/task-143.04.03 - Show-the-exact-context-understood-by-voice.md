---
id: TASK-143.04.03
title: Show the exact context understood by voice
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 13:21'
labels: []
dependencies:
  - TASK-143.04.01
  - TASK-143.06.01
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/runtime/codex-coordinator-callbacks
  - src/runtime/codex-realtime
  - src/runtime/codex-semantic-context/tests/canonical-brief.test.ts
  - src/server/canvas
  - src/server/codex-workbench
  - src/shared/codex-browser-gateway
  - src/shared/codex-browser-model
  - src/ui/voice-context
  - src/ui/workbench-transport
  - tests/system/canvas-state/voice-context-producer-contract.test.ts
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

12. Tighten truncated-brief association by validating every canonical identity field that remains exact and exempting only values the real canonical fitter can clip; prove that a truncated brief from another session is refused.

13. Make delivery retention accept only coherent evidence: finite ordered timestamps, nonnegative freshness windows, and attempted/outcome combinations that cannot contradict what the adapter reports.

14. Extend the existing browser-owned voice projection with the immutable captured canonical brief and ordered delivery outcomes required by VoiceContextPanel. Reuse existing publisher and adapter records; do not add another state owner.

15. Replace cumulative disclosure with fixed previous/next windows. Bound body storage and display to the real producer byte contract, and keep copy-failure recovery inside that fixed window model.

16. Pin the presentation parser to canonical bytes produced by codex-semantic-context at the cheapest stable contract, then run focused affected tests, both TypeScript projects, scoped lint and format, and diff checks only.

17. Mint the wire realtime session identity before reading the start semantic brief, make the production semantic input observe that exact identity, and prove the bytes are sent under the same generation without exposing an installed half-session.

18. Extend the existing callback retention record with an authoritative omitted-prefix count, add transport fitter drops to it, and retain plus render an accessible partial-history marker through the voice-context browser adapter.

19. Replace the isolated producer golden with one focused freshBrief-to-voice-context capture/projection contract that proves required parsed fields and byte-exact storage/copy, then run only the authorized focused checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Second rereview remediation is implemented and ready for independent review. TASK-143.04.03 remains In Progress and all acceptance criteria remain unchecked.

Startup identity: the realtime adapter mints the wire session ID before semantic capture and passes it into the existing production semantic capture callback. Production reads the current semantic input once, overrides only coordinator.realtimeSessionId with that minted identity, and calls the existing publisher freshBriefFor path. The adapter installs no temporary generation while capturing. A focused production initialization test proves the canonical brief contains the same wire ID used by thread/realtime/start and retained in the generation.

Omitted history: the existing callback owner now retains an exact-generation omitted-prefix count beside its bounded settled suffix. Production still defaults to CALLBACK_BUFFER_LIMIT 64; the regression injects capacity 2 and sends three records. Browser projection carries permanent owner omissions separately from the combined count. Snapshot fitting increments only the combined transport count. Voice-context history tracks total observed source records and unique retained records, so its accessible partial-history marker reports actual missing evidence, clears when transport-dropped entries arrive, and does not falsely mark an entry the UI retained before the runtime owner evicted it.

Producer/parser contract: the handwritten semantic golden was removed. A single focused browser-free system owner feeds actual freshBrief().brief bytes through voice-context capture and projection, asserts the required parsed fields, and proves the stored and projected copy source remains byte-exact.

Validation: 64 focused tests passed across 12 exact owner files; bunx tsc --noEmit passed; bunx tsc --noEmit -p tsconfig.frontend.json passed; scoped Oxlint passed over all 25 changed non-deleted TypeScript files; scoped Oxfmt passed over the same files; git diff --check passed. No build, browser, broad system, repository policy, stress, load, capacity, performance, tooling, topology, concurrency, or full-suite lane ran.

Remaining risk: rendered browser behavior remains assigned to TASK-143.04.07. The new tests cover the production startup and browser projection seams without taking over that rendered owner.
<!-- SECTION:NOTES:END -->
