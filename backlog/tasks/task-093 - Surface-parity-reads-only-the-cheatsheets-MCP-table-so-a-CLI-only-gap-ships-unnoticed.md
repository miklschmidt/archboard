---
id: TASK-093
title: >-
  Surface parity reads only the cheatsheet's MCP table, so a CLI-only gap ships
  unnoticed
status: To Do
assignee: []
created_date: '2026-08-22 15:40'
labels: []
dependencies:
  - TASK-080
references:
  - scripts/check-surface-parity.mjs
  - skills/excalidraw-skill/references/cheatsheet.md
priority: medium
type: bug
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by TASK-081 while adding the CLI half of the claim documentation.

`check-surface-parity` is the check that keeps the MCP surface and the CLI honest against each other. When it reads the cheatsheet, it reads the MCP table and nothing else.

That is not hypothetical: TASK-080 shipped `claim` and `release` documented on one surface, its notes recorded 'both in the cheatsheet', and the check agreed — because the sentence was true of the MCP table alone. Nothing noticed the CLI half was missing until a human-written task went looking.

A parity check that reads one side is a parity check in name. It should read both tables, or read neither and compare against something that is not prose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The parity check reads the CLI table as well as the MCP one
- [ ] #2 A command documented on one surface and not the other fails the check
- [ ] #3 Proved by removing one surface's entry for a command and watching it fail
<!-- AC:END -->
