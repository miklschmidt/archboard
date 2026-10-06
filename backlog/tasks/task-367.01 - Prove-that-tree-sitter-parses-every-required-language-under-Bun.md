---
id: TASK-367.01
title: Prove that tree-sitter parses every required language under Bun
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 09:40'
labels:
  - code-check
dependencies: []
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: spike
ordinal: 609000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check reads many languages in one way: tree-sitter finds definitions, references and imports, and a language server resolves the candidates (docs/design/design-checks.md). That choice rests on one fact nobody has shown yet. Archboard has no build step (ADR 0014), so each grammar must load under Bun from a published WebAssembly file. The grammars needed are TypeScript, TSX, Python, C#, Swift, Objective-C, C, C++, HCL (Terraform and OpenTofu) and Nix. If one of them has no usable WebAssembly file, the decision task must know the cost before it records the engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A throwaway script, outside `src/`, loads `web-tree-sitter` under Bun and parses a real file in each of the ten grammars
- [x] #2 The design note records, per grammar: the package or repository, the version, the licence, whether a WebAssembly file is published, and the parse time of a large real file
- [x] #3 Each grammar without a published WebAssembly file is named with the cost to build one, and an alternative if one exists
- [x] #4 Nothing is added to `package.json` or `src/` by this task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In a scratch project outside the repository (scratchpad/tree-sitter-spike), bun add web-tree-sitter and candidate WebAssembly grammar packages. Nothing goes into the repository package.json, bun.lock or src/.
2. For each of the ten grammars (TypeScript, TSX, Python, C#, Swift, Objective-C, C, C++, HCL, Nix), find a published .wasm, read its ABI, load it with web-tree-sitter under Bun and parse a large real file: this repo's own TS/TSX files, and files downloaded from well-known open-source repositories for the rest.
3. For each grammar without a usable published .wasm, measure the cost to build one (tree-sitter build --wasm via nix shell) and name an alternative.
4. Record the table, the web-tree-sitter version and licence, build costs and one recommended package set in docs/design/design-checks.md under The engine.
No dogfood board is affected: this is a measurement and a design-note change, and no code, module or relationship changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-10-06, Bun 1.4.2, web-tree-sitter 0.27.0 (ABI 13..15). All ten grammars load from a .wasm in node_modules and parse a large real file. Results, sources rejected and the recommended package set are in docs/design/design-checks.md under The engine.

Reproduction (scratch project outside the repository, nothing added to package.json, bun.lock or src/):
  dir: /tmp/claude-1001/-home-msc-Projects-archboard/df69198c-c8ca-4e7b-bcfe-9ac6645e7162/scratchpad/tree-sitter-spike/
  ./setup.sh      # bun add --ignore-scripts --exact the candidate packages, download the Swift 0.7.3 release .wasm, build Nix v0.3.0 with 'nix shell nixpkgs#tree-sitter -c tree-sitter build --wasm', fetch the real files at pinned commits
  bun spike.ts    # per grammar: ABI, .wasm size, load time, lines, median parse time, error lines (bun spike.ts all adds the rejected collections)
  bun compare.ts  # same tree from two builds of one grammar (upstream vs @lumis-sh)
Note: the Nix build writes wasi-sdk (390 MB) into ~/.cache/tree-sitter.

Decisions: Swift and Nix have no upstream .wasm on npm, so the recommendation takes @lumis-sh/wasm-swift and @lumis-sh/wasm-nix, both built from the exact upstream tags and tree-identical to the release file and to a local build. The whole @lumis-sh set was not recommended because @lumis-sh/wasm-python is two commits past v0.25.0 (expression_statement became a supertype), so a query that works with the release does not compile against it.
Findings for later tasks: one unknown attribute macro (AF_API_AVAILABLE) puts 92% of AFURLSessionManager.m in ERROR nodes (TASK-367.10). Objective-C++ (.mm) has no grammar. tree-sitter-typescript 0.23.2 fails on one regex with raw control characters in src/transformers/semantic-renderer/lib/svg/primitives.ts.
Gate: bun run fmt:check pass; bun run test:repository 20 pass 0 fail. Other lanes not run: the change is one markdown file.
No dogfood board is affected: this is a measurement and a design-note change.

Parent verified on 2026-10-06: bun spike.ts in the scratch spike exits 0 and prints all ten grammars. The user approved the recommended package set on 2026-10-06 for TASK-367.02.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measured web-tree-sitter 0.27.0 under Bun with ten WebAssembly grammars and recorded the per-grammar table, the Swift and Nix build cost and the recommended package set in docs/design/design-checks.md (commit f20c0caae). Verified by running the scratch script, which exits 0 and parses a large real file per grammar. Nothing was added to package.json or src/.
<!-- SECTION:FINAL_SUMMARY:END -->
