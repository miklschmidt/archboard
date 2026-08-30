---
id: TASK-143.04.07
title: Verify controlled live voice in the workbench browser
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.03.13
  - TASK-143.04.06
  - TASK-143.04.10
  - TASK-143.02.04
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - tests/system/browser/codex-live-voice.test.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/browser/run-browser-lane.ts
  - tests/system/repository-policy/test-inventory.test.ts
  - package.json
  - AGENTS.md
  - docs/agents/test-suite.md
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own and register the canonical controlled browser owner for live voice through the public codex-realtime export. It is serialized after the text owner and is the sole second browser-inventory edit. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Controlled media and exact-version stdio fakes drive permission, WebRTC offer/answer/started, listening/mute/processing/speaking, transcript, Stop, close, and recovery through public exports.
- [ ] #2 The owner covers every media/identity/recovery failure plus spoken approval from one matching final user item after the effect prompt; assistant, provisional, stale-session, pre-prompt, duplicate, and ambiguous items cannot arm and fall back visually.
- [ ] #3 At desktop/fullscreen/Flip viewports it proves source identity, captured context/outcomes, transcript links, 44px controls, keyboard/screen-reader/reduced-motion, active fullscreen Stop, and no unexpected logs.
- [ ] #4 It appends exactly one owner to every canonical browser inventory/count surface after TASK-143.03.13 and updates 20 to 21 without rewriting text coverage or spawning PATH Codex.
<!-- AC:END -->
