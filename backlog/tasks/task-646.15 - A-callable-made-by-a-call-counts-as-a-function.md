---
id: TASK-646.15
title: A callable made by a call counts as a function
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T01:11:00Z'
updated_date: '2026-11-19T02:00:00Z'
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
- [x] #1 An export made by `Object.assign` of a function or component counts as a function, and gets no `EXPOSED_VALUE`
- [x] #2 An export whose value the language server types as callable counts as a function
- [x] #3 An exported zod schema still gets `EXPOSED_VALUE`
- [x] #4 The archboard skill shows how a contract module hides its schemas: export a parse function and the derived types, and keep the schema inside
- [x] #5 Module depth tests cover each case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fact analysis (TypeScript): a declaration whose value is another name, through as/satisfies/parentheses and Object.assign onto it, carries Definition.aliases (Object.assign(DialogRoot, {...}) aliases DialogRoot); its kind is what Object.assign extends when that is a literal.
2. Module depth: an exported value that aliases a name is what that name is, followed through definitionSite across files (a function or a class); any other value is what its language server types it as: semantic token function or method counts as a function, class as a class.
3. Language servers: the client asks textDocument/semanticTokens/range for one line (measured: a whole file doubled the server time on this repository); the session asks once per line. Code check: the pass carries the question to Module depth, and asks it of no tree of a ref (onDisk generalises resolveOnDisk).
4. Tests: module-depth-callables.test.ts over a fixture checkout, once with no server (Object.assign onto a local function, an imported function and an arrow; zod schema a value) and once with Archboard's tsc (a cva-like factory result counts as a function).
5. Docs: archboard skill design lens (callables, contract module hides its schemas behind a parse function and derived types), CONTEXT.md Export kind, ADR 0082.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence:
- AC1, AC3, AC5: packages/code-intel/tests/runtime/code-check/operations/module-depth-callables.test.ts, with the TypeScript server configured to a command that does not exist: Ui's three Object.assign exports (onto a function of its file, onto a function another module defines, onto an arrow) count as 3 functions and 0 values with no EXPOSED_VALUE; the zod schema (real zod) counts as a value and gets EXPOSED_VALUE.
- AC2, AC5: same file with Archboard's tsc --lsp (skips where no native tsc): the result of a factory that returns a function counts as a function, no EXPOSED_VALUE; the zod schema still gets EXPOSED_VALUE.
- AC4: skills/archboard/references/design-lens.md (EXPOSED_VALUE) shows a contract module keeping its schema inside and exporting parseUser and the derived type User; CONTEXT.md Export kind and ADR 0082 say the same.
- Lanes after merging feat/module-depth: test:modules 5151 pass, test:repository 174 pass, type-check, lint:tests, lint:policy, oxlint on code-intel, format:check clean.
- On this repository: archboard check findings are the base's minus 16 EXPOSED_VALUE warnings, all on ui-kit (14 compound components, buttonVariants, cn); nothing new. Language-server time rose about 1.6 s with one-line ranges (whole-file tokens cost about 7.6 s, same findings). check code --fail-shallow-modules --base feat/module-depth: no MODULE_SHALLOW on a touched module; only Repositories (untouched), information.
- Footprint --fail-outside exits 1: changedNotNamed code-intel (the new test file) and Language servers (the semantic-tokens question AC2 needs). Code check (the pass carries the question to Module depth; ref-code onDisk) is named in the proposal but outside this ticket's slice; Fact analysis (Definition.aliases) is the slice's endpoint.
- code-intel keeps 5 pre-existing EXPOSED_VALUE warnings on zod schemas of its shared protocol (CodeCheckAnswerSchema, CodeSourceLinesSchema, RememberedFindingsSchema, ArchitectureHistoryRequestSchema, ArchitectureHistoryResultSchema). Decision 14 keeps them values; clearing them changes the CLI, web, server, scripts and site callers, so they are left to TASK-646.14.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An exported value that can be called now counts as a function, so compound components and class-name helpers no longer get EXPOSED_VALUE; a zod schema stays a value.

What changed:
- Fact analysis (TypeScript): a declaration whose value is another name, through as, satisfies, parentheses and Object.assign onto it, carries Definition.aliases. Object.assign onto a function literal is a function.
- Module depth: a value that aliases a name is what that name is, wherever it is defined (definitionSite, across files). Any other value is what the language server types it as: the semantic token function or method makes it a function, class a class. The listed exports and counts use these kinds.
- Language servers: the client asks textDocument/semanticTokens/range for the one line that declares the name, once per line in a pass. A server without range tokens gives none, and the export stays as its syntax says.
- Code check: the pass carries the question to Module depth and asks it of no tree of a ref (onDisk now serves both questions; the ref skip says so).
- Docs: the archboard skill shows the callable rule and how a contract module hides its schemas behind a parse function and derived types; CONTEXT.md; ADR 0082.

Verification: module-depth-callables test (with and without a server); test:modules 5151 pass, test:repository 174 pass, type-check, lint, format clean. On this repository EXPOSED_VALUE drops from 246 to 230 (16 on ui-kit) and nothing new appears.

Surfaced on modules this ticket does not change: none.

Risks / follow-ups: the footprint gate exits 1 on Language servers (the AC2 question) and code-intel (the test file); Code check changed outside the slice. code-intel keeps 5 pre-existing EXPOSED_VALUE warnings on its protocol zod schemas, which need changes in their CLI, web, server and script callers (TASK-646.14). Without a TypeScript server, a callable that a factory makes reads as a value.
<!-- SECTION:FINAL_SUMMARY:END -->
