---
id: TASK-520.09
title: The Rust crates are linted as strictly as the TypeScript
status: To Do
assignee: []
created_date: '2026-10-25T04:29:00Z'
labels: []
dependencies: []
parent_task_id: TASK-520
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TypeScript source is held to a strict analysis policy (TASK-150, .oxlintrc.jsonc): every warning fails, cyclomatic complexity is capped at 6, files at 600 lines, and documentation, import boundaries and module layout are enforced. The Rust crates under crates/ get only clippy's default set with --deny warnings (lint:core). Choose a Rust lint set of the same strictness from current Rust practice (rustc lint groups, clippy groups and selected restriction lints), not a 1:1 port: reject TypeScript rules that do not make sense in Rust, and say why. Configure it once for the workspace, make every crate pass it, and keep every corpus picture byte-identical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One workspace lint table in Cargo.toml holds the policy, every crate inherits it, and lint:core denies every warning it raises
- [ ] #2 Each chosen lint, and each TypeScript rule rejected for Rust, is recorded with its reason in the repository's lint policy documentation
- [ ] #3 Every crate passes the policy without a crate-wide allow; each local allow names its reason
- [ ] #4 Every corpus picture is the same bytes as before the change, and bun run check passes
<!-- AC:END -->
