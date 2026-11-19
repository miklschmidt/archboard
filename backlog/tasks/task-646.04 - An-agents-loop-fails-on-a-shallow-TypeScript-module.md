---
id: TASK-646.04
title: An agent's loop fails on a shallow TypeScript module
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T00:02:00Z'
updated_date: '2026-11-19T01:00:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.01
  - TASK-646.02
parent_task_id: TASK-646
type: feature
ordinal: 1090000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

The tracer bullet of TASK-646. The code check judges TypeScript modules from their code, and an agent's implementation loop fails on a shallow module that its branch touched. In this repository, the `timing` module exports frozen groups of durations, and its callers compute on them. This ticket makes that visible and gateable.

## Blocked by

- TASK-646.01
- TASK-646.02

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Flow `vKEsyHFk#RlLRwGPb` "An agent loop gates on shallow modules" with all its steps. Module depth `vKEsyHFk#roHByn84` (added, with `EXPOSED_VALUE`, the counts and the `MODULE_SHALLOW` roll-up). Relationships Code check to Module depth `vKEsyHFk#DLEkNAnz`, Code check to History lens `vKEsyHFk#mGUosADW`, Module depth to Cached fact reader `vKEsyHFk#PbpqK7dj` (added). Vault check `vKEsyHFk/XppR9owz#yQCdykGt` (changed: the gate, `--base`, the refusal). Vault configuration `vKEsyHFk/0T9enjhi#AJGft3Pe` (changed: the policy holds the gate). Code check `vKEsyHFk/HBlhIeSD#5SMX69gS` (changed: reports module depth and the touched modules). Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed: TypeScript export kinds and pieces of logic). Endpoints: Code check route `vKEsyHFk/HBlhIeSD#3bPZg9a5`, History lens `vKEsyHFk/HBlhIeSD#radK8osF`, Cached fact reader `vKEsyHFk/6E6hL0Zk#mR7wPSei`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&grammarA=sequence&flowA=vKEsyHFk%23RlLRwGPb (a worktree server serves the same address on its own port)
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
- [x] #1 `archboard check code` counts the exports of each bound TypeScript module by kind (functions, classes, values, types) and counts the pieces of logic behind them
- [x] #2 `EXPOSED_VALUE` is a warning on an exported value that outside code reads, including a value made by a call such as `durations({...})`
- [x] #3 The `EXPOSED_VALUE` message orders its remedies by reader count, and a getter clears the finding
- [x] #4 `MODULE_SHALLOW` is information when every export that is not a type carries a per-name finding, and exported types count for no verdict
- [x] #5 `archboard check --fail-shallow-modules` makes `MODULE_SHALLOW` a warning on the modules that the branch touched, working tree included, and exits 1
- [x] #6 The model's policy turns the same gate on without the flag
- [x] #7 `--base` names the base, the default-base lookup decides without it, and a base that does not resolve is a refusal, never a pass
- [x] #8 The code check answer has the same severities whoever runs it
- [x] #9 A new ADR supersedes the parts of ADR 0044 and ADR 0046 that forbid verdicts, and the README no longer says that Archboard never calls a module shallow
- [x] #10 `CONTEXT.md` defines the new terms, and the archboard skill tells agents to run the gate in implementation loops and how to clear `EXPOSED_VALUE` and `MODULE_SHALLOW`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fact analysis (TypeScript): Definition.type marks an interface, a type alias or an enum; SyntaxFacts.logic counts the pieces of logic of a file (calls, operators, conditions, loops) from a @logic capture of the TypeScript query.
2. Module depth (packages/code-intel/src/runtime/module-depth): its own input (exposure, outside uses with reader and typeOnly, facts pass). Counts top-level exports by kind (functions, classes, public methods, values, types) and the logic of the module's files plus its hidden values. EXPOSED_VALUE (warning, named export) for an exported value that outside code reads at run time, tests aside; remedies ordered by reader count; a function getter clears it. MODULE_SHALLOW (information) when every non-type export has a per-name finding. Judges names that the TypeScript adapter read.
3. Code check: interfaces.ts hands each judged module to Module depth and adds the site; the answer gains depth records, touched modules and models[].failShallowModules. Touched modules come from the History lens footprint with the working tree as head, read when the request names a base or asks for them, or a model's policy turns the gate on. A module is touched when its part or a changed part inside its directory changed; parts the footprint could not read are listed as unread. An asked base that does not resolve (or no default base) is the refusal BASE_UNRESOLVED. Severities never depend on the request.
4. History lens: export the default-base lookup.
5. Vault configuration: optional codeCheck.failShallowModules in the policy schema.
6. Code check route: forwards base and touched.
7. Vault check CLI: --fail-shallow-modules and --base; per model gate = flag or policy; promotes MODULE_SHALLOW on touched modules to warning, refuses (exit 2) when a gated MODULE_SHALLOW sits on an unread module; then the existing exit rule.
8. Tests: code-intel pass over a canonical vault in a Git fixture; CLI check-parts with the stand-in server; route forwarding.
9. Docs: new ADR superseding the verdict bans of ADR 0044/0046, README, CONTEXT.md, archboard skill (gate in loops, clearing EXPOSED_VALUE and MODULE_SHALLOW).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1-4, AC7-8: packages/code-intel/tests/runtime/code-check/operations/module-depth.test.ts drives createCodeCheck().run over a canonical vault in a Git fixture: depth counts by kind (a public method counts, a private one does not) and logic; EXPOSED_VALUE on durations({...}) and a plain value, none for a getter, a type-only read or a test-only read; remedies name the one reader or the several; MODULE_SHALLOW information only when every non-type export has a finding; touched modules from the working tree (incl. a module bound through index.ts whose inner part changed); identical severities with and without touched; BASE_UNRESOLVED for a named base that does not resolve; the policy flag carried in models[] and touched read unasked.
- AC5-7: apps/cli/tests/cli/commands/vault/operations/check-parts.test.ts: --fail-shallow-modules sends touched=true and promotes MODULE_SHALLOW only on the touched module (exit 0 -> 1); policy alone does the same; --base forwarded; server BASE_UNRESOLVED and a gated module on an unread part exit 2. Route: code-check-route.test.ts forwards touched and base, and refuses an unresolvable base with 422.
- AC9-10: docs/adr/0082, ADR 0044/0046 notes, README, CONTEXT.md terms, skills/archboard SKILL.md and design-lens.md (Module depth).
- On this repository: archboard check code --fail-shallow-modules --base feat/module-depth reads 15 touched modules; the only shallow module (Repositories) is untouched and stays information.
- Found and fixed: the working-tree footprint copied the index without its time, so Git skipped its racy-entry recheck and a same-size edit in the same second looked unchanged (flaky; stable 6/6 after the fix).
- Lanes: test:modules 5135 pass, test:repository 174 pass, type-check, lint:policy, lint:tests, format:check clean.
<!-- SECTION:NOTES:END -->
