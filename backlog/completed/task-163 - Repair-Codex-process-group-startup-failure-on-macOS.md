---
id: TASK-163
title: Repair Codex process-group startup failure on macOS
status: Done
assignee:
  - '@codex'
created_date: '2026-09-08 08:43'
updated_date: '2026-09-08 11:45'
labels: []
dependencies: []
type: bug
ordinal: 315000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard start on macOS refuses readiness because process-group capture supports Linux only. The installed 0.151.0 binary runs, but the public error incorrectly recommends reinstalling it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Support macOS process-group ownership while preserving verified cleanup and PID-reuse protection.
- [x] #2 Startup diagnostics distinguish ownership failures from installation failures.
- [x] #3 Verify runtime regression coverage and real startup, and run the repository gate.
- [x] #4 Audit and repair other Linux-only assumptions that prevent supported macOS workflows.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a Darwin process-table backend preserving identity and cleanup guarantees. 2. Correct ownership failure diagnostics and add behavioral coverage. 3. Verify native startup and run bun run check.

4. Audit production and verification tooling for Linux-only assumptions, repair confirmed macOS failures, and validate the affected behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User expanded scope to audit and address other Linux-only gotchas for macOS support.

Native macOS Codex startup and clean stop verified after shared libproc ownership repair; user server is running at port 3100. Audit confirmed engine Git /proc-only capture, renderer setsid/procfs, and normal test-harness procfs assumptions. Repairs share a native observer. Sandboxed Chrome test launches caused macOS application-registration aborts; browser validation paused and test children confirmed gone.

Verified all 2,666 normal module tests on macOS; native renderer now passes through isolated profile with Chrome-only native account HOME. Canonicalized macOS fixture paths without relaxing storage checks; repaired APFS board spelling and save behavior. Added macOS CI coverage for process ownership, cleanup, storage layout and board casing. Final review and complete gate are in progress.

Temporary macOS Chrome launches now use Chromium mock-keychain flags in both renderer and browser test harness; no user keychain settings changed. Native renderer smoke passes with clean teardown of all 10 observed processes. Native macOS CI selection passes 68 tests. Final gate found four additional portable-fixture issues; fixes and rerun are underway.

Final native startup verified again: canvas restarted successfully on port 3100, pid 83838, and status healthy. All 2669 module tests and 8 repository tests pass; native CI selection 68/68; remaining targeted repository interruption, scratch forced restart, exact reap and cleanup regressions pass. Browser lane passed early workflow owners but stopped after navigator system-dark assumption failure (now corrected). User then reported default-browser system dialogs, so all browser runs are paused. Both launchers already had standard suppression flags; added Chromium/ChromeDriver disposable-profile check_default_browser=false as an isolated defense, but popup elimination is not runtime-proven. No user default-browser/keychain settings changed. Full bun run check is not yet green; browser completion remains outstanding.

Final lint, formatting, root/frontend TypeScript and diff checks pass. Focused APFS refusal test passes after helper extraction; extracted CLI transport now uses native spawnSync timeout instead of GNU timeout, and a read-only status probe passes. Final process ownership review is clean. Runtime popup suppression and the remaining browser lane are deliberately unverified because browser launches are paused after user-reported system dialogs. Task remains In Progress for that validation rather than being marked complete.

User retained macos-processes CI and authorized completing validation/commit. Confirmed recurring default-browser dialogs originate from managed DefaultBrowserSettingEnabled=true in machine and user com.google.Chrome policy. Chromium applies that policy through a separate OS registration path, unaffected by ordinary profile flags. Validation now uses the already installed Chrome for Testing, which explicitly rejects default-browser registration; managed policy remains unchanged. All 306 system tests passed in the resumed gate. Serial browser validation is progressing with CfT; navigator now passes.

Chrome for Testing eliminated the user-observed popups (user confirmed). Browser audit repaired native modifier handling, explicit theme baselines, and fullscreen reconciliation baseline; all related focused owners pass. Measured undo creation and modification each pass all 30 assertions in isolation at about 30.7s, including four macOS Chromium input ACKs near 5.04s each; declared a reviewed Darwin-only 60s external-browser case bound, Linux unchanged. Final gate exposed cross-session browser state reuse and an intermittent editor-reconciliation race; fixing test isolation before final commit.

Correction to earlier popup observation: the user subsequently reported recurring default-browser prompts. Core owned-canvas fixture environments dropped ARCHBOARD_RENDERER_CHROMIUM and could fall back to managed regular Chrome. Preserve the explicit renderer executable through fixture isolation; final validation also uses a private PATH chromium symlink to Chrome for Testing for discovery-only fixtures. Stopped prior run and verified no test browsers remained before resuming the serial full gate. Popup resolution is pending runtime confirmation.

Final full bun run check passed with exit 0 on native macOS: lint, formatting, root/frontend TypeScript, frontend build, 2669 module tests, 306 system tests, 8 repository tests, and every serial browser owner. Both human undo/redo cases passed together (60 assertions); version-refusal cases passed (60 assertions). Native process sampling observed only Chrome for Testing for newly launched test browsers; the existing normal Chrome process remained unchanged. Final independent review found no remaining managed-Chrome fallback with both explicit executable overrides. macos-processes CI retained. Prior native startup/stop/restart and renderer smoke validation also passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added native macOS process ownership and identity-safe cleanup for Codex, Git, and rendering; corrected ownership failure diagnostics. Repaired macOS filesystem, environment, browser, and test-harness portability, documented Chrome for Testing for managed installations, and retained native macOS CI coverage. Verified real startup and rendering, reviewed ownership safeguards, and passed the complete bun run check gate on macOS.
<!-- SECTION:FINAL_SUMMARY:END -->
