---
id: TASK-594
title: >-
  A pull request carries its proposal, before and after pictures and its
  footprint
status: To Do
assignee: []
created_date: '2026-11-07T12:42:00Z'
labels: []
dependencies:
  - TASK-591
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: medium
type: feature
ordinal: 1039000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Leads who review agent pull requests say that plain diffs are the wrong level for an architectural change. Archboard already has proposals, `model compare`, `model footprint --base <ref> --state <proposal>`, `model render` and walkthrough recordings, but a reviewer sees none of them on the pull request (P1 of the market research).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A GitHub Action posts on a sample pull request the proposal summary, the architecture before and after as SVG, the footprint buckets and a link to the map
- [ ] #2 A configuration makes changes outside the plan warn or fail, and an override lets a pull request through
- [ ] #3 The action uses only existing CLI commands
<!-- AC:END -->
