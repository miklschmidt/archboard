---
id: TASK-302.01
title: The board listing says how boards relate
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 03:20'
updated_date: '2026-09-23 03:24'
labels: []
dependencies: []
parent_task_id: TASK-302
priority: high
ordinal: 523000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The navigator is a flat A-Z list because the listing it reads carries nothing to organise by: GET /api/semantic-boards drops the drill links between boards, the variant summary and updatedAt, and the browser zod schema strips the configured `levels` the server already sends. The vault already holds a board graph (ADR 0029 drill-downs; the dogfood vault derives system > service > module from it), and a board name may carry `/` folders. The navigator derives its outline from this data in the browser, so the listing only has to report what is authored, derived without new authoring.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each listed board carries the drill links of the variant its bare name opens (or of its only root draft when nothing is built): target board name, the named target variant or null for current, the linking node name, and whether the linking node contains other nodes (an upward container link per ADR 0029)
- [ ] #2 Each listed board carries a one-line description (the opened variant summary, first sentence, bounded) or null, and its updatedAt
- [ ] #3 The browser listing schema keeps the configured level order, the links, the description and updatedAt instead of stripping them
- [ ] #4 An unreadable board still lists with its error and no links
- [ ] #5 Owners cover the route payload and the browser schema; no test locks copy
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Give the listing protocol one owner in @/shared/semantic-board (lib/listing.ts), as the render reply already has: BoardListingSchema / ListedBoardSchema / BoardLinkSchema, and a pure listedBoard(location, read) that derives links (from the variant addressedVariant opens: current, else its only root draft), description (opened summary, first sentence, whitespace-collapsed, <=160 chars, null when empty) and updatedAt; an unreadable board keeps its error with links [] and description null.
2. listRoute maps listSemanticBoards() through listedBoard and types its answer against the schema input, so producer and browser cannot drift. No new I/O.
3. The browser's fetchSemanticBoards parses with BoardListingSchema and returns { levels, boards }; the list query returns that listing. Minimal one-line adjustment in board-catalog's hook (vault.data?.boards) and fixture fields in its test to keep it compiling.
4. Owners: src/shared/semantic-board/tests/listing.test.ts (derivation rules + wire round-trip through the browser schema); extend tests/system/semantic-boards/variant-targeting.test.ts so the real route's answer parses under the shared schema and a draft-only board lists its drill link.
5. Gate: type-check, lint, fmt:check, focused tests, module lane.
<!-- SECTION:PLAN:END -->
