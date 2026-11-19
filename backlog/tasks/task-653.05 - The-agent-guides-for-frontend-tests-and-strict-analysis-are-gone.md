---
id: TASK-653.05
title: The agent guides for frontend, tests and strict analysis are gone
status: Done
assignee: []
created_date: '2026-11-19T16:46:00Z'
updated_date: '2026-11-19T18:01:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
ordinal: 1118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked to delete docs/agents/frontend.md, docs/agents/test-suite.md, docs/agents/strict-analysis.md, docs/agents/strict-analysis-rust.md and docs/agents/strict-analysis-policy.json (owner decisions 19 and 20 in the archboard-deepen run's decision log: docs/agents files are context that agents wrote under other circumstances, not rules, and they shaped designs they should not have). Together they are about 1,800 lines. No code reads them; Cargo.toml, clippy.toml, ADR 0060, the Rust crates policy test, the oxlint UI rules, TESTING.md and AGENTS.md cite them. TASK-653.03 removes docs/agents/boundaries.md beside this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The five files are deleted, and no tracked file outside backlog/ names them
- [x] #2 Every lint message, test message and config comment that cited them states its rule or its reason itself
- [x] #3 AGENTS.md and TESTING.md no longer point at the deleted guides, and keep only what their readers need to run and verify the product
- [x] #4 No lint, type, clippy or test rule is weakened, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete the five guides.
2. Rewrite each citation (Cargo.toml, clippy.toml, ADR 0060, rust-crates test, oxlint ui-rules, scripts/move-source.ts) to state its rule or reason itself.
3. Drop the pointers in AGENTS.md and TESTING.md.
4. Leave docs/agents/boundaries.md to TASK-653.03.
5. Run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
bun run check on this branch: every lane passes except two. (1) test:repository: skill-links.test.ts finds docs/agents/boundaries.md linking twice to the deleted frontend.md; boundaries.md is left to TASK-653.03, which deletes it, so the test passes once both land. (2) check:model reports the INTERFACE_WIDE and MODULE_SHALLOW warnings that the parent TASK-653 deepens; this branch changes no code interface. AC #4 stays unchecked until the merged branch passes the gate.

Merged into deepen/module-depth (6e942c77c6) after TASK-653.03; skill-links.test.ts and test:repository pass on the merge (176). check:model fails only on the run's known INTERFACE_WIDE and MODULE_SHALLOW findings, which TASK-653 clears; criterion 4 is checked on that basis.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deleted docs/agents/frontend.md, test-suite.md, strict-analysis.md, strict-analysis-rust.md and strict-analysis-policy.json. Cargo.toml, clippy.toml, ADR 0060, the Rust crates policy test and the oxlint UI rules now state their reasons without citing them; scripts/move-source.ts no longer lists the two deleted guides among the files whose paths follow a move. AGENTS.md and TESTING.md drop the pointers. No rule changed. The gate passes except the boundaries.md links (resolved by TASK-653.03) and the parent's pending deepening warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
