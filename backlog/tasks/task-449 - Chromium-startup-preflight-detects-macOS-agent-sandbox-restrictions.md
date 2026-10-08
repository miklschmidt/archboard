---
id: TASK-449
title: Chromium startup preflight detects macOS agent sandbox restrictions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-08 11:44'
updated_date: '2026-10-08 11:45'
labels: []
dependencies: []
references:
  - src/runtime/headless-chromium/lib/launch.ts
  - skills/archboard/SKILL.md
type: bug
ordinal: 732000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents repeatedly start Chrome for Testing inside a macOS agent sandbox and receive only a SIGABRT error. The same Archboard launcher starts successfully outside the sandbox. The macOS crash report names application registration. Detect the restriction before launching Chromium so the agent receives an elevation instruction and the human receives no crash dialog.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Known macOS sandbox restrictions refuse Chromium before any browser process or temporary profile starts, with approved execution guidance.
- [ ] #2 Approved execution starts Chromium normally, and other startup failures retain diagnostics and cleanup.
- [ ] #3 Agent documentation describes the preflight and respects approval requirements. Regression coverage proves no executable runs for the preflight refusal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Detect the macOS Seatbelt sandbox through the native sandbox_check query before creating a profile or spawning Chromium. Use the common launcher so rasterization, recording, and replay share the guard.
2. Keep the existing unavailable error and cleanup contract. Tell agents to retry the same command through their approved elevation flow.
3. Add a macOS process regression using a real sandbox and an executable marker. Prove the guard runs before the executable or profile. Exercise approved Chromium startup and other startup failures.
4. Update installation and consumer guidance plus the runtime evidence owner in evals/coverage.json. Generate skill artifacts and run focused owners and bun run check.
No board is affected: the Headless Chromium part retains its responsibility, callers, ownership, and process relationships. This changes its internal launch admission and failure guidance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The same public launcher aborts with SIGABRT under the agent sandbox and succeeds outside it. The crash report places the abort in macOS application registration. Native sandbox_check returns 1 inside the sandbox and 0 outside it, independent of CODEX_SANDBOX.
<!-- SECTION:NOTES:END -->
