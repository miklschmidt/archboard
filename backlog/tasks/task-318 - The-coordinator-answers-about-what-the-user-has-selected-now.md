---
id: TASK-318
title: The coordinator answers about what the user has selected now
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 21:36'
updated_date: '2026-10-11 14:50'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/runtime/codex-coordinator-callbacks/lib/pane-news.ts
  - src/runtime/codex-instructions/coordinator-developer-instructions.txt
priority: medium
type: bug
ordinal: 550000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-23 23:15 session the user selected Headless Chromium, then Canvas server, and asked "Can you tell me more about this" and "can you see what I have selected now". The host told only the voice model ("The user is now looking at board Archboard, with Headless Chromium selected (data)."). A V3 handoff carries only the user's words, so the coordinator got "Can you tell me more about this" with no referent. Its own board context is refreshed only when the host starts a coordinator turn, and the last one (a workhorse outcome) showed no selection. It has no tool that reads a pane, and the CLI could not run in its sandbox (TASK-314). It answered from the stale context and said "I checked the live canvas context", which it had not. Related: TASK-293.06.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A voice question about "this" asked after the user selects something is answered about that selection
- [ ] #2 The coordinator never says it read the live canvas when it did not
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Investigation (code): a voice handoff turn is started by Codex itself, never by the host, so no additionalContext rides on it; the host only attaches context to turns it starts (workhorse outcome reports, delegations). Pane selection news goes only to the voice model (TASK-293). So the coordinator's only live read of a selection is the archboard CLI 'browser panes' (GET /api/panes, the server's cache of each pane's latest report), which the Pointing paragraph of the coordinator instructions already requires and TASK-314 made runnable from the sandbox. No host change makes AC1 more true without injecting pane news into the coordinator (rejected by TASK-293). 2. AC2: one sentence in the coordinator instructions: never say you read the live canvas unless a browser panes read succeeded this turn; say when it failed. 3. Follow-up: both reviewed instructions ask for --as-session on browser show too. Update the two digests (authored.ts, contract.test.ts workhorse digest). 4. Test: system owner codex-pane-context asserts GET /api/panes reports the pick the pane just made (the live read the coordinator is told to make).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found while diagnosing: the host already reaches the coordinator thread without a turn through thread/inject_items (the callbacks use it for operation outcomes while voice is not live, DESIGN.md section 2). Pane news while voice is live goes only to the voice model through realtime appendText (pane-news.ts).

2026-10-11 Investigation: a voice handoff turn is started by Codex itself (V3 handoff), not by the host, so no additionalContext rides on it; the host attaches context only to turns it starts (outcome reports, delegations). Pane selection news goes only to the voice model by TASK-293's rule, and the coordinator is told only outside agents' changes. So the coordinator's only live read of the selection is 'browser panes' (GET /api/panes, the server's cache of each pane's latest report), which the Pointing paragraph of its instructions already required and TASK-314 (sandbox network) made runnable. No host change makes AC1 truer without injecting pane news into the coordinator, which TASK-293 rejected; a read-pane coordinator tool would be a larger change (manifest, digests) and was not built. AC2: one sentence added to the coordinator instructions (say you read or checked the live canvas only after a successful browser panes in this turn; otherwise say it could not run and do not answer a pointing question from board context). Also: both reviewed instructions now ask for --as-session on browser show (TASK-293.06 follow-up); digests updated in authored.ts and the workhorse digest in codex-thread-tools/tests/contract.test.ts; the digest change still needs the human re-review its error message names. Test: tests/system/server-state/codex-pane-context.test.ts now asserts GET /api/panes holds the pick the pane just reported (the live read the coordinator is sent to). Verified: that file and codex-outside-change pass, bun test --isolate src/runtime src/server src/shared src/cli 3288 pass 0 fail, tsc clean, lint:tests clean, oxfmt clean. ACs left unchecked: whether the coordinator actually reads before answering and never claims an unread canvas is model behaviour; a real-voice check remains (select a node, ask 'can you tell me more about this', confirm the coordinator turn ran browser panes and the answer is about that node; ask it with the CLI blocked and confirm it says it could not read).
<!-- SECTION:NOTES:END -->
