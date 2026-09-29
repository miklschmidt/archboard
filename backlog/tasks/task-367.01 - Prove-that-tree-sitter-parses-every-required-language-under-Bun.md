---
id: TASK-367.01
title: Prove that tree-sitter parses every required language under Bun
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
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
- [ ] #1 A throwaway script, outside `src/`, loads `web-tree-sitter` under Bun and parses a real file in each of the ten grammars
- [ ] #2 The design note records, per grammar: the package or repository, the version, the licence, whether a WebAssembly file is published, and the parse time of a large real file
- [ ] #3 Each grammar without a published WebAssembly file is named with the cost to build one, and an alternative if one exists
- [ ] #4 Nothing is added to `package.json` or `src/` by this task
<!-- AC:END -->
