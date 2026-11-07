---
id: TASK-595
title: >-
  Code check findings annotate a pull request with excerpts from the code and
  the manifest
status: To Do
assignee: []
created_date: '2026-11-07T12:43:00Z'
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
- [ ] #1 A seeded missing relationship shows as a SARIF result or a GitHub annotation on a pull request
- [ ] #2 A finding that crosses a network hop shows the excerpt and the path of each end, when the check has both
<!-- AC:END -->
