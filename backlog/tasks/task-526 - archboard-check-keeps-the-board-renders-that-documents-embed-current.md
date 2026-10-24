---
id: TASK-526
title: archboard check keeps the board renders that documents embed current
status: To Do
assignee: []
created_date: '2026-10-24T15:33:00Z'
labels:
  - cli
  - renderer
  - code-check
  - skill
dependencies: []
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
priority: high
type: enhancement
ordinal: 920000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Documentation sites embed board pictures, often from a vault in another repository. After a code change, the code check says that a board no longer matches the code, and somebody corrects the board. Nothing then says which embedded pictures now show the old board, because `semantic render --out` records nothing in the file. The code check is also easy to skip: the plain `archboard check` never runs it. The owner decided the design in a design interview on 2026-10-24, recorded in ADR 0057: one `archboard check` runs every check, every board render carries its render recipe, `check embeds` keeps embeds current with `--fix`, a board can list its tracked embeds, and a board can be deleted from the CLI. The terms are in CONTEXT.md: Render recipe, Embed, Tracked embed, Embeds check, Semantics check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is Done
- [ ] #2 A code change that makes an embedded picture outdated is reported by `archboard check` in the repository that holds the embed, and `archboard check --fix` draws it again
<!-- AC:END -->
