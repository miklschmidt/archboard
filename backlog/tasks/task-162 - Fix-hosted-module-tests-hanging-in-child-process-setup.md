---
id: TASK-162
title: Restore hosted CLI and board-rendering CI
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-08 00:40'
updated_date: '2026-09-08 01:41'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/34173668405'
  - 'https://github.com/miklschmidt/archboard/actions/runs/34175436997'
  - 'https://github.com/miklschmidt/archboard/actions/runs/34176058299'
priority: high
type: bug
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The banner push exposed an aggregate CLI compatibility timeout, Chromium sandbox startup failure on Ubuntu AppArmor, and Mermaid rendering running before required write-intent validation. Hosted CI must exercise the existing contracts reliably, and invalid writes must report the same actionable refusal even when rendering is unavailable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The failing hosted module cases complete successfully without weakening lint, type, test assertions or CI coverage.
- [x] #2 A repeatable focused reproduction demonstrates the cause and passes after the fix.
- [ ] #3 GitHub Actions succeeds for the pushed fix commit.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Give independent CLI compatibility modes separate tests with their original assertions and timeout. Resolve the hosted renderer to the installed Chrome Stable binary covered by Ubuntu AppArmor. Run Mermaid preparation only after shared write validation and before acquiring the board lease, preserving cancellation and tracked work phases. Verify focused regressions and all normal local lanes, then commit, push, and monitor hosted CI until the latest revision passes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The aggregate CLI owner launched 22 processes under one five-second deadline. A one-CPU Bun 1.4.0 Linux container reproduced failure at 5003 ms; diagnostic observation showed all processes finishing in 6418 ms. Eleven separately named modes preserve the original assertions and timeout. Three repetitions of the CLI and code-target owners passed under a half-CPU quota (132 passes).

Hosted run 34175436997 passed all 2660 module tests, then exposed Chromium's No usable sandbox failure. CI now exposes /opt/google/chrome/chrome as chromium through PATH, which isolated servers already inherit. Run 34176058299 verified this setup: all module and rendering/vault-only owners passed, leaving one undescribed Mermaid-write refusal.

The refusal reproduced locally in 921 ms with the existing doing-boundary owner configured to use an unavailable renderer. Preparation now follows request validation and still precedes the board lease; renderer and board-lock wait phases retain their existing health-report identities. The strengthened refusal and accepted rendering, lock, cancellation, and vault workflows passed (11 tests, 218 assertions).

Final local validation passed lint, formatting, both type checks, module, system, and repository lanes. The full check initially stopped at one fullscreen pane-rectangle assertion; that unchanged owner passed through the focused adapter, then the complete serial browser lane passed. No browser code or assertions changed. Diagnostic instrumentation, container, and worktree were removed; logs remain outside the repository. Hosted verification of the final product fix is pending.
<!-- SECTION:NOTES:END -->
