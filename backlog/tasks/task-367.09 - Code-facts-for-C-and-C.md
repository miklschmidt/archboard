---
id: TASK-367.09
title: Code facts for C and C++
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 15:49'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 617000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In C and C++, a dependency is an include, and what an include names depends on the include paths of the build. A part is often bound to a source file while its interface is in a header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `#include` resolves through `compile_commands.json` when the checkout has one, and through relative paths and configured include directories when it has none
- [ ] #2 Definitions carry their visibility: declared in a public header, or `static` and anonymous-namespace names that are internal
- [ ] #3 A part bound to a header or to its source file finds the definitions of the pair
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to C and C++ files
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.09 changes the descriptions of Code facts (the C and C++ adapters, includes, the pair) and Code check (a part bound to a C or C++ file owns its pair). No new part or relationship.
1. New files in src/runtime/code-facts/lib: c.scm (one query that compiles under tree-sitter-c 0.24.1 and tree-sitter-cpp 0.23.4: names, includes, getenv strings, ERROR), c-adapter.ts / c-definitions.ts / c-references.ts (definitions qualified with :: by namespace and class, visibility in C's words: extern, static, anonymous namespace, no linkage, macro, and public/protected/private for members; references with call or import evidence and type-only), c-resolution.ts (includes through the nearest listed compile_commands.json: the including file's directory for quoted includes, then -iquote, -I, -isystem; without one, ADR 0046's fallback: the including file's directory, the checkout root, each directory named include), c-pairs.ts (a header and its source file). Two entries in ADAPTERS, c (.c) and cpp (.cc .cpp .cxx .h .hh .hpp .hxx, a .h read by the C++ grammar, measured on real C headers), sharing the query, facts and resolver.
2. The include model needs three small shared changes, each language-neutral: Import gains inScope (every name its file declares, or passes on, is in scope here, as a C #include puts it); definitionSite searches a file's in-scope imports for a name it neither defines nor imports by name; the evidence of a use no import names asks that search before the language server. lookup.ts compares :: as it compares . so a C++ binding is spelled as C++ spells it.
3. The pair (criterion 3): the bound code of a part bound to a C or C++ file is the file and its pair; the evidence owners give a pair to its part only where no part binds that file itself. Anchors stay one file.
4. Owners: code-facts/tests/c-facts.test.ts over the fixture project tests/fixtures/c-shop (with and without compile_commands.json), code-check/tests/c-check.test.ts (anchor, binding, undrawn, backwards, the pair).
5. Try it on Redis or SQLite (C) and leveldb (C++) cloned to scratch, through a temporary vault with bound parts; record the measurement in design-checks.md; authoring.md names the languages the check reads.
6. Close the proposal per archboard-dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (8b92116bc code facts, 671c4bab2 check, e33a567b2 docs): src/runtime/code-facts gains c.scm (one query that compiles under tree-sitter-c 0.24.1 and tree-sitter-cpp 0.23.4), c-adapter.ts (references, includes), c-definitions.ts, c-unparsed.ts, c-resolution.ts (includes), c-pairs.ts (pairOf) and include-scope.ts (where a use is defined through the includes). Two entries in ADAPTERS, c and cpp, sharing query, facts and resolver. Owners: code-facts/tests/c-facts.test.ts over fixtures/c-shop (with and without compile_commands.json), code-check/tests/c-check.test.ts.

Decisions the ADR left open:
1. Extensions: .c is C; .cc, .cpp, .cxx, .h, .hh, .hpp, .hxx are C++. A .h goes to the C++ grammar because, measured by error lines, C headers parse the same under both (Redis src 431 C vs 427 C++, SQLite src 20 vs 20) while C++ headers fail under C (leveldb 1,434 vs 163). An extension maps to one grammar in the table, so the choice cannot be per file.
2. Definitions: functions, prototypes, variables, types with a body, typedefs, using aliases, enumerators (scoped by the enum only for enum class) and macros, at file scope, in namespaces, in extern "C" and under preprocessor conditions, and class members. Qualified with :: as C++ spells it (shop::Ledger::post). A namespace is not a definition (it spans files); a forward declaration is not; nothing in a function body is.
3. Visibility words, decided by the file alone: extern (external linkage, exposed), static (internal), anonymous namespace (internal), no linkage (types, typedefs, enumerators; exposed), macro (exposed), and public/protected/private for members (exposed when public and the class is exposed). An out-of-class member definition takes the access its class body in the same file gives it. Which header is public is a fact about paths, and ParsedFacts depend on bytes alone, so "declared in a public header" is expressed by the pair (decision 6), not by a word on the definition. No C module-exposure rule was added to module-exposure.ts (TASK-368.10's file).
4. References: a type name is import evidence and type-only; a type name that constructs (new T(...), T x(...), a base class) is call evidence; every other name is a call (function call, value, macro). A plain T x; is a type, because a C struct runs no code there. A name after :: keeps its qualifier; a field after . or -> is spelled through . as TypeScript spells a use through a value. Parameters and locals of the enclosing function are not uses. Names in attributes and #if/#elif conditions are no use. getenv/secure_getenv/std::getenv("NAME") are environment names.
5. Includes: an import of * marked inScope (a new optional field on Import): every name of the header is in scope. Resolution with compile_commands.json: the nearest one Git lists in the file's directory or above, or in build/ there (as clangd looks); per file its -iquote, -I, -isystem (a header with no entry uses the union of every entry); quoted: own directory, -iquote, -I, -isystem; angle: -I, -isystem; directories outside the checkout hold nothing. Without one, the ADR's fallback: the including file's directory, the checkout root, each directory named include. The ADR's last step, matching an unresolved include by file name as a candidate, is not built: an import has no way to say it is a candidate, and as resolved evidence a wrong match would be a warning.
6. The pair (criterion 3): the file of the other role with the same name beside it, or the only one of that name and role in the checkout (include/shop/ledger.h for src/ledger.c). The bound code of a part bound to a C or C++ file is the file and its pair (readableOf(..., bound) in code-check/lib/checkouts.ts): a bound symbol is found in either, and the evidence owners give the pair to that part where no part binds the pair itself. An anchor names one file.
7. A use reaches the first header, in include order and then each header's includes, that defines it; a bare name finds only a non-member, and a site names no header between (a header that only includes another passes no code on). It is resolved evidence, because each include names its file.
8. Code that did not parse: tree-sitter wraps everything after an unclosable #if in one ERROR node while the declarations inside parse whole (SQLite analyze.c, 1,871 of 2,013 lines). The adapter reads whole declarations inside an error node and counts only the unsound pieces as unparsed: SQLite 68,067 -> 4,385 lines, Redis 8,104 -> 2,845.
9. lookup.ts compares :: as . so a binding spells a C++ name either way (shop::Ledger::post, Ledger.post, post).

Outside the write scope, and why: criterion 3 and evidence through includes cannot be met inside code-facts alone, because ownership and bound files live in code-check and the reader computes targets only from named imports. Shared edits, each language-neutral and small: facts.ts (Import.inScope), definition-site.ts (searches a file's in-scope imports last; usedTargets tests the target before the spelling, a speed fix), lookup.ts (:: as .), index.ts (pairOf), code-check checkouts.ts (readableOf takes bound), part-code.ts (pairsOf), check.ts and support.ts (pass bound), evidence.ts (pairs in ownersOf; includedSiteOf before the language server).

Real projects (shallow clones in the session scratch, no build run): Redis 7f44037 (796 files, 377,340 lines) cold 3.5 s, warm 55 ms, 1,550 of 3,236 includes resolved; SQLite 6222fff (359 files, 460,758 lines) 3.5 s, 264 of 1,505; leveldb 7ee830d (133 files) 377 ms, 498 of 778. The longest single file, SQLite autosetup/jimsh0.c (25,495 lines), takes ~100 ms to parse and ~145 ms for facts in one turn of the event loop. A temporary vault: 12 parts bound to Redis src and 7 relationships, 1,223 ms cold, 477 ms warm; 9 parts on leveldb and 5 relationships, 325/157 ms, identical with a hand-written compile_commands.json. Findings: planted BINDING_SYMBOL_MISSING and ANCHOR_SYMBOL_MISSING; RELATIONSHIP_UNDRAWN with resolved evidence through dict.h, sds.h (part bound to the header owning sds.c), cluster.h's CLUSTER_SLOTS, ae.h, rdb.h, and in leveldb log::Writer, TableBuilder, NewLRUCache, Log through include/leveldb headers paired with their sources; RELATIONSHIP_BACKWARDS where drawn the wrong way; the cited anchors flushAppendOnlyFile and log::Writer hold and support. Two limits: Redis declares nearly everything in server.h, so uses of functions of other files reach the part bound to server.c (whose pair is server.h); leveldb declares WriteBatchInternal::Append in db/write_batch_internal.h and defines it in db/write_batch.cc, no pair, so an anchor citing it reads as ANCHOR_MISMATCH. An include names a declaration's file; clangd (TASK-367.15) names the definition.

What TASK-367.10 (Objective-C) reuses: c-resolution.ts (createCResolver: #import and #include resolve the same; @import is a module and needs its own rule), the inScope import and include-scope.ts, c-pairs.ts (add .m and .mm to SOURCES), c-unparsed.ts (error nodes with whole declarations inside), and the shape of c-adapter.ts/c-definitions.ts. The macro blanking the ADR asks for fits the facts function, which now gets the text (ParseFacts).

Closing: Archboard server@TASK-367.09 branched from JDl7Ci6C; TASK-367.17 and then TASK-367.12 adopted after, so the change (the Code facts and Code check descriptions, both near the 2,000-character limit, so other sentences were shortened to fit: Nix lost "never evaluated" and the list of what it reads through, TypeScript lost "with their visibility", and the sentence on strings and the cache sentence got terser) was restated as "TASK-367.09 after TASK-367.17" and then "TASK-367.09 after TASK-367.12"; the older two were shelved with that reason, and the last adopted (rRJ0t8ZE). check --code with and without --variant: no line differs (39 findings, none about Code facts or Code check). Footprint against base 50b8ce9ed: namedAndChanged Code check and Code facts; changedNotNamed Archboard server and Code check route, changed only by other tasks' commits; namedNotChanged none; 5 parts skipped. ./bin/dogfood check: no diagnostics.

Gate (lanes one at a time, working tree with other agents' uncommitted edits): lint 0; fmt:check 0; type-check 0; build:frontend 0; test:modules 4192 pass, 1 fail: wide-boards.test.ts "Archboard server (track)" layout 5,919 ms over its 3,000 ms bound, under load average 9 to 12, also failing alone (4,870 ms); the renderer does not read code facts; test:system 195/0; test:repository 20/0; test:serial-browser exit 0. HEAD plus each of my patches alone: tsc 0, lint 0, fmt 0, code-facts and code-check owners pass except code-check.test.ts "what the pass cannot read is skipped" which already fails at HEAD after the Terraform commit (dns.tf is no longer text).
<!-- SECTION:NOTES:END -->
