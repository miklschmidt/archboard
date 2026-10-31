---
id: TASK-559.23
title: Make History and comparison readable
status: To Do
assignee: []
created_date: '2026-10-31T03:27:00Z'
labels:
  - frontend
  - board
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 995000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner could not use History or find how to stop a comparison. The comparison control sits in the History tab, offers internal words (After, Default comparison) and lists every saved checkpoint as a separate choice, about 50 rows that differ only by a time and a hash. Rows lead with names such as TASK-319 after TASK-482.07, which mean nothing to a reader, and raw identities show in the header chip. A proposal already has a summary. Reading a draft shows the model id vKEsyHFk where the model name belongs. Eight drafts share task-derived names, and some share a summary too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One comparison control stands beside the picture on every reading that can compare, and it says what the picture is compared with
- [ ] #2 It offers No comparison, Current, the draft's base and the other drafts by summary, and the words After and Default comparison are gone from the product
- [ ] #3 Checkpoints are not choices in that control, and a checkpoint is compared from its row in History
- [ ] #4 History rows lead with the summary, then the name, and a run of checkpoints of one state folds into one row with a count and the latest time
- [ ] #5 No raw identity is shown where a person reads, and drafts that share a name differ by what they change
- [ ] #6 A draft's reading shows the model's name, in the header and in the right column
- [ ] #7 The eight drafts of this repository have names that say what they change, through a model operation, and the former names keep resolving
- [ ] #8 The owner accepts it by eye
<!-- AC:END -->
