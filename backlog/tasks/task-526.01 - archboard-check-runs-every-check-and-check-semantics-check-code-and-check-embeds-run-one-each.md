---
id: TASK-526.01
title: >-
  archboard check runs every check, and check semantics, check code and check
  embeds run one each
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
labels:
  - cli
  - code-check
dependencies: []
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: high
type: enhancement
ordinal: 921000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The plain `archboard check` never runs the code check, so people and CI skip it, and nothing reports a board that the code no longer matches. ADR 0057 makes `archboard check` and `archboard check all` run every check, with one subcommand per check. `check --code` is named in 26 files under docs, skills, apps and packages, and ADR 0045, ADR 0046 and ADR 0054 decide around it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check` and `archboard check all` run the semantics check and the code check, and the embeds check once it exists
- [ ] #2 `archboard check semantics` runs the former plain check, and `archboard check code` runs the code check with behind
- [ ] #3 The JSON answer has one part per check, and a subcommand fills only its own part
- [ ] #4 The command exits 1 when any part has a diagnostic or a warning, and information never changes the exit status
- [ ] #5 `--variant`, `--every-draft` and `--plan` work on `check`, `check all` and `check code`, and the other subcommands refuse them
- [ ] #6 `--code` is refused as an unknown option, and no doc, skill, ADR text or help names it
- [ ] #7 The route that panes poll still runs only the semantics check
- [ ] #8 ADR 0045, ADR 0046 and ADR 0054 carry an Amended by line that points to ADR 0057, and the Code check entry in CONTEXT.md names the new command
<!-- AC:END -->
