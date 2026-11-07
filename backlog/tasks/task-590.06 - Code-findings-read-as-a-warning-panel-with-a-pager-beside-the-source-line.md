---
id: TASK-590.06
title: Code findings read as a warning panel with a pager beside the source line
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T15:08:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1049000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site content selector and warnings display: large tabs with an icon, a label and a gloss, and a warning card with a solid chip, the route, the explanation and the strength of the evidence beside the source with its line marked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code findings show one finding at a time with a pager, a solid changed chip and the route
- [ ] #2 The source excerpt shows line numbers and marks the line of the evidence
- [ ] #3 A content selector of icon, label and gloss tabs chooses between the code evidence views
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-07: the owner approved a server route that returns the source lines around a finding's evidence. ADR 0046 says a finding never quotes other text of a file, because a file can hold a secret and the server has no authentication, so the route waits for the owner's answer on that rule. The owner asked where the content selector goes; the proposal is the head of the Measures dialog (TASK-590.11).
<!-- SECTION:NOTES:END -->
