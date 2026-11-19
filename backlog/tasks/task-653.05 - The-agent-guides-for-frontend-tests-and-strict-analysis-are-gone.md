---
id: TASK-653.05
title: The agent guides for frontend, tests and strict analysis are gone
status: To Do
assignee: []
created_date: '2026-11-19T16:46:00Z'
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
- [ ] #1 The five files are deleted, and no tracked file outside backlog/ names them
- [ ] #2 Every lint message, test message and config comment that cited them states its rule or its reason itself
- [ ] #3 AGENTS.md and TESTING.md no longer point at the deleted guides, and keep only what their readers need to run and verify the product
- [ ] #4 No lint, type, clippy or test rule is weakened, and bun run check passes
<!-- AC:END -->
