---
id: TASK-355
title: A recording's narration starts from a clean context
status: Done
assignee: []
created_date: '2026-09-28 02:23'
updated_date: '2026-10-11 13:50'
labels:
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 596000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 while recording README videos. Recordings ran back to back on one Archboard server (the example vault): first the pull-request walkthrough of Web shop@Queued fulfilment, then the newcomer walkthrough of Inventory service. The newcomer video's first step, which is about Checkout API reserving items, was narrated with 'Place order now saves the order, starts payment, and queues the remaining', a sentence from the previous recording's step 2 that no step of the newcomer walkthrough contains. The same newcomer walkthrough recorded on a freshly started server was narrated cleanly. The voice lines of a recording also appear afterwards in the agent bar's conversation panel under 'Voice · ended'. A recording narrated for somebody else carries what an earlier, unrelated recording said.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recording made right after another recording on the same server narrates only from its own walkthrough and board
- [x] #2 What a recording's voice said does not reach a later recording's voice
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 audit: same bug as TASK-301 (f4827cb35, Done) and TASK-373 (9d4830c63, Done): a voice start replaces a coordinator that already carried a voice session (freshCoordinator, src/server/archboard/lib/codex-workbench-realtime-actions.ts) and each tab, including a recording's headless page, has its own coordinator and voice. TASK-301's notes record two real recordings in a row on one server, the second narrating from its own step 1. Verified: codex-workbench-realtime-actions.test.ts ('a voice start after a finished session runs on a fresh coordinator') and codex-coordinator/tests/retire.test.ts pass. Not re-run: a real two-recording session.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Already fixed by TASK-301 and TASK-373: a recording's voice start gets a fresh coordinator, and each tab has its own coordinator and voice, so a later recording starts from its own walkthrough and board and hears nothing the earlier voice said. Verified 2026-10-11 with codex-workbench-realtime-actions.test.ts and retire.test.ts; the real two-recording run is TASK-301's recorded evidence, not repeated here.
<!-- SECTION:FINAL_SUMMARY:END -->
