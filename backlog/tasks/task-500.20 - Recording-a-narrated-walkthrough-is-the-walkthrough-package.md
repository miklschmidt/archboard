---
id: TASK-500.20
title: Recording a narrated walkthrough is the walkthrough package
status: To Do
assignee: []
created_date: '2026-10-19 11:10'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 889000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
walkthrough is layer 6: shared/walkthrough-recording, runtime/walkthrough-recorder and runtime/video-encoder.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/walkthrough holds the three modules in role folders with api files, and every importer uses @archboard/walkthrough
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
