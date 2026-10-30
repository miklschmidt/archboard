---
id: TASK-559.01
title: Repair the model data that the first reading shows
status: Done
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
updated_date: '2026-10-30T17:17:00Z'
labels:
  - architecture
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 973000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first picture of this repository names the model vKEsyHFk, shows its main store with no line, and 29 bound paths point to files that #24 removed. A reader judges the redesign on this data, so a false card or a raw identity spoils every trial.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The model of this repository has a readable name
- [x] #2 `Architecture inputs` carries the connections that the code supports
- [x] #3 No bound path of this repository points to a missing file
- [x] #4 Each pass-through container is removed, or states a job that the code supports
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The model is named Archboard, by one direct edit of model.json, because the writer has no rename operation. Stale binding paths fell from 29 to 0 and stale anchors from 147 to 0. Eleven containers left with their parts kept. Architecture inputs is bound and has four data relationships. archboard check semantics exits 0 on the merge. The manifest has no place for a summary, so the summary was dropped from this task: the caption uses module responsibilities. The README pictures stay outdated until the content rules land.
<!-- SECTION:FINAL_SUMMARY:END -->
