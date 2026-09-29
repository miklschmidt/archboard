---
id: TASK-374
title: A retired coordinator thread is unloaded from the Codex child
status: To Do
assignee: []
created_date: '2026-09-29 12:31'
labels:
  - codex
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 659000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since TASK-301 a voice start replaces a coordinator that already carried a voice session. The retired coordinator thread is never driven again, but it stays loaded in the Archboard server's Codex child until the child restarts, so a long-running server accumulates one loaded coordinator thread per voice session. When the retired thread's last turn (the transcript-tail turn Codex starts after a session ends) is over, nothing needs it loaded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a voice start replaces a coordinator, the retired thread is unloaded from the Codex child once no turn runs on it
- [ ] #2 A turn still running on the retired thread is not cut short by the unload
- [ ] #3 The unload uses a reviewed Codex app-server request, and a failed unload is reported without affecting the new voice session
<!-- AC:END -->
