---
id: TASK-144.06
title: Enable native Oxfmt Tailwind class sorting
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 00:26'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - .oxfmtrc.jsonc
parent_task_id: TASK-144
priority: high
type: task
ordinal: 220000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enable Oxfmt's native Tailwind v4 sorting using the canonical stylesheet and helper function. Keep className native; add no custom sorting rules or copied defaults.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Oxfmt configuration names the canonical stylesheet and functions [cn]; className uses native formatter behavior and is not redundantly configured.
- [ ] #2 Sorting follows installed Oxfmt/Tailwind v4 semantics for static strings and cn calls without formatting dynamic expressions, templates, or data as invented classes.
- [ ] #3 No Prettier plugin, custom comparator, Tailwind-specific Oxlint rule, warning allowance, or upstream default mirror is added.
- [ ] #4 TASK-144.10 owns the fail-format-pass repository fixture; this task owns configuration only.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the installed Oxfmt version, current .oxfmtrc.jsonc, canonical Tailwind stylesheet, and cn entrypoint to confirm the supported native Tailwind v4 configuration keys.

2. Change only .oxfmtrc.jsonc to enable native Tailwind sorting with the canonical stylesheet and functions [cn], leaving className to native behavior and adding no custom rules or fallback tooling.

3. Verify Oxfmt accepts the configuration and preserves dynamic expressions while sorting representative static class strings and cn calls; run format, repository, module, type, lint, and frontend gates without adding the TASK-144.10 enforcement fixture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.05 finalized at integration HEAD ef4ce5c. Configuration-only leaf: .oxfmtrc.jsonc and task record are owned; TASK-144.10 owns the fail-format-pass repository fixture.
<!-- SECTION:NOTES:END -->
