---
id: TASK-646.14.05
title: Clear the remaining packages' and apps' module-depth warnings
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T06:02:00Z'
updated_date: '2026-11-19T09:55:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646.14
type: task
ordinal: 1109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646.14, "archboard check passes on this repository again".

## What to build

The module-depth rules of TASK-646 flag this repository's own code, and the CI task `check:model` fails on any warning. This batch clears the warnings in: packages/timing, packages/renderer, packages/walkthrough, packages/server-lifecycle, packages/code-opener, packages/process, packages/skills, apps/cli, apps/web, actions/check, scripts/release. Count on feat/module-depth at a601dba760: about 120 warnings, including timing's 30 EXPOSED_VALUE and 6 EXPOSED_VALUE_COMPUTED (timing exposes functions that hide the timing logic, and callers stop importing its constants).

Clear each finding with the seam the archboard skill names for it (skills/archboard/references/design-lens.md): move a value to its only reader, move the behavior that callers repeat into the module as a function, export a getter where a caller needs the value itself, stop exporting a name nothing outside uses (Rust: narrow `pub` to `pub(crate)` or private), and keep one door per name. The full check output: /tmp/nix-shell.KOyuFS/claude-1001/-home-msc-Projects-archboard/19a3ee13-20dc-4f34-ab5e-199cee6507ec/scratchpad/cc-final.json.

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: the modules bound under this batch's paths. The refactor changes code interfaces, not the model's relationships; a change that does alter a relationship, or a removed or renamed symbol that a vault anchor names, is reported to the orchestrator, who edits the vault.
- Gate: merge-time footprint as for every TASK-646 ticket; changes without architectural meaning are recorded exceptions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check code` reports no warning on a module bound under this batch's paths
- [ ] #2 No lint, type, test or check rule, policy, waiver or exemption is weakened or added to pass
- [ ] #3 Behavior is unchanged: the existing tests of the touched packages pass, and renderer output is identical where a crate draws
- [ ] #4 Each removed or renamed symbol that a vault anchor names is reported with its replacement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. timing: each group stays inside behind a keyed getter (paneMs("report")); the repeated math (deadlines, freshness, slide settling, reach hops, page-ready seconds, painter phases, locality start) becomes timing functions; codemod every caller.
2. walkthrough, renderer, server-lifecycle, code-opener, process: exported values become getters or the behavior callers repeat; names only tests used stop being exported.
3. apps/cli and apps/web: shared refusals and options behind getters, single-reader schemas move to their reader, repo routes come from the repo module, query keys hide behind invalidate/key functions.
4. actions/check, scripts/release: drop unused exports; summary limits behind a function.
5. Keep interface-width ceilings; lower the ones that shrink.
6. Verify: types, lint, format, test lanes, archboard check code.
<!-- SECTION:PLAN:END -->
