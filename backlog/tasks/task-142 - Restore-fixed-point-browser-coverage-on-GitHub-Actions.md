---
id: TASK-142
title: Restore serial browser coverage on GitHub Actions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 05:15'
updated_date: '2026-10-11 14:28'
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
- [ ] #1 Retain evidence from runs 33291111341, 33294001881, and 33294902038 and explain the relevance of their failed ownership paths to the current harness.
- [ ] #2 Remove the all-browser hosted exclusion and its code and documentation so the complete normal inventory runs.
- [ ] #3 The hosted lane uses the pinned repository CLI and an explicit supported browser executable.
- [ ] #4 Every owner selected by BROWSER_TEST_PATHS completes in canonical order on GitHub Actions with every existing assertion and cleanup audit.
- [ ] #5 The complete hosted and local bun run check gates pass within the existing hosted workflow budget.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Retain historical hosted failure evidence, restore the current complete inventory and prerequisites, exercise Linux and local gates, and run scoped standards/specification review. No board is affected: this restores CI selection and test tooling.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The user authorized all retrospective proposals. Historical browser failures occurred in the former Excalidraw harness. Preserve those records, but use the current executable inventory as the acceptance source rather than obsolete file names or a copied count.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-30 06:16
---
TASK-139 adds fullscreen-presentation as the sixteenth canonical local browser owner. The existing all-browser exclusion remains fail-closed, and TASK-142 continues to own restoring the complete lane, now all 16 owners, to GitHub Actions.
---
<!-- COMMENTS:END -->
