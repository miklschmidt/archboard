---
id: TASK-367.06
title: 'Code facts for TypeScript: definitions, references and imports'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 12:25'
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
