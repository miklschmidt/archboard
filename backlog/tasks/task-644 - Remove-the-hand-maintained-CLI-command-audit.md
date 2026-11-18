---
id: TASK-644
title: Remove the hand-maintained CLI command audit
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T20:00:00Z'
updated_date: '2026-11-18T20:13:00Z'
labels: []
dependencies: []
ordinal: 1085000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/cli-command-audit.json holds one hand-written prose entry per CLI command and drifts from the code. Its `check code` entry lists exposure readers for six languages, but module-exposure.ts covers twelve. Its paths still name retired commands such as `bridge` and `arrange`. One renderer turns it into the ignored cli-command-audit.md, and older tasks tell implementers to add entries. The command contracts already state what a reader can derive, and command-contract-proof.md renders them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/design/cli-command-audit.json and the rendered cli-command-audit.md no longer exist, and `bun run generate:cli-contract` writes only the two proof views
- [x] #2 No doc, skill, agent guide, ignore rule or open Backlog document tells an agent to read or update the audit
- [x] #3 `bun run check` passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find every reader of docs/design/cli-command-audit.json and of the rendered cli-command-audit.md.
2. Delete the JSON, its schema and its Markdown rendering in apps/cli/src/cli/commands/contract-artifacts/operations/render.ts. Keep the two proof views, which derive from the command registry.
3. Remove the audit from the system test, the artifact fixture, .gitignore, docs/agents/test-suite.md and doc-003.
4. Rename the two vault relationship labels that called the generated view an audit.
5. Run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Readers found: render.ts (the only code reader), tests/system/cli/command-contract-artifacts.test.ts, tests/system/cli/support/artifact-fixture.ts, .gitignore, docs/agents/test-suite.md, doc-003, and plans or notes of 21 Done tasks plus TASK-616 and TASK-642 (In Progress). No skill, CI workflow, site page or script reads it. The generated Markdown had no reader. Completed task records stay as history. The audit named retired commands (bridge, arrange, library, share) and its `check code` entry listed 6 of the 12 exposure readers. Every column a reader can derive (path, classification, parser, prerequisites, effects, relationships, result schema) is already in command-contract-proof.md, so nothing is re-derived.

Evidence: `bun run generate:cli-contract` wrote only command-contract-proof.json and command-contract-proof.md. `git grep cli-command-audit` matches only Backlog task records. `bun run check` passed 26 of 26 tasks. Sol review (gpt-6.2-sol, one round) found two open task records that still named the file (TASK-616 plan and criterion 6, TASK-642 notes) and fixed them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deleted docs/design/cli-command-audit.json, its schema and Markdown rendering in render.ts, its system-test assertion and its ignore rule. The audit was hand-written, named retired commands, and listed 6 of the 12 exposure readers. The proof views, derived from the command registry, already carry every fact the code states, so nothing replaces it. Updated test-suite.md, doc-003, TASK-616 and TASK-642, and two vault relationship labels. Completed task records keep their history.
<!-- SECTION:FINAL_SUMMARY:END -->
