---
id: TASK-500.17
title: What the code says about a board is the code-intel package
status: To Do
assignee: []
created_date: '2026-10-19 11:09'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 886000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
code-intel is layer 5: runtime/code-facts (20,055 lines), code-check, history-lens, language-servers and the shared code-check, history-attribution, footprint and locality. The canvas imports shared/code-check, so the package needs a browser-safe api file with no node: import.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/code-intel holds the eight modules in shared/ and runtime/ role folders with api files, the browser-reachable ones free of node: imports
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
