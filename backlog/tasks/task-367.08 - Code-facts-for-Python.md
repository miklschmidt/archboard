---
id: TASK-367.08
title: Code facts for Python
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:15'
updated_date: '2026-10-06 13:42'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 616000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The second adapter makes the seam between the check and the languages real, and the skill evaluations run on Flask checkouts, which are Python.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Imports resolve for absolute, relative and package imports, including `__init__.py`
- [ ] #2 Definitions carry their visibility: listed in `__all__`, or not starting with `_`
- [ ] #3 The anchor, binding, undrawn and backwards checks work for parts bound to Python files
- [ ] #4 A small fixture package owns the behaviour in tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.08 changes the Code facts part's description (the adapter table, the Python adapter and how it resolves imports). No new part or relationship: the adapters live inside src/runtime/code-facts, which the board draws as one module. No other board draws code facts.
1. New files first (no shared edits): python.scm (query against tree-sitter-python 0.25.0), python-adapter.ts / python-definitions.ts / python-imports.ts (definitions with Python's visibility: __all__ when the module lists it, else not starting with _; references with call or import evidence and type-only, annotations and if TYPE_CHECKING: are types; environment names through os.environ / os.getenv; imports one per name), python-resolution.ts (absolute, relative and package imports; __init__.py; a name that is a submodule resolves to the submodule; roots: the importing file's own root, the nearest directory without __init__.py, then the source roots of the nearest pyproject.toml or setup.cfg, then src and the project directory). Tests: python-facts.test.ts over a small on-disk fixture package under src/runtime/code-facts/tests/fixtures/.
2. Adapter table: adapters.ts holds one entry per adapter (name, extensions with their grammar file, query, facts function, import resolver). grammars.ts loads a grammar file and its query once, on first use. reader.ts looks the extension up in the table; resolution goes through the entry's resolver, which resolves an Import (so Python can say a name is a submodule), and the reader computes each reference's target from the resolved import. SyntaxFacts.adapter names the adapter. definition-site and code-check/support.ts test for the text reading instead of naming TypeScript. Wait for the TASK-367.07 reviewer's uncommitted hunks before editing shared files.
3. code-check: python-check.test.ts proves the anchor, binding, undrawn and backwards checks on parts bound to a Python package.
4. Try the check on the evaluation's Flask 3.0.0 checkout through a temporary vault with bound parts; record what it finds, and measure parse time if it matters (design-checks.md). authoring.md names the languages the check reads.
5. Close the proposal per archboard-dev (check --code with and without --variant, footprint, adopt).
<!-- SECTION:PLAN:END -->
