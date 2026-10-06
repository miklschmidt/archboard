---
id: TASK-368.10
title: The code check compares a drawn interface with the interface the code declares
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 13:43'
labels:
  - interfaces
  - code-check
dependencies:
  - TASK-368.02
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 646000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The board says which children callers reach. The code says which names a module exposes: root files and package exports in TypeScript, `__all__` in Python, `public` in C#, `public` and `open` in Swift, public headers in C, C++ and Objective-C. The language adapters of TASK-367 give every definition its visibility. On 2026-09-29, 18 of the 40 names that the store's `index.ts` exports had no caller outside the store.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An entry point bound to a definition that the code does not expose is reported, because the board draws a caller that reaches past the interface
- [ ] #2 A hidden part bound to an exposed definition that an outside file uses is reported as a caller the board does not draw
- [ ] #3 Exposed names that nothing outside the module uses are reported as information, not as a warning
- [ ] #4 It works for TypeScript first, and for each language whose adapter gives visibility
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-368.10 changes the Code check part's responsibility and description (it now holds each container's interface against what its module exposes, with the three new codes), the Code facts description (each adapter says what a module exposes) and the label of Code check -> Code facts. No new part or relationship: the work stays inside src/runtime/code-check and src/runtime/code-facts, and the shared model's inspectContainer is a pure function, not drawn. No other board draws the code check.
1. Code facts (behind the adapter seam): new lib/module-exposure.ts with a table of exposure rules by adapter. moduleOf(path, kind): a bound directory, or the entry file the adapter names (TypeScript index.ts/tsx/mts/cts) as its directory. moduleExposure(pass, checkout, directory): the rule's root files (TypeScript: package.json exports where present and naming files of the checkout, else the TypeScript files directly in the directory), each exposed name followed through re-exports to its definition (public members of an exposed holder too), and the files outside the module the same adapter reads (where callers live). undefined when no rule reads the module. Python (TASK-367.08) adds its rule: __init__.py and __all__.
2. Code check: new lib/interfaces.ts. For each container on each board whose binding names a module: derive the interface with inspectContainer (ADR 0044), read what the module exposes, find the uses of exposed definitions in outside non-test files (a reference whose import leads into the module, followed with definitionSite). Ownership of exposed definitions by the narrowest binding (evidence.ts owners, exported). Findings: ENTRY_POINT_UNEXPOSED (warning) on an entry point whose bound code holds no exposed definition; CALLER_UNDRAWN (warning, information on a candidate) on a hidden part holding an exposed definition that an outside file uses at run time, unless a part on the board owns that use (then RELATIONSHIP_UNDRAWN already says it or a relationship is drawn), judged only when the container has a caller on the board; EXPOSED_UNUSED (information) on the container, naming the exposed names nothing outside uses (a use as a type counts). Skip exposure-unknown when no adapter reads the module's root files or package.json exports names no file.
3. Wire in check.ts after the relationships; codes and skip reason in src/shared/code-check.
4. Tests: src/runtime/code-check/tests/interfaces.test.ts (fixture checkout with a module, index re-exports, a private file, outside callers, a test file, a type-only use); code-facts owner for exposure rules (root files, package.json exports, members, re-export chains).
5. authoring.md, evals/coverage.json, docs/design/cli-command-audit.json; eval:skill check.
6. Restart, run ./bin/dogfood check --code, judge every new finding (Board store on Board persistence is the measured example: 18 of 40 unused). Close the proposal per archboard-dev.
<!-- SECTION:PLAN:END -->
