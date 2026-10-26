---
id: TASK-552
title: A command row shows the script a shell runs, not the path of the shell
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-26T12:28:00Z'
updated_date: '2026-10-26T12:28:00Z'
labels:
  - workbench
  - dock
dependencies: []
ordinal: 961000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Codex runs each command of an agent through a login shell, so a row of the dock read `/nix/store/…-bash-5.3p15/bin/bash -lc '…'`. A person had to open the row to see what the agent ran. The user found this in the TASK-538 QA and asked for the script and the terminal icon instead. The user chose shell-quote 1.9.0 as the parser. It was already in bun.lock through concurrently.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A row whose command is a bash, sh or zsh call with -c (for example -lc) and one script shows that script, unquoted, with the terminal icon
- [ ] #2 A row of any other command, a compound command included, shows the command as Codex sent it
- [ ] #3 An approval card and the status line of a waiting approval still show the exact command
- [ ] #4 A rendered test owns the label of a command row
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shell-quote 1.9.0 to the root dependencies, pinned like the others.
2. In packages/workbench/src/ui/rules/thread/activity-words.ts, give a command row the script of a shell call as its label: parse the command with shell-quote, and when it is exactly a bash, sh or zsh executable, one option word that holds c, and one script word, the label is that script. Any other command keeps its words.
3. Leave the approval card and the status line of a waiting approval as they are: an approval shows the exact command.
4. Own the label with a rendered test in packages/workbench/tests/ui/components/thread/activity-run.test.tsx.
No board is affected: the change is how a row of the dock words a command, and no board draws that.
<!-- SECTION:PLAN:END -->
