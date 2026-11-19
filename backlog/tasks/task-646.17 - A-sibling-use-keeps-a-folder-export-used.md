---
id: TASK-646.17
title: A sibling use keeps a folder export used
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T04:13:00Z'
updated_date: '2026-11-19T04:30:00Z'
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
- [x] #1 In a folder module with no declared interface, a name that another file of the same module imports counts as used and gets no EXPOSED_UNUSED
- [x] #2 In such a module, a name that nothing uses, or that only tests use, still gets EXPOSED_UNUSED
- [x] #3 A module with an entry file or package.json exports keeps the current rule
- [x] #4 The rule applies in every language that Module depth judges, and the archboard skill and ADR 0082 say so
- [x] #5 Code-check tests cover each case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In Module depth, decide whether a module declares its interface: a file there stands for it (index.ts, __init__.py, mod.rs, project file...), a root file lies outside its top level, or its package.json names exports.
2. Where it declares none, read the module's own files (tests aside) and collect each use, through an import that names another file of the module, of a definition there (sibling-uses.ts).
3. EXPOSED_UNUSED skips a name such a use reaches; uses by siblings never feed EXPOSED_VALUE or other rules.
4. Test on the module-depth-names fixture: an index-less folder (used, unused, test-only), a package.json-exports module and an index module (sibling use still unused).
5. ADR 0082, the design lens and CONTEXT.md say so.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A sibling use counts only through an import that names the other file: Swift (and Go) files see their target's names without one, so an exported name only they use stays a finding there (swift-check fixture keeps its Core warning). C modules without include/ are undeclared, so a sibling .c that includes a public header keeps its names used (c-check fixture updated: notify is used by mail.c beside it). Python, Rust and C# modules always have an entry file, so they keep the old rule.
On this repository (check code, current state, merged tip): EXPOSED_UNUSED warnings 2156 -> 1480, information 40 -> 12. 704 findings cleared, all EXPOSED_UNUSED on TypeScript modules; no new warnings. Five names that are now used show their next finding, all information.
Merge gate (orchestrator): footprint exits 1 on code-intel only, through its tests. Exception recorded in the proposal history (operation task-646-17-exceptions). EXPOSED_UNUSED warnings on this repository went from 2156 to 1480.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
In a folder module that declares no interface, a name another file of the module imports now counts as used, so EXPOSED_UNUSED no longer warns on names only sibling files need (owner decision 16).

What changed:
- Module depth: sibling-uses.ts decides whether a module declares its interface (a file there stands for it, such as index.ts, __init__.py, mod.rs or a project file; a root file outside its top level; or package.json exports) and, where it declares none, collects the uses its own files (tests aside) make, through an import naming another of its files, of definitions there. EXPOSED_UNUSED skips a name such a use reaches. Sibling uses feed no other rule, so they never raise EXPOSED_VALUE.
- Applies in every judged language through imports: TypeScript and C/C++/Objective-C (a module without include/) gain it; Go and Swift files see their module's names without an import, so an exported name only they use stays a finding; Python, Rust and C# modules always have an entry file and keep the old rule.
- Docs: ADR 0082, the archboard skill's design lens, CONTEXT.md.

Verification: module-depth-names test covers an index-less folder (sibling-used name clears; unused and test-only names warn), a package.json-exports module and an index module (sibling use still warns); c-check now expects notify used by mail.c beside it; swift-check unchanged. test:modules 5188 pass, types, lint, format clean.

On this repository (archboard check code, merged tip): EXPOSED_UNUSED warnings 2156 -> 1480 (information 40 -> 12); all 704 cleared findings are EXPOSED_UNUSED on TypeScript modules, and no warning is new.

Surfaced on modules this ticket does not change: CODE_PASS_THROUGH information on 2 modules (Thread link, Epoch ledger; 3 names) and REEXPORT_PASS_THROUGH information on 1 (Server launcher; 2 names): names that are now used show their next finding.

Risks / follow-ups: footprint exits 1 only on code-intel (tests). A namespace import of a sibling file counts each name it reaches by reference, as outside uses do.
<!-- SECTION:FINAL_SUMMARY:END -->
