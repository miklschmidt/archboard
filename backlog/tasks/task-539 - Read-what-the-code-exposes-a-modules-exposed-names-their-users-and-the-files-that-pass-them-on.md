---
id: TASK-539
title: >-
  Read what the code exposes: a module's exposed names, their users and the
  files that pass them on
status: To Do
assignee: []
created_date: '2026-10-25T17:03:00Z'
labels:
  - code-check
  - ui
dependencies: []
documentation:
  - >-
    docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md
  - >-
    docs/adr/0044-a-containers-interface-is-what-relationships-from-outside-reach.md
priority: high
type: feature
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the codebase-design skill, an interface is everything a caller must know. A board's entry points show only which parts callers reach (ADR 0044). The code check already reads what each bound module exposes and which files outside it use each name (`module-reading.ts`). It also records the files that pass a name on (`via` in `module-exposure.ts`), so it knows every barrel file. That reading ends with the pass. The server remembers only findings, and no pane shows the names.

This experience lets a person pick a container bound to a module and read its exposed names, who uses each, and which files re-export it, without opening the code. The picture does not change: exposed names are facts about the code and never become cards.

The owner decided on 2026-10-25: agents get the names from the CLI only with an opt-in flag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person picks a container bound to a module and reads its exposed names, their outside users and the files that pass each name on, without opening code
- [ ] #2 A reading that is incomplete or older than the board says so
<!-- AC:END -->
