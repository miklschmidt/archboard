---
id: TASK-235.04
title: Report where kept relationships land after a proposal
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-15 18:51'
updated_date: '2026-09-15 18:52'
labels: []
dependencies: []
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/variants.md
parent_task_id: TASK-235
ordinal: 399000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S02 compare.reading failed in 1/3 baseline and 2/3 candidate runs: the answer named the removed stacks and the added part but never said the two context relationships now land on the new part. The propose step 3 says report what changed in terms of added, removed, changed and unchanged subjects, which reads as nodes; a relationship whose endpoint moved is the change the comparison exists to show.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The propose-and-compare check step tells the author to report, for each kept or added relationship, where it now lands, alongside added and removed parts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend propose step 3 to report where relationships land.
<!-- SECTION:PLAN:END -->
