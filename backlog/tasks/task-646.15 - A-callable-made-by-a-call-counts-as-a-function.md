---
id: TASK-646.15
title: A callable made by a call counts as a function
status: To Do
assignee: []
created_date: '2026-11-19T01:11:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.05
parent_task_id: TASK-646
type: bug
ordinal: 1101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

TASK-646.04 counts every exported non-function value as an exposed value. It misreads exports that a call makes but that can be called: compound React components built with `Object.assign(Root, {...})`, which `docs/agents/frontend.md` asks for, and helpers such as `cva(...)` or `createCn(...)`. They are functions, so `EXPOSED_VALUE` must not flag them. The owner also decided that an exported zod schema stays a value (decision 14 in the spec discussion), so the archboard skill must show how a contract module hides its schemas.

## Blocked by

- TASK-646.05, because both change Module depth.

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Module depth `vKEsyHFk#roHByn84` (changed by this ticket: how an export is classified). Endpoint: Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23roHByn84,vKEsyHFk/6E6hL0Zk%233CaBjhIM
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

Follow the same section of TASK-646.05: fix findings on modules you change, leave the others to TASK-646.14, never silence a finding, and list what you surfaced in your final summary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An export made by `Object.assign` of a function or component counts as a function, and gets no `EXPOSED_VALUE`
- [ ] #2 An export whose value the language server types as callable counts as a function
- [ ] #3 An exported zod schema still gets `EXPOSED_VALUE`
- [ ] #4 The archboard skill shows how a contract module hides its schemas: export a parse function and the derived types, and keep the schema inside
- [ ] #5 Module depth tests cover each case
<!-- AC:END -->
