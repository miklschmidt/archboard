---
id: TASK-167
title: Replace manual frontend server-resource caching with TanStack Query
status: To Do
assignee: []
created_date: '2026-09-09 12:50'
labels: []
dependencies:
  - TASK-164
references:
  - docs/agents/frontend.md
  - src/ui/application/lib/use-boards.ts
  - src/ui/canvas/api.ts
  - docs/adr/0022-the-note-decides-and-a-persons-edit-is-optimistic.md
  - >-
    https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
  - 'https://tanstack.com/router/latest/docs/guide/external-data-loading'
type: enhancement
ordinal: 318000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The board-listing hook hand-manages request generations, errors, preview caching and refreshes. TanStack Query is approved to replace request/response state, beginning with listings and unmounted server previews; additional resources such as library or opener settings qualify only where migration removes manual state without changing workflow ownership. Mounted scenes, edit acknowledgements, workbench streams and voice keep their existing owners. fetchBoards currently combines persisted board inventory with live pane inventory: settle ownership and invalidation before migration. Library broadcasts and install acknowledgements need their own explicit contract if that resource is included.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board listings and server previews have one TanStack Query cache owner per resource; replaced manual loading/cache state is removed and query options/API adapters remain domain-owned.
- [ ] #2 Mounted previews continue to come from pane scenes, and stale or late server snapshots cannot overwrite them; socket/edit/workbench/voice ordering and lifecycle ownership is preserved.
- [ ] #3 The persisted-board/live-pane listing boundary and event invalidation, reconnect, cancellation, freshness and retry policies are explicit; loading, empty, stale-data, failure and recovery states remain usable.
- [ ] #4 Additional migrated request/response resources are named with the manual state removed; unmigrated workflow controllers remain authoritative. Route loading, when present, uses the same Query cache.
- [ ] #5 Approved dependencies are pinned; no automatic board-write retries or second optimistic model is introduced. Relevant runtime tests and bun run check pass.
<!-- AC:END -->
