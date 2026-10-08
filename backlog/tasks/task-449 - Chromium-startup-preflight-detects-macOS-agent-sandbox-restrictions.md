---
id: TASK-449
title: Chromium startup preflight detects macOS agent sandbox restrictions
status: Done
assignee:
  - '@codex'
created_date: '2026-10-08 11:44'
updated_date: '2026-10-08 11:52'
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
- [x] #1 Known macOS sandbox restrictions refuse Chromium before any browser process or temporary profile starts, with approved execution guidance.
- [x] #2 Approved execution starts Chromium normally, and other startup failures retain diagnostics and cleanup.
- [x] #3 Agent documentation describes the preflight and respects approval requirements. Regression coverage proves no executable runs for the preflight refusal.
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

Implementation uses native sandbox_check(process.pid, null, 0) through libsandbox, with the same query Chromium uses. It does not depend on CODEX_SANDBOX. The preflight preserves unavailable and cleanup contracts and runs before mkdtemp or spawn. Linux behavior is unchanged.
The real sandbox regression failed before implementation because Chromium startup attempted the executable and recorded a pid. It passes with pid null and no executable marker. The approved real Chromium contracts pass, and the exact dogfood rasterization succeeds outside the sandbox with a 4343 by 3837 PNG. The sandboxed command exits 4 with an elevation instruction and no Chromium process.
Consumer evaluation and installation owners: 242 passed. The focused startup owner: 2 passed. Test lint, complete policy lint, formatting, and both TypeScript projects passed.
Architecture inspection reads the registered checkout. Board rasterizer parts Chromium launch, Chromium executable, and Headless browser remain accurate: the commits change internal launch admission, not the drawn responsibilities or relationships. The existing drawRequest anchor warning concerns an unchanged CLI file. Existing unused-export information also predates this task. No proposal or adoption is needed.
README inspection reports 14 existing stale assets. No asset declares this task changed headless-chromium, installation guide, or skill inputs as its source. This task does not change any depicted output. No asset refresh is needed.
The first checkpoint is unsigned because the configured SSH signing key has no private key available. Repository signing configuration remains unchanged.

Final validation: the full gate passed lint, formatting, both TypeScript projects, and the frontend build. Its module lane reports 4418 passed and 13 failed outside changed scope: filename casing, a bound code reference, and fixtures with no vault. The same two casing failures reproduce with module isolation in the focused unchanged owners. The remaining lanes were run explicitly. Repository policy passed 24 tests. The system lane completed with an unchanged Codex shutdown contract failure. The browser lane reached its first owner after using the actual installed agent-browser executable, then stopped on an unchanged shell-layout assertion. No rules or assertions were weakened.
Installed the refreshed consumer skill with install-skill --target agents --no-doc --yes. Existing repository setup documents were not rewritten.
Committed source in 8574a419 and regression refinements in bde4e07d. The startup guard changes no public code, cleanup, artifact, or rendering shape.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Detect the native macOS sandbox before Chromium starts. Agents receive an approved elevation instruction, and the human receives no Chromium crash dialog from this launch. The real sandbox regression and approved Chromium startup pass. The exact rasterization command refuses inside the sandbox and produces a PNG outside it. Consumer skill and installation tests pass, and the installed agent skill is refreshed. The full gate reports unrelated existing failures in unchanged tests.
<!-- SECTION:FINAL_SUMMARY:END -->
