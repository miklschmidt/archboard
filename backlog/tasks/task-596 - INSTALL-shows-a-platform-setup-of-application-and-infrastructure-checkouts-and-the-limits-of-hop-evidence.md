---
id: TASK-596
title: >-
  INSTALL shows a platform setup of application and infrastructure checkouts,
  and the limits of hop evidence
status: To Do
assignee: []
created_date: '2026-11-07T12:43:00Z'
labels: []
dependencies:
  - TASK-592
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: low
type: docs
ordinal: 1041000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A platform team keeps application code and infrastructure in several checkouts. `archboard repo add` and `repo use` already register them, but no document shows that path, and the README claim about network hops does not state its limits (P2 of the market research).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 INSTALL registers an application checkout and an infrastructure checkout and runs one `archboard check code`, and the steps work on the public example
- [ ] #2 The README states the limits of hop evidence beside its claim: both ends must declare the connection, and the report names the analysis it skipped
<!-- AC:END -->
