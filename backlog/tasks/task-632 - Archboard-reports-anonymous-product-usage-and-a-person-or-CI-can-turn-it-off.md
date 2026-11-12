---
id: TASK-632
title: Archboard reports anonymous product usage, and a person or CI can turn it off
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T23:14:00Z'
updated_date: '2026-11-12T23:37:00Z'
labels: []
dependencies: []
priority: medium
type: feature
ordinal: 1074000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner cannot see how people use Archboard: which commands agents run, which agents run them, whether the reader, the workbench and voice get used, and where Archboard fails on other machines. A crash reaches the owner only when someone files an issue. The owner decided on 2026-11-13: anonymous usage events, on by default with a one-time notice and an opt-out, never in CI or in a GitHub Action, sent straight to PostHog EU Cloud, shaped as wide events (one context-rich event for each unit of work). The subtasks carry the work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR records the decision: what is sent, what is never sent, when it is off, and where it goes
- [ ] #2 INSTALL.md and PRODUCT.md tell a reader what Archboard sends and how to turn it off
<!-- AC:END -->
