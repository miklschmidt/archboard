---
id: TASK-291
title: >-
  Tell the coordinator when delegated work ends, so it decides what the voice
  says
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-20 12:41'
updated_date: '2026-09-20 13:15'
labels:
  - voice
  - codex
dependencies: []
references:
  - DESIGN.md
  - /home/msc/Projects/codex/codex-rs/core/src/realtime_conversation.rs
ordinal: 505000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Asked by voice to do something, the voice model waits on the coordinator and then nothing happens until the person asks again. Read against Codex rust-v0.155.1: while voice is live, a workhorse operation callback is delivered only to the voice session, as canonical JSON, through thread/realtime/appendText with role developer. In a V3 (Frameless Bidi) session that call is a quiet session.context.append whatever the role: no response is requested, and the voice model is handed a JSON blob it has no reason to read out. The coordinator, which knows whether it queued the work because of a voice request, is told nothing, and a completed callback carries no detail of what was done. The user decided: notify the coordinator, and let the coordinator decide whether the voice speaks. A related defect from the same reading: sessions start with codexResponseHandoffMode bemTags but the coordinator is never told to write the channel headers, so every headerless message, preamble included, is buffered until it completes and then routed as final and speakable (the recorded voice read out "I am checking the archboard workflow first"). In V3 the channel is the only lever: [FINAL] text is spoken, [COMMENTARY] text is quiet context, and there is no separate completion message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When delegated or queued workhorse work reaches a terminal outcome during a live voice session, the coordinator runs with that outcome and can read what was done
- [ ] #2 The coordinator decides whether the voice speaks: an answer it marks for speech is spoken without the person asking again, and one it marks as context is not
- [ ] #3 A coordinator preamble or progress message is never spoken as if it were the answer
- [ ] #4 A terminal outcome that arrives while the coordinator is mid-turn is neither lost nor spoken twice
- [ ] #5 Semantic board callbacks stay quiet context and start no turn
- [ ] #6 Covered by callback delivery and start-envelope contract tests, and verified with a real voice session
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Coordinator start instructions (realtimeStartInstructions, all voice sessions): every message begins with a channel header; [FINAL] is spoken by the voice model, [COMMENTARY] is quiet context; never [FINAL] for a preamble or progress line.
2. codex-coordinator-callbacks: a third delivery path coordinator_turn. While a voice generation is live, an operation callback of a terminal type (completed, failed, attention, outcome_unknown) is delivered by starting one ordinary coordinator turn through a host port, at most once, recorded like every other delivery. Semantic callbacks and non-terminal operation callbacks stay quiet context; with no voice session the injected developer message stays as it is.
3. Host port (server/canvas): wait, bounded, for the coordinator thread to be idle; then turn/start with a host-minted message id, the canonical operation context, and a prompt that states the outcome and asks the coordinator to decide: if the work came from a voice request, read what was done and answer [FINAL] in one short spoken paragraph; otherwise answer [COMMENTARY]. A coordinator still busy at the bound falls back to the injected developer message, so nothing is lost and nothing is said twice.
4. Tests: delivery path selection and at-most-once in the callbacks module; host port idle wait and fallback; start-envelope contract. Docs: DESIGN.md delivery paragraph. Real voice verification by the user.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (uncommitted), following the user direction to notify the coordinator and let it decide. 1. start-policy: COORDINATOR_CHANNEL_INSTRUCTIONS in realtimeStartInstructions for every voice session ([FINAL] is spoken, [COMMENTARY] is quiet, one [FINAL] last, a lone [COMMENTARY] when nothing should be said); the narration instructions ask for the step as one [FINAL] message. 2. Reviewed producer workhorse_outcome_report (turn/start, host-minted id) in the additional-context policy. 3. codex-coordinator-callbacks: delivery path coordinator_turn through an optional host port; terminal operation callbacks (completed, failed, attention, outcome_unknown) take it while a voice generation is live, busy falls back to thread/inject_items, an unknown start outcome is recorded as it is with no second path. 4. server/canvas codex-workbench-outcome-report: bounded idle wait (COORDINATOR_IDLE_WAIT_MS 10 s, polling CODEX_WAIT_TARGET_POLL_MS), canonical turn body, a prompt asking the coordinator to inspect the workhorse and answer [FINAL] only when the work came from a voice request. Verified: callbacks 27+5 tests, host port 3, modules lane 3418 pass, realtime process contract and production/application system tests, lint, fmt, both type-checks. Evidence that this, not the coordinator reply, was the silence: across 15 recorded coordinator threads every coordinator final message was followed by the voice speaking; what was never spoken is a workhorse callback, which while voice is live went only to the voice model as JSON through appendText.

Coordinator language rule, at the user direction (human review of the pinned instructions): coordinator-role-extension.txt gains a Language paragraph - a voice handoff carries the person own words in any language; the coordinator may answer in that language or English; everything it sends to the workhorse (delegate_to_workhorse, steer_workhorse, queued prompts) must be clear English, names never translated. COORDINATOR_ROLE_EXTENSION_SHA256 83be43bc..., COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256 5bca6e88...; the contracts document copy updated. Verified: instructions, coordinator, workhorse-start, thread-tools and the production workbench test (187 pass), lint, type-check.
<!-- SECTION:NOTES:END -->
