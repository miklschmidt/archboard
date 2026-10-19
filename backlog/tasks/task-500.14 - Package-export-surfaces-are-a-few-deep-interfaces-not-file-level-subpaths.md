---
id: TASK-500.14
title: 'Package export surfaces are a few deep interfaces, not file-level subpaths'
status: To Do
assignee: []
created_date: '2026-10-19 04:57'
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
- [ ] #1 Each package lists, in docs/agents/boundaries.md, its public interface as the operations callers need, and the count of subpaths per package is lower than today with no forwarding barrel
- [ ] #2 No package export is reached by only one other package file unless it is a deliberate seam (named in the paragraph)
- [ ] #3 bun run check passes
<!-- AC:END -->
