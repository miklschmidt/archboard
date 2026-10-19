---
id: TASK-500.16
title: >-
  Every browser call to the server names its vault in the server-requests
  package
status: To Do
assignee: []
created_date: '2026-10-19 11:09'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 885000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
server-requests is layer 0: ui/server-requests. CLAUDE.md invariant: every call to the server names its vault (ADR 0049), and the browser side of that rule lives here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/server-requests holds ui/server-requests with an api file, and every importer uses @archboard/server-requests
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
