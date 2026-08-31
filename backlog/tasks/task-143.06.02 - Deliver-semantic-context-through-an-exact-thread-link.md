---
id: TASK-143.06.02
title: Deliver semantic context through an exact thread link
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 16:29'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.06.01
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-thread-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver settled semantic context to the exact executable workhorse link through the typed session and expose delivery outcomes. It performs one guarded inject_items attempt and owns no target selector.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Immediately before delivery, the module revalidates child, epoch, pane link, loaded membership, controllability, thread status, semantic cursor, and origin; agent-only/cosmetic or stale events do not send.
- [x] #2 The payload is exactly one developer message with one input_text part using the canonical context encoding; it starts no turn and targets no coordinator or recent thread.
- [x] #3 Each event is attempted at most once and settles delivered, not_delivered with reason, or outcome_unknown on lost response; there is no fallback steer, retry, or alternate thread.
- [x] #4 Tests cover unbound/notLoaded/uncontrollable/systemError/prior-epoch/child-exit, link change during delivery, duplicate event, stale cursor, lost response, and inspectable outcome.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a public exact-thread semantic delivery port with immutable event records, deterministic refusal reasons, and no target selector.
2. Compose the existing semantic publisher, thread-link/epoch authorities, owned child lifecycle, session threadInjectItems method, and canonical codex-instructions injection builder at one guarded delivery boundary.
3. Revalidate all current child/epoch, pane/link/provenance, loaded/controllable/status, semantic cursor/origin, and event-identity conditions immediately before the single write; settle each event once as delivered, not_delivered, or outcome_unknown.
4. Add focused fake-port race tests for every requested refusal, duplicate/stale event, link/child changes during delivery, and lost responses; run only scoped type, lint, format, and module tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final verification: fixed range 34a37f9d5a0ea0a9a87b1843d6645a58c49c6a92..0cb1c282eb5b61e87908816984af82113c42db91 is review-clean. The focused delivery suite passed 20 tests and 70 expectations under archboard-task143062-finalization-focused.service with explicit cwd, printed cgroup, MemoryMax=6G, and MemorySwapMax=1G. AC1 is covered by the refusal/revalidation matrix for unbound, not-loaded, uncontrollable, system-error, child/epoch, link-change, origin, cosmetic, stale-event, focus, and cursor cases. AC2 is covered by the exact one developer message/input_text payload assertion. AC3 is covered by duplicate coalescing and delivered/not-delivered/outcome-unknown response tests. AC4 is covered by the requested refusal, duplicate, stale-cursor, lost-response, and inspectable-outcome tests. Type-check, scoped Oxlint, and scoped Oxfmt checks also passed. The repository-boundary 6G+1G OOM result remains preserved and was not rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Finalized the exact-thread semantic delivery leaf after review-clean remediation. The fixed range adds live ordering and freshness guards, exhaustive event/context validation, correct focus and claim semantics, and first-seen inspection ordering; focused validation passed 20 tests/70 expectations plus type, lint, and format checks. The known repository-boundary 6G+1G OOM limitation remains documented and is not reported as passing.
<!-- SECTION:FINAL_SUMMARY:END -->
