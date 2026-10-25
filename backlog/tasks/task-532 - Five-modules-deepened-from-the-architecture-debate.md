---
id: TASK-532
title: Five modules deepened from the architecture debate
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T02:39:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0055-packages-own-behavior-and-apps-compose-it.md
  - docs/adr/0057-an-interface-is-the-few-operations-its-callers-need.md
priority: high
ordinal: 951000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two independent reviewers (Codex gpt-6-astra at xhigh and Claude Opus 5.5) each read the repository at 175c820c9, then cross-examined each other's candidates in a second round. The five below are the deepening opportunities both agreed on, plus the fifth chosen by the orchestrator. The briefs and both rounds are in /tmp/deep (round1 and round2 files). TASK-529 narrowed export lists; these tasks move behaviour behind deeper operations so callers stop assembling internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each subtask is merged into feat/reusable-codex-workbench with its focused tests passing
- [ ] #2 The interface width ceilings do not rise
<!-- AC:END -->
