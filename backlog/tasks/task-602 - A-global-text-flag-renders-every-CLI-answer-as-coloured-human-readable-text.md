---
id: TASK-602
title: A global --text flag renders every CLI answer as coloured, human-readable text
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-08T00:56:00Z'
labels: []
dependencies:
  - TASK-601
references:
  - apps/cli/src/cli/contract/operations/presentation.ts
  - apps/cli/src/cli/routing/operations/bootstrap.ts
ordinal: 1039000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI answers in JSON because agents are its main callers. A person at a terminal has to read that JSON. Only `repo list` and `browser panes` had a `--text` option of their own. On 2026-11-08 the owner asked for one global flag that renders all output as formatted, coloured text for people, and chose the name `--text` so that it matches the two existing options (`--plain` would promise text without colour).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `--text` is accepted with every command, before or after the command name, and the command's answer on stdout is human-readable text instead of JSON. Without it, every answer is the same JSON as before
- [ ] #2 The text names each field in words, indents nested values, renders a list of records with the same plain fields as a table, keeps the lines of multi-line text, and leaves out `success: true`
- [ ] #3 A refusal renders as text that says it is a refusal, with its code, message and recovery. Exit codes do not change
- [ ] #4 At a terminal the text is coloured. It follows NO_COLOR and FORCE_COLOR, and `--text` output to a pipe has no colour unless FORCE_COLOR is set
- [ ] #5 `repo list` and `browser panes` keep their own human form under the global flag, and their own `--text` options are gone
- [ ] #6 Help lists `--text`, and INSTALL.md and the README say how a person reads an answer as text
- [ ] #7 One module test owns the rendering and one system test owns the flag end to end
<!-- AC:END -->
