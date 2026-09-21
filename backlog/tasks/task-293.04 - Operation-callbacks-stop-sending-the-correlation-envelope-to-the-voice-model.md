---
id: TASK-293.04
title: Operation callbacks stop sending the correlation envelope to the voice model
status: Done
assignee:
  - '@claude'
created_date: '2026-09-21 02:09'
updated_date: '2026-09-21 03:07'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-293
priority: medium
ordinal: 511000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Terminal workhorse outcomes already run a coordinator turn (TASK-291), but accepted, queued, started, progress and attention are still appended to the live voice session as the full callback JSON (deliverThroughVoice). The first three repeat what delegate_to_workhorse already answered the coordinator (mode started or queued, the turn id, the queued submission id), and progress is readable through inspect_workhorse. Attention is different: the workhorse needs the user, so somebody has to decide what they hear. Independent of the pane work; can land at any time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 accepted, queued, started and progress callbacks are recorded and delivered to nobody while voice is live
- [x] #2 An attention callback runs the coordinator the way a terminal outcome does, with the same busy-coordinator fallback, so the coordinator decides what the user hears
- [x] #3 No code path appends a callback envelope to the voice session, and a focused owner proves it for every operation type
- [x] #4 DESIGN.md states which callbacks go where
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. deliver.ts: while a voice generation is live an operation callback that is not terminal is recorded and told to nobody (reason recorded_only); a terminal one runs the coordinator through the TASK-291 port, or is injected into its thread when the host has no such port. deliverThroughVoice is left to pane news alone.
2. Rewrite the three tests that owned the old routing; document the rule in DESIGN.md and the authored contracts document.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
attention was already in the terminal set since TASK-291, so AC 2 needed no change beyond its fallback: a terminal outcome on a host with no coordinator-turn port used to be appended to the voice session as the envelope and is now injected into the coordinator thread, the same fallback a busy coordinator gets.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
While voice is live accepted, queued, started and progress callbacks are recorded not_delivered with reason recorded_only, and terminal outcomes (attention included) run the coordinator or are injected into its thread. No code path sends callback bytes through thread/realtime/appendText any more; the only thing appended to a voice session by this module is pane news. Verified: the coordinator-turn test proves each non-terminal type reaches neither the voice session, the coordinator turn port nor an injection; the lifecycle test proves all eight operation types and three semantic kinds leave zero voice appends on a host without the turn port; lint, fmt, type-check, modules 3451 pass, system 169 pass, serial browser lane 19 pass. DESIGN.md and the authored contracts document state which callback goes where.
<!-- SECTION:FINAL_SUMMARY:END -->
