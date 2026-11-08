---
id: TASK-590.14
title: Code findings read as cards with their code, or as a list beside the source
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-08T02:17:00Z'
updated_date: '2026-11-08T02:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1057000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-08 the owner asked to see more than one code finding at a time: the pager of TASK-590.06 shows one card of 194. The owner chose both layouts, with a key to switch, cards first, remembered by the browser.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code view shows every finding as a card with its source excerpt under it, warnings first, and loads an excerpt only when its card comes near the screen
- [ ] #2 A key switches to a list of findings beside the source excerpt of the chosen one; arrow keys walk the list, and choosing a finding selects its subject on the picture
- [ ] #3 The browser remembers the chosen layout, and a page without storage still works with cards
- [ ] #4 Tests cover the switch, the remembered layout and choosing a finding
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ModelCodeFindings.tsx: FindingPager gives way to FindingsView: a head with the counts and a two-key layout switch (Cards / List), and the layout chosen.
2. Cards: one column of findings, warnings first; each card holds the finding beside its own source excerpt, and the excerpt mounts once the card comes near the scroll view (IntersectionObserver). A card's Show key selects its subject.
3. List: compact rows on the left, the chosen finding's card and source on the right; Up, Down, Home and End walk the rows, and choosing one selects its subject.
4. clients/code-findings-layout.ts keeps the choice in localStorage (archboard.code-findings-layout), as hover-light.ts does, with cards when storage fails.
5. Split the file where it passes the size rules; tests for the switch, the remembered layout and choosing a finding.
<!-- SECTION:PLAN:END -->
