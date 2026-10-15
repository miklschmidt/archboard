---
id: TASK-472.10
title: 'Each checkout has its own workhorse, and the coordinator works in no checkout'
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 03:38'
labels: []
dependencies:
  - TASK-472.04
  - TASK-472.06
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 830000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A tab session has one workhorse and one coordinator, both running in the archboard checkout that the server runs from, so a thread reads archboard's agent instructions and skills even about another repository's boards. ADR 0050 gives a tab session one workhorse for each checkout, running in that checkout so that it reads that repository's AGENTS.md, skills and Codex configuration, and one voice coordinator for the whole app in a directory of its own. The implementation brief of TASK-447 will name the checkout and `-C`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A workhorse thread starts with its checkout as its working directory and workspace root, and the workhorse of an untracked vault starts in the directory that holds the vault
- [ ] #2 A tab session holds at most one workhorse per checkout, each with its own thread link, queue and approvals
- [ ] #3 The coordinator starts in a directory of its own under the state directory, reads boards with `-C`, and gives work in a checkout to that checkout's workhorse, starting it when there is none
- [ ] #4 A typed message names its checkout and reaches that checkout's workhorse, starting one when there is none
- [ ] #5 Pane briefs, board news and workhorse news name the checkout of each board
- [ ] #6 A workhorse stays linked when the chosen checkout of its identity changes
- [ ] #7 A workhorse stop requested for a checkout stops only that workhorse, and a stop requested for the whole tab session stops every running workhorse
- [ ] #8 AGENTS.md's Codex invariant, PRODUCT.md, CONTEXT.md and the archboard-dev skill describe one coordinator and one workhorse per checkout as built
- [ ] #9 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-15 02:09
---
Found in the TASK-472.05 review: Fix with Codex now names the diagnosed vault as ARCHBOARD_VAULT on every command (72dc8511c), but the workhorse still runs in the served vault's checkout, so a repair that edits files directly may be outside its sandbox. Make sure that the repair runs in the workhorse of the diagnosed checkout.
---

created: 2026-10-15 03:38
---
Found in the TASK-472.06 boundary review: until this task lands, every Codex thread runs in the archboard checkout the server runs from, and that checkout tracks .archboard/vault. A thread command that omits -C therefore reads and writes archboard's own dogfood boards, and its first such command registers the archboard checkout and all its worktrees in the user's registry, so the navigator lists archboard for every user (confirmed with an isolated ARCHBOARD_REPOS: 'Registered /home/msc/Projects/archboard as the chosen checkout of github.com/miklschmidt/archboard, with 20 of its worktrees'). TASK-472.06 relies on the instructions telling each thread to pass -C and adds no guard, because this task removes the cause: a workhorse runs in its own checkout and the coordinator in a state directory with no vault, where an omitted -C is refused. Add an owner here that a coordinator command without -C is refused with VAULT_NOT_FOUND, and that no thread runs in the archboard checkout unless that is the checkout it works in.
---
<!-- COMMENTS:END -->
