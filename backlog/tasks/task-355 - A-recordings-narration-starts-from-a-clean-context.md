---
id: TASK-355
title: A recording's narration starts from a clean context
status: To Do
assignee: []
created_date: '2026-09-28 02:23'
updated_date: '2026-09-28 14:48'
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
- [ ] #1 A recording made right after another recording on the same server narrates only from its own walkthrough and board
- [ ] #2 What a recording's voice said does not reach a later recording's voice
<!-- AC:END -->
