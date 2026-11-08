---
id: TASK-596
title: >-
  INSTALL shows a platform setup of application and infrastructure checkouts,
  and the limits of hop evidence
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:43:00Z'
updated_date: '2026-11-08T12:09:00Z'
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
- [x] #1 INSTALL registers an application checkout and an infrastructure checkout and runs one `archboard check code`, and the steps work on the public example
- [x] #2 The README states the limits of hop evidence beside its claim: both ends must declare the connection, and the report names the analysis it skipped
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
INSTALL.md 'Application and infrastructure checkouts' clones both relay repositories, registers both and runs one archboard check code. Followed verbatim on fresh clones with an isolated XDG_STATE_HOME and server port: exit 0, then exit 1 after gate:break with one evidence line in each repository, then exit 0, with nothing skipped. README states the limits beside its claim: both ends must declare the connection, one end alone is information, and the report names what it skipped. The docs page /docs/platform/ adds the CI setup and the full list of limits; the literal env claim matches kubernetes-adapter.ts and kubernetes-runners.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
INSTALL and the docs show an application and an infrastructure checkout checked together, with the limits of hop evidence; the steps work on the public relay example from fresh clones.
<!-- SECTION:FINAL_SUMMARY:END -->
