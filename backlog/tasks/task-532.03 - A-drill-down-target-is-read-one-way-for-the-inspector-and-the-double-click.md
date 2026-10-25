---
id: TASK-532.03
title: A drill-down target is read one way for the inspector and the double-click
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-25T02:41:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0036-a-renamed-board-keeps-answering-to-its-former-names.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
parent_task_id: TASK-532
ordinal: 954000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The double-click (use-drill-open.ts) and the inspector (use-drill-place.ts with GoDeeper.tsx) each assemble finding the place, reading the document, following former names and resolving the variant. The comment says they must agree, but they do not: when the vault listing fails, the double-click opens nothing while the inspector still resolves a place, so the inspector can offer a drill-down that the double-click cannot perform.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One target reading has two adapters, a subscribing hook for the inspector and a promise for the double-click, both returning a ready destination or a named unresolved state
- [ ] #2 A failed listing is treated the same way by both adapters
- [ ] #3 use-drill-place.ts is removed; repository discovery, document reads, former-name tracking and variant selection are private to the target reading
<!-- AC:END -->
