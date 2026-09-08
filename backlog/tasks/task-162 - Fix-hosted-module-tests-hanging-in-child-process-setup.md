---
id: TASK-162
title: Restore hosted CLI and board-rendering CI
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-08 00:40'
updated_date: '2026-09-08 01:15'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/34173668405'
  - 'https://github.com/miklschmidt/archboard/actions/runs/34175436997'
priority: high
type: bug
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The banner push exposed two hosted CI prerequisites: an aggregate CLI compatibility test exceeded its five-second budget, then server rendering failed because the runner's Chromium build cannot create its sandbox under Ubuntu AppArmor. Reliable CI must exercise the existing CLI and board-rendering contracts with independent test ownership and a supported sandboxed browser.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The failing hosted module cases complete successfully without weakening lint, type, test assertions or CI coverage.
- [x] #2 A repeatable focused reproduction demonstrates the cause and passes after the fix.
- [ ] #3 GitHub Actions succeeds for the pushed fix commit.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Keep each CLI compatibility mode in its own named test with the original assertions and timeout. Configure the hosted runner to resolve chromium to the preinstalled Chrome Stable binary covered by Ubuntu's AppArmor policy; retain test isolation and all existing CI coverage. Validate the affected rendered workflows locally and the setup syntax, push the focused CI configuration, and use the hosted run to verify the runner-specific sandbox behavior. Continue through any remaining failures until the latest push is green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The compatibility owner launched 22 real CLI processes inside one five-second test. In the official Bun 1.4.0 Linux image with a one-CPU quota, it failed at 5003 ms; a diagnostic run showed every process completing normally in 6418 ms. A half-CPU quota reproduced the same timeout. Each of the eleven independent output modes now owns a named test with the original assertions and default timeout.

Validation: the complete local bun run check passed, including 2660 module tests and the full serial browser inventory. The runner and both code-target owners passed three repetitions at a half-CPU quota (132 passes, zero failures). The original code-target setup failures did not recur in the debug hosted attempt or these constrained runs. Temporary instrumentation, container, and detached worktree were removed; diagnostic output stays outside the repository.

Hosted verification of the fix is pending.

Hosted run 34175436997 passed all 2660 module tests, confirming the CLI fix. The system lane then failed rendering and Mermaid-dependent owners with Chromium reporting No usable sandbox and naming Ubuntu AppArmor user-namespace restrictions. The renderer resolves chromium from PATH, and isolated test servers intentionally inherit PATH only. CI will expose the runner-installed /opt/google/chrome/chrome through that existing lookup; product code, isolation, sandbox flags, assertions, and coverage stay unchanged.

The three affected rendered-workflow owners pass locally: 11 tests, 218 assertions, 12.56 seconds. Workflow YAML parsing, renderer setup shell syntax, formatting, and whitespace validation pass. The next hosted run verifies the Chrome selection against Ubuntu AppArmor; no application or test code changed in this follow-up.
<!-- SECTION:NOTES:END -->
