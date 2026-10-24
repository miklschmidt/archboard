---
id: TASK-526.03
title: >-
  check embeds reports outdated embeds in its checkout, and --fix draws them
  again
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
labels:
  - cli
  - code-check
  - renderer
dependencies:
  - TASK-526.01
  - TASK-526.02
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: high
type: enhancement
ordinal: 923000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With a recipe in every board render, the check can find the embeds that a repository keeps and compare each with what its board draws now. This is the step after a board correction in the flow that the owner described: check code says the board is wrong, the agent corrects it, and check says which embeds to draw again. ADR 0057 decides the severities, the re-pointing to a board that took a deleted name, and why a renderer-only change is information.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The check reads every file that Git tracks in the checkout and that carries a recipe, and ignores ignored files and files without a recipe
- [ ] #2 A changed fingerprint or a missing board, variant or view is a warning, and a changed picture hash alone is information
- [ ] #3 A warning for a deleted board names the commit that removed it when the vault history has it, and says when another board holds the name now
- [ ] #4 A renamed board is still found, because the recipe names it by id
- [ ] #5 --fix draws each outdated embed again from its own recipe, lists every file it rewrote, and exits 0 when nothing remains
- [ ] #6 --fix points a recipe that asks for current and the overview or Everything at the board that now holds a deleted board name, and lists each such re-pointing with the file, the old board and the new board
- [ ] #7 A PNG that --fix cannot draw again without Chromium stays reported as not fixed
- [ ] #8 The check reads a vault of a registered checkout as that checkout holds it
<!-- AC:END -->
