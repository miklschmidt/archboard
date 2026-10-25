---
id: TASK-534
title: Long CLI help descriptions are written as paragraphs and lists
status: To Do
assignee: []
created_date: '2026-10-25T03:59:00Z'
labels:
  - cli
  - docs
dependencies: []
priority: low
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A command contract description is the body of its --help. Thirteen commands still print one paragraph of more than 120 words (semantic footprint 458, semantic move 307, semantic edit 277, semantic record 258, semantic locality 225, semantic compare 205, semantic resolve 164, semantic rename 152, semantic inspect 145, semantic replay 141, semantic branch 139, repo add 137, semantic adopt 136 words, measured 2026-10-25). The owner called the check code description, which was the same shape, unreadable. TASK-526.01 (PR #3) taught the help renderer paragraphs, headings ending in a colon, list items with a hanging indent, and code spans in backticks, and rewrote the check commands in that form.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the thirteen descriptions is split into paragraphs, headings and lists, and keeps every fact, flag and code it named before
- [ ] #2 No command help prints a paragraph of more than about 80 words
- [ ] #3 A contract file that the longer text would push over the line bound keeps its help text in a module beside it
<!-- AC:END -->
