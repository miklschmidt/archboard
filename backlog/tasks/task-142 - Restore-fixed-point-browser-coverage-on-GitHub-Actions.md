---
id: TASK-142
title: Restore serial browser coverage on GitHub Actions
status: To Do
assignee: []
created_date: '2026-08-30 05:15'
updated_date: '2026-08-30 05:48'
labels: []
dependencies:
  - TASK-138
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/33294001881'
  - 'https://github.com/miklschmidt/archboard/actions/runs/33294902038'
  - 'https://github.com/miklschmidt/archboard/actions/runs/33291111341'
priority: high
type: bug
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three TASK-138 hosted runs that reached the browser lane failed at its boundary on three different first retained owners—human-edit-performance, fixed-point-document, then malformed-geometry-recovery—while all non-browser gates passed and each owner remained green locally. Diagnose the systemic GitHub-runner browser startup/lifecycle slowdown, restore deterministic hosted execution of the complete serial browser lane, and remove the exact CI-only all-browser exclusion without weakening any owner or the complete local gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Retain exact evidence from runs 33291111341, 33294001881, and 33294902038 and identify why three different first retained browser owners hit hosted timeout boundaries.
- [ ] #2 Remove the exact all-browser GitHub-only exclusion, its repository-policy contract, and its canonical documentation once repaired.
- [ ] #3 Restore only the setup prerequisites actually required by the complete hosted serial browser lane, including the explicit downloaded executable handoff and strace when human performance is selected.
- [ ] #4 All 15 serial browser owners complete in canonical order on GitHub Actions with every existing assertion and deterministic per-owner cleanup.
- [ ] #5 The complete hosted CI run is green within the retained 30-minute workflow budget, and local bun run check remains green with all 15 owners.
<!-- AC:END -->
