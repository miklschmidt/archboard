---
id: TASK-591
title: archboard check runs as a gate beside lint, type checks and tests
status: To Do
assignee: []
created_date: '2026-11-07T12:42:00Z'
labels: []
dependencies: []
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: high
type: feature
ordinal: 1037000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Market research on X (2026-11-06) found that experienced engineers who run coding agents trust hard checks such as import-linter, tsc and tests, and that rules in AGENTS.md get ignored. The `archboard check` family is already deterministic, but nothing packages it as a gate in CI, in Git hooks or in an agent loop. This is the first adoption bet of the research (P0). Package and document the existing CLI. Do not add an analysis engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exit codes of `archboard check`, `archboard check code` and `archboard check embeds` are documented, and tests hold which outcome passes, warns and fails
- [ ] #2 A GitHub Action runs the same CLI on a pull request and fails or warns on the documented findings, as its configuration says
- [ ] #3 A pre-commit or pre-push hook runs the same `bin/archboard` executable
- [ ] #4 README or INSTALL shows the check as a gate, as for tsc and ruff, and shows an agent loop that gives the check output back to the agent before human review
- [ ] #5 A public demo clip shows a check that fails and then passes
<!-- AC:END -->
