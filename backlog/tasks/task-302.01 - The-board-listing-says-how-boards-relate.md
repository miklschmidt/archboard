---
id: TASK-302.01
title: The board listing says how boards relate
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 03:20'
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
