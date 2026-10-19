---
id: TASK-500.23
title: >-
  The Codex coordinator, workhorses, conversation and voice are the workbench
  package
status: To Do
assignee: []
created_date: '2026-10-19 11:10'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 892000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
workbench is layer 7 and the largest: the other runtime/codex-* modules (coordinator, coordinator-callbacks, coordinator-tools, coordinator-tool-contract, workhorse-*, thread-*, approvals, epoch, spoken-approval, realtime, instructions, dynamic-tools, wait-graph), server/codex-workbench, shared/codex-browser-model, codex-browser-gateway, codex-realtime-contract, shown-conversation, ui/workbench and workbench-*, agent-setup, codex-realtime, codex-workbench-media, voice-*, and 21 server files listed in docs/design/package-map.md. Plan it as several tasks (shared contracts, runtime, server, ui) before moving.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The plan splits workbench into ordered subtasks, each moving one area with its tests, and the browser-facing contracts are browser-safe api files
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->
