---
id: TASK-646.03
title: One language-server setup brief, used by archboard init
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T00:24:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646
type: feature
ordinal: 1089000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

`archboard init` hands the language-server setup to an agent with its own text. Fix with Codex (TASK-646.09) needs the same steps. One brief in the workspace package keeps the two from giving different steps.

## Blocked by

None (can start immediately).

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Language server setup brief `vKEsyHFk#JQ4qwewE` (added). `workspace` `vKEsyHFk/vKEsyHFk#tdKalihR` (interface: entry point Language server setup brief added). Init `vKEsyHFk/XppR9owz#XgeEM0Pb` calls the brief (relationship `vKEsyHFk#4Xftcuh4`, added).
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23JQ4qwewE,vKEsyHFk/XppR9owz%23XgeEM0Pb (a worktree server serves the same address on its own port)
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
- [x] #1 The brief names, for each supported language, the server that it needs and how to install it
- [x] #2 `archboard init` builds its language-server handoff from the brief, and the handoff text stays the same
- [x] #3 The workspace package exposes the brief as an entry point
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add languageServerSetupBrief(missing?) in packages/workspace/src/shared/rules/language-server-setup.ts, re-exported by the api file packages/workspace/src/shared/api/language-server-setup.ts (the bound file) and the browser-safe package entry ./language-server-setup.
2. With missing languages, step 1 of the brief lists each language's server and how to install it (from skills/archboard/references/setup.md). Without them it gives today's init handoff text, unchanged.
3. init.ts builds the brief and passes it to handOffLanguageServers; the CLI keeps only its 'not finished' preface. Remove LANGUAGE_SERVER_PROMPT and UNFINISHED_SETUP from setup-choices.ts.
4. Test-first: a workspace test that each configurable language's brief names its server and an install; the existing system init test covers the handoff.
5. Keep the workspace interface at its width ceiling (40) by removing one exported name.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Interface width: the new export took workspace to 41 names, over its ceiling of 40. Instead of raising the ceiling, the type-only export RegisteredRepo left ./checkouts: its one consumer, code-binding's binding resolver, now derives it as ReturnType<typeof chosenCheckouts>[number], as checkout-snapshot.ts already did. This changes code-binding, outside the slice.
Footprint (--fail-outside) names workspace, Commands and code-binding as changed outside the draft. workspace: the package.json export and the private rules file are workspace's own files, and the ticket names workspace's interface as part of the slice. Commands: Init binds only init.ts, while the handoff code (language-server-handoff.ts, setup-choices.ts) sits in the Commands module's init folder. code-binding: the width ceiling above. The orchestrator owns the proposal and names them.
Verified: the handoff text and the 'not finished' answer are byte-identical to the previous constants (compared in a script against the old strings, not locked in a wording test).

AC evidence: #1 packages/workspace/tests/shared/rules/language-server-setup.test.ts passes for all 7 configurable languages (server named, install named on its line). #2 init.ts calls languageServerSetupBrief(); tests/system/cli/init.test.ts passes, and the text equals the old LANGUAGE_SERVER_PROMPT/UNFINISHED_SETUP byte for byte. #3 packages/workspace/package.json exports ./language-server-setup; package-api, interface-width and package-graph tests pass; archboard check code --state 3nkEfr1W shows no RELATIONSHIP_UNDRAWN for Init, so the Init -> brief relationship has code evidence.

Merge gate (orchestrator): footprint exits 1 on workspace, Commands and code-binding (and their holders Packages and Agent CLI). workspace: the package export and the private rules file behind the bound brief api file. Commands: the init handoff files sit beside init.ts, which Init alone binds. code-binding: one type-only export removed to keep workspace under its interface-width ceiling, derived from chosenCheckouts instead. None changes architecture beyond the planned brief and Init relationship, so the exception is recorded in the proposal history (operation task-646-03-exceptions).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
One language-server setup brief now lives in the workspace package (languageServerSetupBrief, entry @archboard/workspace/language-server-setup, browser safe). Given the languages that lack a server, it lists each with the server that it needs and how to install it. Without them, it gives the handoff text that archboard init gave before, unchanged. init builds its handoff from it, so Fix with Codex (TASK-646.09) can use the same steps.

To stay at the workspace interface-width ceiling, the type export RegisteredRepo was removed. code-binding derives it from chosenCheckouts.

Checks: type-check, lint, format check, archboard check (exit 0), and tests for workspace, code-binding, init, the system init test and repository policy (282 pass). The footprint gate still names workspace, Commands and code-binding as changed outside the draft. The orchestrator must name them in the proposal.
<!-- SECTION:FINAL_SUMMARY:END -->
