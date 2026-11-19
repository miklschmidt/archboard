---
id: TASK-646.17
title: A sibling use keeps a folder export used
status: To Do
assignee: []
created_date: '2026-11-19T04:13:00Z'
updated_date: '2026-11-19T04:29:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.05
parent_task_id: TASK-646
type: bug
ordinal: 1103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

A folder module with no declared interface (no entry file such as `index.ts`, no `package.json` exports) takes every export of the files directly in it as its interface. TypeScript must export a name for a sibling file to use it, and it cannot hide that name from other folders. So `EXPOSED_UNUSED` warns on names that only sibling files use, and no change short of merging files clears them: an audit (2026-11-19) found 630 of the 813 TypeScript `EXPOSED_UNUSED` warnings on this repository are this case, for example `freezeRecord` in Epoch ledger (packages/codex-realtime-voice/src/runtime/epoch/store/manifest-relations.ts:212, used by epoch.ts in the same folder).

The owner decided (decision 16): in such a module, a name that another file of the same module imports counts as used. A name that nothing uses, or that only tests use, still gets `EXPOSED_UNUSED`. Modules with a declared interface (an entry file or `package.json` exports) keep todays rule.

Audit data: /tmp/nix-shell.KOyuFS/claude-1001/-home-msc-Projects-archboard/19a3ee13-20dc-4f34-ab5e-199cee6507ec/scratchpad/resolved2.json and cc-rust.json.

## Blocked by

- TASK-646.05

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Module depth `vKEsyHFk#roHByn84` (changed by this ticket: what counts as a use of a folder export). Endpoint: Code check `vKEsyHFk/HBlhIeSD#5SMX69gS`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23roHByn84,vKEsyHFk/HBlhIeSD%235SMX69gS
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

Follow the same section of TASK-646.05.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a folder module with no declared interface, a name that another file of the same module imports counts as used and gets no EXPOSED_UNUSED
- [ ] #2 In such a module, a name that nothing uses, or that only tests use, still gets EXPOSED_UNUSED
- [ ] #3 A module with an entry file or package.json exports keeps the current rule
- [ ] #4 The rule applies in every language that Module depth judges, and the archboard skill and ADR 0082 say so
- [ ] #5 Code-check tests cover each case
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merge gate (orchestrator): footprint exits 1 on code-intel only, through its tests. Exception recorded in the proposal history (operation task-646-17-exceptions). EXPOSED_UNUSED warnings on this repository went from 2156 to 1480.
<!-- SECTION:NOTES:END -->
