---
id: TASK-368.10
title: The code check compares a drawn interface with the interface the code declares
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 14:50'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (7d0be472a code, 00994e518 skill/coverage/audit): src/runtime/code-facts/lib/module-exposure.ts (the seam: moduleOf, moduleExposure, a table of exposure rules, one per language) and typescript-exposure.ts (TypeScript's rule); src/runtime/code-check/lib/interfaces.ts (the judgement), wired in check.ts after the relationships of each board; evidence.ts exports its ownership helpers (ownersOf, ownersAtLine, ownersOfSite), part-code.ts isTestPath, relationships.ts siteOf. Tests: src/runtime/code-check/tests/interfaces.test.ts and src/runtime/code-facts/tests/module-exposure.test.ts; relationships.test.ts filters EXPOSED_UNUSED out of its exact list (the store fixture's root file list.ts exposes an unused name).

Finding codes (src/shared/code-check header): ENTRY_POINT_UNEXPOSED (warning, information on candidates), CALLER_UNDRAWN (warning, information on candidates), EXPOSED_UNUSED (information); skip reason exposure-unknown.

Decisions the ADRs left open:
1. A module is a directory. A container names one when bound to a directory, or to the file the language says stands for its directory (TypeScript index.ts/.tsx/.mts/.cts; Python's would be __init__.py). A container bound to another file or to a symbol names no module and is not judged (no board draws such a container with children inside its file).
2. TypeScript's root files: the files package.json exports names (string, condition and subpath values; a .js target stands for .ts/.tsx; * patterns), where the directory has a package.json with exports; else every TypeScript file directly in the directory (boundaries.md: every root file is an entrypoint, a subfolder is private). An exports that names only built output (dist) names no file of the checkout: exposure-unknown, listed as a skip, never guessed.
3. What a root file exposes: each exported declaration and each public member of one (Ledger.post), each name it passes on with export { a as b } from, export * from (not default) and export * as ns from, followed to the defining file; via lists the files that pass it on, so a part bound to an index owns what no narrower part binds (the ownership rule of evidence.ts).
4. Ownership of an exposed definition is the narrowest binding (ADR 0046 bound code), as for evidence; a child owns what it or a part inside it owns.
5. A use is a reference in a file outside the module whose import leads into the module, followed with definitionSite to a definition inside it. A test file (isTestPath) is no caller, as for evidence. A use only as a type counts as a use for EXPOSED_UNUSED (the design note counted 13 types among the names) but not as a caller for CALLER_UNDRAWN (never a dependency at run time, as RELATIONSHIP_UNDRAWN).
6. ENTRY_POINT_UNEXPOSED needs code evidence: an entry point that owns nothing exposed is reported only where the code of a caller the board draws to it reaches it from a file outside the module (an evidence piece from the caller's side to the entry point's side whose path is outside the module); the finding carries those pieces. Reason: on the dogfood vault the unconditional rule gave 22 warnings that no right change clears: http routes reached by the Agent CLI or the browser (the module's exports are not how a network caller reaches a route), and callers drawn outside a container whose code lies inside the module (Render stage states on Board viewer). ADR 0046 makes a warning need the check to be sure; with a use from outside it is.
7. CALLER_UNDRAWN: one finding per hidden part, one piece per top-level exposed name it owns (the first run-time use in file order by a file no board part owns at that line). A use whose line a part on the board owns is left to RELATIONSHIP_UNDRAWN or is drawn (ADR 0046: no second finding); decided by ownership at the line rather than by pieces, because pieces keep only the first line of each pair. Judged only where the board draws some caller of the container: a board that draws none says nothing about the interface (ADR 0044, TASK-368.03).
8. EXPOSED_UNUSED: one finding per container, the names in its message (top-level names; members count for their holder), the count against the module's top-level names. A module drawn on two boards is read once per pass and reported on each board.
9. A child is judged only where its bound code lies in the module and a grammar read some of it.
10. A container whose code the pass skipped (unregistered repository, other ref, ignored path) is listed with that reason, so its interface never looks judged.
11. Python: TASK-367.08 landed its adapter (a665606e1) while this task ran, but the exposure rule is not in the table. Python's facts mark only from x import * as a re-export, and do not keep __all__ apart from the definitions' visibility, so the names an __init__.py passes on (from .book import Ledger listed in __all__) are not readable; a partial rule would warn falsely. What Python needs: its adapter records the names __init__.py passes on (listed in __all__, or public imports when it sets none) as re-exports; then the rule is writes /\.pyi?$/, entry __init__.py(i), root file __init__.py, exposedBy like TypeScript's.

Known gaps: export { a } of a name the root file imports, and export { a as b } of a local, are not seen as exposed (code facts keep no export clause since 6caf00794 made it no use); a name taken from await import() is no use (so runCli reads as unused); a use through another module's re-export is not followed back; a re-export from a file read as text is lost.

Measured: the whole pass on the dogfood vault in a fresh process 2.2-2.5 s before, 2.8-3.0 s after (it now reads every TypeScript file outside each module once).

Real check on the dogfood vault (direct pass from a HEAD copy, and ./bin/dogfood check --code after a restart, same counts): this task adds 0 ENTRY_POINT_UNEXPOSED, 7 CALLER_UNDRAWN (warnings) and 14 EXPOSED_UNUSED (information), no exposure-unknown. The relationship findings are unchanged (86 undrawn, 186 unsupported, 19 backwards).
CALLER_UNDRAWN, each right by the rule (code outside the module uses the hidden part's exposed code, and no part on the board binds that file): Board viewer: Picture source, Picture cache, Local pictures <- frontend/main.tsx (the page's entry wires the picture source and storage); Semantic queries <- board-catalog and vault-diagnostics hooks (semanticBoardKeys, semanticBoardListQuery, vaultCheckQuery). Semantic renderer: View dispatcher <- SemanticSubjectTip.tsx and SemanticTypeSamples.tsx in the viewer (lineInk, lineWidth, standingMark through the renderer's index); Measured text <- src/runtime/semantic-renderer/measurement.ts (measureArchitectureIn). Voice coordinator: Tell coordinator <- codex-workhorse-start/lib/model.ts and codex-workbench-factories.ts (exported constants). The repair is the board's (TASK-367.27): draw the caller the board's question needs, or accept it.
EXPOSED_UNUSED: Board store (Board persistence, the measured example) 19 of its 42 names: 5 functions and constants (SEMANTIC_BOARD_FILE_SUFFIX, SEMANTIC_BOARD_CONFIG_PATH, semanticBoardConfigurationPath, resolveSemanticBoard, unsettledAncestor) and 14 types; the design note measured 18 of 40 (5 and 13) on 09-29, and the index has gained 2 names since. Others: Archboard server 84/85, Headless browser 5/14, Semantic viewer 61/87, Browser client 62/63, Codex session 13/23, Coordinator callbacks 31/43 (two boards), Command routing 6/13, Command contract 48/74, Commands 114/115 (each command file is a root file whose contract only run.ts inside the module uses), Renderer core 52/76 (two boards), Evaluation harness 214/227. Spot checks with git grep agree (parseTrace, mountCodeCheckRoute, resolveSemanticBoard used only inside or by tests). One is wrong: runCli in Commands is used by src/bin.ts through const { runCli } = await import(...), which code facts read as a load of the whole file, not a use of the name.
ENTRY_POINT_UNEXPOSED before decision 6 gave 22 warnings (8 http routes on Archboard server, 12 on Board viewer whose drawn caller Render stage states is code inside the module, 2 on Codex session reached through values); with it, none.

Closing: Archboard server@TASK-368.10 corrected to what was built (Code check description: the evidence condition and exposure-unknown; summary = the board's scope) and adopted at v83. Footprint against base c9ea4a894 (parent of 7d0be472a): namedAndChanged Code check and Code facts (7d0be472a; a665606e1 is TASK-367.08's); changedNotNamed none; namedNotChanged none; current was the proposal's parent. ./bin/dogfood check: no diagnostics. Behind: this task's commits change only src/runtime/code-check and src/runtime/code-facts, which only Archboard server draws, adopted now.

Gate (lanes one at a time, working tree with other agents' uncommitted edits): lint 0; fmt:check 1, only on INSTALL.md and src/runtime/code-check/tests/language-servers.test.ts (TASK-367.13's uncommitted files); type-check 0; build:frontend 0; test:modules 4133 pass 0 fail; test:system 195/0; test:repository 20/0; test:serial-browser exit 0. My files also verified on a HEAD copy: lint, oxfmt, tsc, code-check and code-facts tests. eval:skill check: suite ok. Left out of the fence: src/cli/commands/vault.ts check --code help does not name the three codes.
<!-- SECTION:NOTES:END -->
