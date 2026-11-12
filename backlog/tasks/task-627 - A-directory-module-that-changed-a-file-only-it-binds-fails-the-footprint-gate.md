---
id: TASK-627
title: A directory module that changed a file only it binds fails the footprint gate
status: Done
assignee: []
created_date: '2026-11-12T00:22:00Z'
updated_date: '2026-11-12T00:23:00Z'
labels:
  - footprint
  - actions
dependencies: []
priority: medium
ordinal: 1071000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A module bound to a directory passed `model footprint --fail-outside`, and stayed out of the pull-request Action's "changed outside the plan", whenever another changed module was bound inside it (TASK-622). The exemption ignored which files changed. A branch that changed `libs/workspace/src/installation.ts` and `libs/workspace/README.md` let `Workspace` pass, although only `Workspace` binds the README, so `unboundFiles` did not list it either and nothing reported the change. CodeRabbit found it on a consumer copy of the archboard-plan skill (Admin-By-Request/Platform PR #647, review comment r4534117894).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A changed module lists in `holds` the other changed modules bound inside it only when they bind each file that its commits changed in its binding
- [x] #2 `model footprint --fail-outside` fails a module outside the draft that changed a file only it binds, also when a module inside it changed
- [x] #3 The pull-request Action reports that module outside the plan, from the same `holds` list
- [x] #4 Unit and system tests cover the inner-only, outer-only and mixed cases, and the Action test covers the mixed case
- [x] #5 The archboard-plan skill, the design-lens reference and the `model footprint` help describe the rule, including the mixed case
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Protocol choice: no new field. `holds` is now filled only when the held modules bind each file that the outer module's commits changed in its binding, else it is empty. The CLI (`outsideOf`, the summary count) and the Action (`planBuckets`) keep their one rule, `holds.length > 0`, so they cannot disagree, and an older Action reading a newer CLI gets the fix too. The per-repository read attaches each changed part's files (both names of a rename) and `withHeld` subtracts the scopes of the held parts. Reproduced first: the system test's mixed commit exited 0 with "0 changed outside the plan" on the old code.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A directory module now passes `model footprint --fail-outside`, and stays out of the Action's "changed outside the plan", only when the changed modules inside it bind each file it changed. A branch that also changed a file only the outer module binds fails it. Tests: held-parts unit cases (inner only, outer only, mixed, nested, .csproj), a system test that runs the real gate over three commits, and an Action mixed case. Help text, the archboard-plan skill, the design-lens reference and the pull-requests docs page describe the rule. Lanes run: types, lint:policy, lint:tests, format:check, test:modules, test:system, test:repository. A root-bound module now fails when a branch commits its draft to the vault, because the vault files lie only in its binding.
<!-- SECTION:FINAL_SUMMARY:END -->
