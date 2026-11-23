---
id: TASK-663.07
title: This repository's relationships state their kind and effect
status: Done
assignee: []
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-23T02:12:00Z'
labels: []
dependencies:
  - TASK-663.04
  - TASK-663.02
  - TASK-663.03
parent_task_id: TASK-663
ordinal: 1151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Upgrade this vault through the inventory of TASK-663.04: every one of its 1328 relationships gets a kind and an effect read from the code (1032 calls, 160 dependencies, 34 data reviewed from the code, not relabelled from their labels), split by root module. Then compare wide pictures through main and all, and report the line counts in wide scopes through the settled main and the alternative that keeps in-process queries, so the owner can choose the default with evidence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every relationship of this vault states its kind, and every one but an effectless dependency its effect
- [x] #2 The kind histogram before and after, and the count of mutations whose side effect could not be ruled out, are in the pull request
- [x] #3 Wide pictures before and after, through main and all, in both themes, are in the pull request, with line counts for both candidate defaults
- [x] #4 archboard check passes on the upgraded vault
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified on ec32ee706c: no relationship states call; every one but an effectless dependency states an effect (the store refuses otherwise). PR #154 carries the kind histogram before and after, the 12 recorded gaps, and the line counts for both candidate defaults (all 1,170 / main 552 / alternative 819); the owner chose main with a fallback to all. Pictures of Packages and Painting before and after are in PR #154; both themes are in artifacts/t663-evidence/v2. archboard check exits 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
This repository's relationships state their kind and effect; the evidence the owner chose the default from is in PR #154.
<!-- SECTION:FINAL_SUMMARY:END -->
