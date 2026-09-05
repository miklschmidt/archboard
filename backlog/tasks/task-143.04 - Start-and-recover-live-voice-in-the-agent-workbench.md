---
id: TASK-143.04
title: Build the live voice UI and end-to-end recovery
status: Done
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-09-05 03:45'
labels: []
dependencies:
  - TASK-143.08.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for voice projection, controls, captured context, canonical transcript, spoken-approval presentation, frame/fullscreen composition, one controlled browser owner with serialized registration, and final real-audio acceptance delivered by nine active leaves; archived TASK-143.04.08 is superseded by self-registering text/voice owners.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One live voice session attaches to the linked coordinator and stays bound to its immutable source pane/workhorse across focus changes until explicit Stop, matching closed state, and complete cleanup.
- [ ] #2 Permission, negotiation, listening, mute, processing, speech, captured context, later delivery outcomes, canonical transcript, spoken approval, every recoverable/terminal failure, recovery, serialized restart, and fullscreen Stop are visible and accessibly testable.
- [ ] #3 The controlled voice owner exercises the public browser module and owns the second/last inventory edit; the separate clean-process microphone/speaker smoke proves the real 0.151.0 path.
- [ ] #4 Voice-specific eligibility/race disclosure and visual fallback remain separate from ordinary approval cards; no WebSocket audio content path or second transcript/state owner exists.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed at the user’s explicit request after integration of the smoke worktree and completion of the implementation leaves. Validation at 75a1cd22: 2565 module tests, 13 production/system tests, shell/text/controlled-voice browser owners, lint, format, TypeScript and 124 repository checks passed. Current runbook verification additionally passed 147 focused module tests and both workbench browser owners. Real text delivery and SDP negotiation were observed. Full real-audio acceptance remains unverified because the configured default microphone was absent; no unchecked aggregate criterion is relabelled as a proven pass. TASK-150 separately owns strict-lint restoration and the fresh UI rebuild.
<!-- SECTION:FINAL_SUMMARY:END -->
