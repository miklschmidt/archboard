---
id: TASK-552
title: A command row shows the script a shell runs, not the path of the shell
status: Done
assignee:
  - '@claude'
created_date: '2026-10-26T12:28:00Z'
updated_date: '2026-10-26T13:07:00Z'
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
- [x] #1 A row whose command is a bash, sh or zsh call with -c (for example -lc) and one script shows that script, unquoted, with the terminal icon
- [x] #2 A row of any other command, a compound command included, shows the command as Codex sent it
- [x] #3 An approval card and the status line of a waiting approval still show the exact command
- [x] #4 A rendered test owns the label of a command row
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shell-quote 1.9.0 to the root dependencies, pinned like the others.
2. In packages/workbench/src/ui/rules/thread/activity-words.ts, give a command row the script of a shell call as its label: parse the command with shell-quote, and when it is exactly a bash, sh or zsh executable, one option word that holds c, and one script word, the label is that script. Any other command keeps its words.
3. Leave the approval card and the status line of a waiting approval as they are: an approval shows the exact command.
4. Own the label with a rendered test in packages/workbench/tests/ui/components/thread/activity-run.test.tsx.
No board is affected: the change is how a row of the dock words a command, and no board draws that.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-10-26. The rendered test in packages/workbench/tests/ui/components/thread/activity-run.test.tsx owns the label: a bash, zsh or uppercase-flag call with -c reads as its script, and a compound command, a non-shell -c, a newline-separated command, a script with a shell expansion and a command outside the parser's grammar read as sent. It fails without the change. The row keeps RiTerminalBoxLine, the icon of every command row (KIND_ICONS in ActivityRun.tsx). Approval surfaces read approval.command directly and the change does not touch them; approval-projection.test.ts asserts the card shows the command as sent. Browser QA on a take server over the web shop example, dark at 1920x1080: one real agent turn ran echo "it's done" && ls -1 .archboard/vault | wc -l, and its row read exactly that with the terminal icon. Review on gpt-6.1-sol xhigh found four spec gaps (a parser exception, newline-separated commands, uppercase flags, expansions) and fixed them in 503b34ebc, b4ac42ab1, f10f2d3d8 and 00767172b. bun run check passed, 13 of 13 tasks. No board is affected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A command row of the agent dock now shows the script of one bash, sh or zsh call with -c, unquoted by shell-quote 1.9.0, in place of the path of the login shell that Codex runs it through. Any other command, a command the parser cannot read and every approval keep the exact words that Codex sent. shell-quote became a direct dependency, with the user's approval; it was already installed through concurrently. Verified by a rendered test, one real dock turn in the browser and the full gate.
<!-- SECTION:FINAL_SUMMARY:END -->
