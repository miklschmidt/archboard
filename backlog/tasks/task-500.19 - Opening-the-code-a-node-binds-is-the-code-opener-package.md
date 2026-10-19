---
id: TASK-500.19
title: Opening the code a node binds is the code-opener package
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 11:09'
updated_date: '2026-10-19 13:26'
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
- [x] #1 packages/code-opener holds the five modules in server/ and ui/ role folders with api files, and every importer uses @archboard/code-opener
- [x] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New package under packages/ with curated api files from the start (area api folders; browser-safe api files node-free), same method as renderer and code-intel: move whole directories with git mv, delete forwarding barrels, rewrite importers by (old path, name) with a definition/alias/type check, tests move into the package, ci.yml, evals/coverage.json, docs/readme/assets.json (walkthrough-recorder and video-encoder appear in several source lists), vite.config.ts, docs and skills name the new paths. 2. code-opener (layer 6): server/code-opener, server/browser-origin, ui/code-target, ui/opener-settings, ui/opener-settings-flow; walkthrough (layer 6): shared/walkthrough-recording, runtime/walkthrough-recorder, runtime/video-encoder. Only lower packages as dependencies (layer table in package-graph.test.ts). bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
code-opener holds the five modules in server/ and ui/ role folders with four curated api files (13 names). Codex reviewed commits fca2d9481 with no material findings (1,132 import bindings compared; browser safety, wiring and docs checked). bun run check exited 0 after the commit.
<!-- SECTION:FINAL_SUMMARY:END -->
