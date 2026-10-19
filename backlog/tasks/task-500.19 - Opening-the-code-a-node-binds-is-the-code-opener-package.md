---
id: TASK-500.19
title: Opening the code a node binds is the code-opener package
status: To Do
assignee: []
created_date: '2026-10-19 11:09'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 888000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
code-opener is layer 6: server/code-opener, server/browser-origin and the ui code-target, opener-settings and opener-settings-flow modules. It uses atomic-write of workspace for its configuration file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/code-opener holds the five modules in server/ and ui/ role folders with api files, and every importer uses @archboard/code-opener
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
