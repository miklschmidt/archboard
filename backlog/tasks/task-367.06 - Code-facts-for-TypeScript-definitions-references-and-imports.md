---
id: TASK-367.06
title: 'Code facts for TypeScript: definitions, references and imports'
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
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
