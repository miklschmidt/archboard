---
id: TASK-356
title: A view named in the address survives a board key in any case
status: To Do
assignee: []
created_date: '2026-09-28 14:48'
labels:
  - ui
dependencies: []
priority: medium
type: bug
ordinal: 597000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 while filming README footage, confirmed by a review. With the example vault, /?paneA=Web%20shop&viewA=ejQ7ydLw opens 'Everything' and rewrites the address to ?paneA=web+shop, dropping the view; /?paneA=web%20shop&viewA=ejQ7ydLw opens the 'Place an order' view. Board names are case-insensitive (ADR 0010), so a shared link that names a view with the board's own capitalisation loses the view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An address whose board key differs only in case from the pane's key keeps its view
- [ ] #2 The rewritten address names the same view
<!-- AC:END -->
