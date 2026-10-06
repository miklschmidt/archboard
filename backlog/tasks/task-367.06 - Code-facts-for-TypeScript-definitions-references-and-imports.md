---
id: TASK-367.06
title: 'Code facts for TypeScript: definitions, references and imports'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 12:51'
labels:
  - code-check
dependencies:
  - TASK-367.02
  - TASK-367.05
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: feature
ordinal: 614000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first language adapter, and the engine behind all of them. Tree-sitter finds what each file defines (with its visibility), what it references and what it imports. The text check of the tracer then becomes syntax-aware for TypeScript, so a symbol in a comment or a string no longer counts. Archboard itself is TypeScript, so the dogfood vault tests the adapter on real boards.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A runtime module answers, for a TypeScript or TSX file in a checkout: its definitions with their visibility (exported or not), its references, and its imports resolved through `tsconfig` paths and aliases such as `@/`
- [ ] #2 Results are cached by file content, and a second run over unchanged files reads the cache
- [ ] #3 The anchor and binding checks use definitions and references for TypeScript files instead of text
- [ ] #4 The time to read the dogfood vault's bound files is measured and recorded in the design note
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.06 adds Code facts (src/runtime/code-facts) and Code check -> Code facts (call, anchored at createCodeFacts in src/runtime/code-check/lib/check.ts); Code check's description reads code facts. No other board draws the code check.
1. Packages: web-tree-sitter 0.27.0 and tree-sitter-typescript 0.23.2, exact runtime pins, not trusted (done in 2ae183442).
2. src/runtime/code-facts (new): grammars.ts loads web-tree-sitter and the TypeScript and TSX grammars once from node_modules (ADR 0014); typescript.scm is the one query file (definitions, references, imports, environment and event strings, ERROR nodes); typescript-adapter.ts turns captures into facts: definitions qualified by their containers (Ledger.post) with visibility in TypeScript's word and exposed; references deduplicated per spelling and use, with evidence kind call or import and type-only; imports with names, type-only by declaration or by use; unparsed line ranges with the names inside. text-reading.ts moves here as the text adapter. module-resolution.ts resolves import specifiers per pass: relative, tsconfig paths and baseUrl through relative extends, extension and index probing against the files Git lists. Cache: one entry per real file path, keyed on the hash of its bytes and the adapter; a pass reads and hashes every file again and parses only on a miss. A pass yields to the event loop after each parse. definitionOf follows an import and re-export chain to the file that defines a symbol.
3. src/runtime/code-check: the facts cache replaces createTextFiles; holdsSymbol asks code facts per file: a binding symbol must be a definition, an anchor a definition or a reference; a symbol found only in unparsed code is a skip (new reason symbol-unparsed); text-only narrows to checkouts where the pass read a file as text, naming the extensions. ANCHOR_MISMATCH (warning, resolved) when the anchor's symbol resolves to a definition in the checkout that is in the bound code of neither end nor of a part inside an end.
4. Shared: the new skip reason in CodeCheckSkipSchema; timing constant only if a duration is added.
5. Tests: code-facts owner (TypeScript and TSX facts, visibility, type-only, primitives.ts regex keeps the rest of its facts, unparsed skip, tsconfig paths and @/ resolution, cache hit on a second pass and miss after an edit); code-check owner extended (definition vs reference, comment and string no longer count, unparsed skip, ANCHOR_MISMATCH, text-only narrowed).
6. Measure reading the dogfood vault's bound files cold and warm; record in docs/design/design-checks.md. authoring.md names ANCHOR_MISMATCH. Run ./bin/dogfood check --code after a restart and explain each finding. Close the proposal per archboard-dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (2ae183442 packages, 42d2f428a code facts, 773433125 integration, 45025d176 measurement, e0d5dccc9 type shim): src/runtime/code-facts with grammars.ts (web-tree-sitter and the two TypeScript grammars, loaded once from node_modules), typescript.scm (the one query of both grammars), typescript-adapter/definitions/imports.ts, module-resolution.ts (tsconfig paths, relative extends, baseUrl, bundler probing), reader.ts (cache and pass), definition-site.ts (follows imports and re-exports), lookup.ts (findSymbol), never-read.ts (moved from code-check), text-reading.ts (moved from code-check, the text adapter). code-check: check.ts asks code facts per file through symbols.ts; support.ts judges ANCHOR_MISMATCH; claims carry holders (the ends and every part inside one); text-reading.ts and createTextFiles are gone; tests/fixture.ts is shared by both owners.

Decisions the ADR left open:
1. Strings that count as references: only the name of an environment value (x.env.NAME, x.env["NAME"], so process.env, Bun.env and import.meta.env) and of an event (the first string argument of on, once, off, emit, addListener, removeListener, prependListener, prependOnceListener, addEventListener, removeEventListener, and of new Event, CustomEvent or MessageEvent). These are the two strings ADR 0046 lets an anchor cite (an environment value a file reads, an event one end defines); every other string is text such as a message or a key, so a symbol there is absent. A string reference has via environment or event and no evidence kind: an environment value is a configured path only once infrastructure sets it (TASK-367.23).
2. A definition is a declaration at module level (or in a namespace body) or a member of one: class, interface, object type, enum, and object-literal members of a module-level const (api.read). A declaration inside a function body is local and no definition. A member is qualified by what holds it (Ledger.post). Visibility words: export, export default, module (not exported) for declarations; public, protected, private, #private for members. exposed = an exported declaration, or a public member of an exposed holder. Exposure means outside the file; what a module root exposes (TASK-368.10) is not decided here.
3. A binding symbol matches a definition by its qualified name or by its trailing names (post finds Ledger.post; Ledger.post never finds a function post). An anchor symbol also holds where the file uses it: its spelling, else its last name, because only a language server knows what a value is (TASK-367.13). Text files keep the last-name rule.
4. References are deduplicated per spelling, way of use (code, environment, event) and type-only, at the first line, to keep the cache small (136k on all of src). A use at run time is call evidence, a use only in a type position import evidence; an import name is type-only when declared type or when every use is a type.
5. Imports resolve on each pass: relative; else the nearest tsconfig.json (paths with longest-prefix pattern, relative extends followed up to 8 deep, baseUrl); package extends are not followed (they live in an ignored node_modules). A candidate resolves only to a file Git lists. JavaScript files (.js, .jsx, .mjs, .cjs) stay text: the approved grammar set names TypeScript and TSX, and a JavaScript reading would need its own tests.
6. The cache key is the real absolute path; the entry holds Bun.hash of the bytes, the grammar and the parsed facts (resolution is per pass). Files read as text are not cached: their facts are their bytes, which every pass reads anyway.
7. The event loop: a pass yields with setImmediate after each parse, so no Worker and no timing constant were needed (no duration was added to timing.ts). Measured: longest wait 7 to 8 ms in a cold pass over the dogfood vault's 1,154 bound files; the grammars load once per process in about 95 ms.
8. Unparsed code: an outermost ERROR node is one unparsed part with the words written in it. A symbol absent from the facts whose last name is among those words is the new skip symbol-unparsed, detail path:line(s), never a finding.
9. ANCHOR_MISMATCH is judged only where code facts find the definition: in the anchored file, or where an import of its spelling or its first names leads through every re-export (resolved, so a warning). A name reached only through a value (ledger.post()) is not judged. The definition is held by an end when a holder (an end or a part inside one, by parent) binds it: a symbol-less binding holds the defining file or a re-exporting file on the chain (a part bound to a module's index.ts holds what the index passes on); a symbol binding holds definitions within its definition's lines. A holder whose binding the pass cannot read (missing path, other ref, ignored, symbol not found) makes the check unable to tell: no finding. An unbound end holds nothing (ADR: bound code of neither end). Evidence is the anchored use (call or import, resolved, path and line); a symbol the anchored file only defines gives none.
10. text-only narrows to a checkout where the pass read at least one file as text, once, with the kinds of file (extensions) in detail.
11. web-tree-sitter 0.27.0's declarations name the global EmscriptenModule from @types/emscripten, which it does not install; tsconfig has skipLibCheck false. Rather than add an unapproved package, src/runtime/code-facts/lib/emscripten-module.d.ts declares the type (e0d5dccc9). Installing @types/emscripten would replace it.

Measured (Bun 1.4.2, 773433125): dogfood vault 310 bindings, 1,154 files, 1,046 TypeScript. Cold pass 1,681 to 1,767 ms, warm 48 to 57 ms (0 parsed, 1,046 cached), grammar load and first parse 91 to 99 ms. All 2,032 tracked src TS/TSX files: parse 1,220 ms, facts 1,612 ms, longest file 14 ms. Real ./bin/dogfood check --code after a restart: 1,582 ms, then 1,141 ms.

Real ./bin/dogfood check --code on the dogfood vault (after a server restart, 15 boards; current variants hold 8 anchors and 2 bound symbols): exit 1 with two ANCHOR_MISMATCH warnings and no skips. Both are anchors TASK-367.24 adopted, and both are right by ADR 0046: (1) Archboard server, Browser -> Code check route, anchored at fetchCodeFindings in src/ui/semantic-board-canvas/api/semantic-boards.ts, which that file defines (line 304); Browser binds src/ui/application/index.tsx and Code check route binds code-check-route.ts, so neither holds it. Evidence: call at semantic-boards.ts:317. (2) Board viewer, Render stage states -> Semantic queries, anchored at useCodeFindings in SemanticInspector.tsx, which hooks/use-code-findings.ts defines (line 28); the ends bind SemanticStageView.tsx and lib/queries.ts. Evidence: call at SemanticInspector.tsx:489. A clearing change for (2): anchor at hooks/use-code-findings.ts with codeFindingsQuery (defined in lib/queries.ts), or bind the hook to a part. For (1): bind Browser to the browser application's code, or cite what the route's own code defines. These boards belong to TASK-367.24's closing; TASK-367.06 did not edit them. The other six anchors and both bound symbols hold and support.

Close of the proposal: Archboard server@TASK-367.06 branched from TASK-367.05's variant; TASK-367.24 adopted after, so the change was restated as TASK-367.06 after TASK-367.24 (same node, node change and anchored relationship), TASK-367.06 shelved with that reason, and adopted at v62 with the board's scope as its summary. Footprint against base 78eb66dc5 (parent of 2ae183442): namedAndChanged Code check (773433125; 4444544e8 is TASK-367.05's) and Code facts; changedNotNamed Archboard server, Code check route, Code findings memory (only 8eeca0e71, TASK-367.24) and History lens (ae06ac9f3, 6dedeead0, TASK-369.04); namedNotChanged none. ./bin/dogfood check: no diagnostics. Behind after adoption names none of this task's commits.
<!-- SECTION:NOTES:END -->
