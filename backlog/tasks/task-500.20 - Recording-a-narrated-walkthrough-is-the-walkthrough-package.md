---
id: TASK-500.20
title: Recording a narrated walkthrough is the walkthrough package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 11:10'
updated_date: '2026-10-19 12:54'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New package under packages/ with curated api files from the start (area api folders; browser-safe api files node-free), same method as renderer and code-intel: move whole directories with git mv, delete forwarding barrels, rewrite importers by (old path, name) with a definition/alias/type check, tests move into the package, ci.yml, evals/coverage.json, docs/readme/assets.json (walkthrough-recorder and video-encoder appear in several source lists), vite.config.ts, docs and skills name the new paths. 2. code-opener (layer 6): server/code-opener, server/browser-origin, ui/code-target, ui/opener-settings, ui/opener-settings-flow; walkthrough (layer 6): shared/walkthrough-recording, runtime/walkthrough-recorder, runtime/video-encoder. Only lower packages as dependencies (layer table in package-graph.test.ts). bun run check.
<!-- SECTION:PLAN:END -->
