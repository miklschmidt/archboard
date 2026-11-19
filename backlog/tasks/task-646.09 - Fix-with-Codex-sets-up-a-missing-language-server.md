---
id: TASK-646.09
title: Fix with Codex sets up a missing language server
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T01:58:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.03
  - TASK-646.07
parent_task_id: TASK-646
type: feature
ordinal: 1095000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

A count is missing when a language has no server. The person must learn which server is missing and get it set up without leaving Archboard.

## Blocked by

- TASK-646.03
- TASK-646.07

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Flow steps `vKEsyHFk#Np3IKgXj`, `vKEsyHFk#Lc3BE31i`, `vKEsyHFk#Oh7qLIuo` (the missing-server branch of `vKEsyHFk#sgbsZcAx`). Application frame to Language server setup brief `vKEsyHFk#ePT7OKz6` (added). `workspace` `vKEsyHFk/vKEsyHFk#tdKalihR` (interface: gains the caller Application frame). Measures `vKEsyHFk#tQ2B3iEF` (changed by this ticket: the missing-server message and Fix with Codex). Endpoints: Application frame `vKEsyHFk#mlSnLR16`, Language server setup brief `vKEsyHFk#JQ4qwewE`, Shown conversation `vKEsyHFk/yejBBUFY#cLeaiTWy`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23mlSnLR16,vKEsyHFk%23JQ4qwewE,vKEsyHFk%23tQ2B3iEF (a worktree server serves the same address on its own port)
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

TASK-646 adds rules to `archboard check`, and this repository does not obey them yet. The CI task `check:model` fails on any warning. From the first ticket that reads more modules or adds a rule, the stack layers can fail `check:model` until TASK-646.14 clears the old findings. The stack merges as one unit, after its top layer passes.

1. Before you hand back, run `archboard check`. After TASK-646.04 is in your branch, also run `archboard check code --fail-shallow-modules --base <the branch below yours>`.
2. To find what your ticket surfaced, compare the findings with `archboard check` on the branch below yours.
3. If a finding is on a module that your ticket adds or changes, fix it in this ticket. Use the seam that the archboard skill gives for that finding. The code that this ticket writes adds no findings.
4. If a finding is on a module that your ticket does not change, leave it. TASK-646.14 clears it.
5. Never silence a finding. Add no waiver or exemption, weaken no rule or policy, and do not change `scripts/check-model.ts` or the `check:model` task to pass.
6. In your final summary, list the findings that your ticket surfaced on modules that it does not change: each code, with its count of modules. TASK-646.14 and the pull-request body account for them.
7. A ticket that adds a rule tests it on fixtures, never on this repository's code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A language without its server names the server that it needs
- [ ] #2 Fix with Codex starts the setup in the conversation of the checkout that misses the server, with the shared brief
- [ ] #3 The Codex text workbench browser test covers the routing to the right checkout
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. workspace: the setup brief's one export, languageServerSetup(missing?), answers both the server each missing language needs and the brief (the package stays at its 40-name interface ceiling). init uses its brief, unchanged text.
2. Model reading: a context through which the Application frame gives Measures the server a language needs and the fix action (Measures draws no relationship to workspace).
3. Measures: the code foot names, per checkout, each language with no server and the server it needs, with Fix with Codex.
4. Application frame: Fix with Codex finds the chosen checkout of the repository the skip names, shows that checkout's conversation (the existing fix-asked-for path) and asks with the brief for those languages; a refused or unknown checkout raises a notice instead of asking elsewhere.
5. Tests: brief unit test, Measures component test, and one case in the Codex text workbench browser test that routes the fix to the other checkout.
6. Look at it in both themes, audit the site, archboard check, footprint gate.
<!-- SECTION:PLAN:END -->
