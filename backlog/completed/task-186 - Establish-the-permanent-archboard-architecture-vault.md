---
id: TASK-186
title: Establish the permanent archboard architecture vault
status: Done
assignee:
  - '@codex'
created_date: '2026-09-12 22:24'
updated_date: '2026-09-12 22:33'
labels: []
dependencies: []
type: docs
ordinal: 345000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dogfood archboard using its current implementation instead of the historical migration example, with a permanent repo-local vault the user can explore live.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A persistent repo-local vault and documented restart instructions survive this session
- [x] #2 Current system, service, and module boards have working links and code bindings
- [x] #3 The frontend is open in the in-app browser and the boards are visually verified
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Configure the repo-local vault and start the frontend. 2. Inspect current source and author linked boards through the CLI. 3. Verify every board renders, navigation links resolve, and document the permanent entry point.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Created 10 canonical boards in .archboard/vault through semantic CLI writes: 1 system, 4 service, 5 module. Verified 16 renders (all boards plus focused views), 23 links, and 93 existing code bindings. Visually inspected all 10 in the in-app browser and exercised system-to-service and service-to-module inspector navigation with breadcrumbs. Original browser tab remains on archboard/system. Added bin/dogfood to select this vault explicitly despite an ambient ARCHBOARD_VAULT for another project; README and AGENTS pointer document reuse. Narrow source-formatter exclusion preserves the store-owned deterministic JSON representation. Initial startup recovered a stale private Codex lock only after proving its PID absent; retained the stale lock as a backup. Full check rerun is pending.

Final validation: bun run check passed with exit 0 after the documented formatter ownership exclusion. bash -n bin/dogfood and git diff --check passed. Simplification removed two redundant Everything-equivalent views; final render count is 16.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Established .archboard/vault with ten current architecture boards across system, service and module levels, 23 linked-board targets and 93 code bindings. Added a repo-specific CLI launcher and durable operating guide. Verified all board/view renders, visually inspected all boards, exercised drill-down navigation, and passed bun run check. The in-app Browser remains open at archboard/system.
<!-- SECTION:FINAL_SUMMARY:END -->
