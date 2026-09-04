---
id: TASK-143.04.09
title: Run the clean-process real voice acceptance smoke
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-09-04 17:52'
labels: []
dependencies:
  - TASK-143.01.15
  - TASK-143.02.05
  - TASK-143.04.07
references:
  - TESTING.md
modified_files:
  - TESTING.md
  - docs/design/codex-workbench-voice-acceptance.md
  - src/ui/workbench-composer/tests/model.ts
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 230000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the reproducible clean-process human acceptance procedure for exact Codex 0.151.0 text plus real audio. Deterministic module/process/browser owners must pass first. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The procedure starts clean Archboard/dedicated signed-in roots, proves config.toml/effective SQLite and exact version, creates/links a workhorse, submits text, observes authoritative timeline, interrupts a turn, and recovers after reconnect without duplicate input.
- [ ] #2 The voice path proves real audio, quick capable coordinator response, one bounded board write, queue or permitted steer, semantic callback, one final-user-derived eligible spoken approval with visual fallback, Stop, restart, and shutdown.
- [ ] #3 It distinguishes automated gates from manual observations, records no credentials/media, captures actionable failure evidence, and requires every deterministic owner before the smoke.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Author docs/design/codex-workbench-voice-acceptance.md as the canonical clean-process runbook, with exact 0.151.0/root proofs, focused deterministic gates, rendered text/reconnect steps, real-audio voice steps, redacted evidence, and cleanup.\n2. Run the cheapest focused process, storage, reconnect, semantic callback, spoken-approval, text-browser, and controlled-voice owners under bounded command lifetimes; record commands and measured runtimes without broad suites.\n3. Prepare a clean disposable vault and one owned Archboard/browser lifecycle, prove the real executable and dedicated storage state without exposing secrets, then advance to the first genuinely human microphone, speaker, sign-in, or observation action.\n4. Record automated evidence, pending or completed human observations, modified files, cleanup, and remaining risk in Backlog; commit the scoped documentation and task metadata, leaving a clean worktree for review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Drafted the canonical clean-process runbook and linked it from TESTING.md. Pre-human gates passed: exact Codex 0.151.0 (0.05s); private process/storage/session owners (27 tests, 0.75s); reconnect/sequenced-delivery/composer owners (31 tests, 4.93s); semantic delivery/coordinator callback/spoken-approval owners (86 tests, 0.99s); controlled text browser owner (3.54s including one frontend build); controlled live-voice browser owner (3.53s); root TypeScript check (2.04s). The first composer run exposed a stale fixture missing the required idle spokenApproval field. Added the canonical BROWSER_IDLE_SPOKEN_APPROVAL value; its focused owner now passes. No broad or opt-in suite ran.

Live clean-process preparation reached the human boundary: disposable vault and board created, one server and one visible browser connected, dedicated storage proof passed (0700/0700/0600 and exact SQLite selection), and the rendered account state is Signed out. Hosted ChatGPT sign-in, real microphone/speaker observation, and the downstream text/reconnect/board/queue/callback/spoken-approval sequence remain HUMAN_ACTION_REQUIRED. The live surface is intentionally preserved; no credentials, media, account identifiers, process ids, private paths, or raw protocol logs were retained.
<!-- SECTION:NOTES:END -->
