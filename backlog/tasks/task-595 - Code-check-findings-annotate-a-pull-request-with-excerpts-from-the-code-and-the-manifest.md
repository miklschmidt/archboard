---
id: TASK-595
title: >-
  Code check findings annotate a pull request with excerpts from the code and
  the manifest
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:43:00Z'
updated_date: '2026-11-08T12:09:00Z'
labels: []
dependencies:
  - TASK-591
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: medium
type: feature
ordinal: 1040000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reviewer needs the code and the manifest evidence of a missing relationship on the diff itself. `archboard check code` already reports findings with source evidence, but only in the terminal (P1 of the market research).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A seeded missing relationship shows as a SARIF result or a GitHub annotation on a pull request
- [x] #2 A finding that crosses a network hop shows the excerpt and the path of each end, when the check has both
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
On relay PR #1 the check Action's annotation sits at services/intake/src/accept.ts:51 (GitHub API check-run annotations). Its message names both ends with their repository, path, line and the environment name, and an excerpt of each (the code line and the ConfigMap line in the infra repository). Fixed during proof: annotation paths were relative to the workspace (app/services/...), so with the app checked out under app/ no annotation landed on the diff. They are now relative to the checked repository, and an end in another repository gets no annotation of its own.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Check findings become GitHub annotations on the changed line, and a hop finding carries the path and excerpt of both ends. Proof: relay PR #1.
<!-- SECTION:FINAL_SUMMARY:END -->
