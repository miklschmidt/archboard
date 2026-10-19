---
id: TASK-500.14
title: 'Package export surfaces are a few deep interfaces, not file-level subpaths'
status: Done
assignee: []
created_date: '2026-10-19 04:57'
updated_date: '2026-10-19 22:26'
labels: []
dependencies:
  - TASK-500.13
parent_task_id: TASK-500
ordinal: 879000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Without barrels, the moves exposed one subpath per file that outside code imports: board 28, codex-app-server 14, workspace 10, code-binding 9, process 6, diagnostics 4, timing 2. docs/design/package-map.md asks for a few public files per package (board: document, policy, store). A subpath per file is a shallow interface: callers still must know the file layout. Codex advises (TASK-500.11 review) that moving names into a few giant files only reduces path count. The goal is public files that define the parsing, reading, comparison and mutation operations callers need, with private files owning the helpers. Candidates from that review: content with walkthrough, container-interface with compare-interfaces, a flow interface owning flow schemas and the public traversal, views (all production importers use types only). Avoid merging reconciliation schemas with the reconciliation algorithm (initialization cycle).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each package lists, in docs/agents/boundaries.md, its public interface as the operations callers need, and the count of subpaths per package is lower than today with no forwarding barrel
- [x] #2 No package export is reached by only one other package file unless it is a deliberate seam (named in the paragraph)
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision (user, 2026-10-19): consolidate now, board first, before the workbench and apps move. Rule agreed with the Codex advice: a public file is an interface over private implementation. It may re-export names from private files, but only names that code outside the package imports today; every other name becomes private. Moving all declarations into giant files is not the goal (500-line lint limit, no depth gained). Subtasks: .01 board browser-safe interfaces, .02 board runtime interfaces, .03 board write operation, .04 the other packages.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every package exposes a few curated interface files (board 20 subpaths from 28, workbench 8 from 43 at its peak, and so on) listed in docs/agents/boundaries.md. A scan of every package export for names that no outside file imports found three dead helpers in diagnostics, now deleted; renderArchitecture stays because design fixtures import it. bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
