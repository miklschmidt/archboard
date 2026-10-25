---
id: TASK-532.01
title: One browser module owns every board refresh
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T02:47:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/adr/0036-a-renamed-board-keeps-answering-to-its-former-names.md
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
parent_task_id: TASK-532
ordinal: 952000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four browser paths each assemble the same document-before-picture refresh: use-semantic-board-changes.ts, use-board-catalog.ts (catalogCommandsFor), clients/semantic-board-canvas/reads/queries.ts and reads/local-pictures.ts. Each restates which query keys go stale, in what order, and when drawing ahead may start. Two decode query-key positions by destructuring. They also order cancellation, invalidation and readAgain differently. A change to the refresh rule has to be made in four places, and the tests assert key invalidations instead of what the next read returns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Callers report a changed board, a received listing, a changed policy or a reconnect; none of them names a query key or orders invalidation
- [ ] #2 Query-key layout, cancellation order and readAgain are private to the reads module
- [ ] #3 Tests on a real QueryClient with delayed reads prove that the next read is of the new version, across former names and per vault
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the semantic query keys out of queries.ts into a reads-private board-keys.ts, with one decoder of cached readings (board asked by, view, data) so no caller destructures key positions.
2. Add reads/board-refresh.ts: the one interface callers report events to: boardChanged (a pane's board moved), boardsChanged (boards of a vault written or let go, plus its listing and the panes), listingsChanged, policyChanged, readEverythingAgain (reload and reconnect), repositoriesChanged. Module-private: boardsListed (a received listing, used by the list query) and boardGoneStale (draw-ahead marks without reading). All ordering (document before pictures, cancel before invalidate) and readAgain live there.
3. A board's readings are matched by every name this tab asked it by: case-insensitively and by the cached document's name and former names, so a board let go under the server's spelling refreshes a reading asked by another spelling or a former name (the boardsChanged divergence).
4. Change callers: use-semantic-board-changes, use-board-catalog (catalogCommands binds the module ops), use-vault-check, local-pictures, queries.ts. No caller names a query key.
5. Replace key-invalidation tests (boards-changed.test.ts, listed-versions.test.ts, board-catalog refresh test) with real-QueryClient tests with delayed reads: delayed old answer does not win, next read is of the new version, a former name refreshes, another vault untouched. Keep local-pictures drawing coverage.
6. type-check, lint, focused tests, fmt; commit.
<!-- SECTION:PLAN:END -->
