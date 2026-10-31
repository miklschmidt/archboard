---
id: TASK-559.31
title: Optional follow-ups from the audit of TASK-549
status: To Do
assignee: []
created_date: '2026-10-31T04:17:00Z'
updated_date: '2026-10-31T20:22:00Z'
labels:
  - follow-up
dependencies: []
parent_task_id: TASK-559
priority: low
ordinal: 1003000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Items the owner's delegate left for the owner to choose. Report: docs/design/task-549-reader-audit.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Show code findings for the open scope in the column, information findings included, and say when no pass exists for the revision (audit rank 7)
- [ ] #2 Show the measures of competing proposals side by side in the reader (audit rank 8, the CLI half is TASK-559.27)
- [ ] #3 Decide Behind: rewire createBehindReading for canonical models, or delete it and the behind field (audit rank 9)
- [ ] #4 Decide OVERVIEW_CROWDED: restore it or remove ADR 0052's claim
- [ ] #5 Show bookmarks and former addresses outside preview
- [ ] #6 Offer Explain on Diagram with nothing selected
- [ ] #7 Make expanded readings stay under 500 ms: 11 of 33 measured take longer, the worst 1448 ms, in the router's greedy pass
- [ ] #8 Fix the message 'The canonical model cannot be read coherently.' on a selected removed module
- [ ] #9 Delete the dormant region placement in blocks and track, about 425 references that no reading reaches
- [ ] #10 Give the current state's summary an edit operation, then replace the root text that reads like a change note
- [ ] #11 Find what sent SIGTERM to server 17842 at 08:07:36 and 09:37:15 on 2026-10-31
- [ ] #12 Decide Thread start, Board transitions, Durable writes and Board move, and the unimplemented whole-tree stop of ADR 0048
- [ ] #13 Lift a door's words above 7 px at the lowest landing (TASK-559.17 criterion 2)
- [ ] #14 Judge the tag ink, APCA Lc 37 to 83 over its gradient
- [ ] #15 Decide the 339 relationships that stay on a frame, and whether feat/relationship-ends b58c99db9 is dropped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Server 17842 stops, resolved on 2026-10-31. The sender of the SIGTERM at 08:07:36, 09:37:15 and 10:35:18 is T3 Code, not a command aimed at the port. My earlier note was wrong. Each agent session runs in a systemd scope with KillMode=control-group. ProviderSessionManager stops a session after 30 idle minutes, and that stops the scope and every process in it. A server that an agent starts runs in that scope. The quiet gaps of this session end 30 minutes before each stop: 07:37:35, 09:07:15, 10:05:17. The server now runs in the user service archboard-17842.service, outside the agent scope. An archboard restart from an agent puts it back in the agent scope. Nothing in archboard needs to change, so drop 'find the SIGTERM sender' from the follow-ups.

The capture script packages/renderer/tests/runtime/support/capture-native-fixture.ts stops with ARCHITECTURE_UNAVAILABLE when the checkout does not hold the example's history. On 2026-10-31 I redrew the request the fixture already holds with the current core instead.
<!-- SECTION:NOTES:END -->
