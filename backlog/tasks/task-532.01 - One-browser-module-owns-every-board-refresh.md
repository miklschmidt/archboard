---
id: TASK-532.01
title: One browser module owns every board refresh
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T02:41:00Z'
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
