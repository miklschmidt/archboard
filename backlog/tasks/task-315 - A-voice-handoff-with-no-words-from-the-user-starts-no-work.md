---
id: TASK-315
title: A voice handoff with no words from the user starts no work
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 21:35'
updated_date: '2026-09-23 21:41'
labels:
  - voice
  - coordinator
dependencies: []
references:
  - src/runtime/codex-instructions/coordinator-developer-instructions.txt
  - src/runtime/codex-realtime/lib/presentation-mode.ts
priority: high
type: bug
ordinal: 547000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-23 23:15 narration the voice model handed off while explaining steps, saying "Give me a second, checking the rest", though the user had asked nothing. A V3 delegation carries the latest user-side item replayed; with nothing from the user, Codex falls back to the running transcript, so the coordinator received `<input>assistant: On your screen, we are starting with the ground rules...</input>`: the voice model's own narration. The coordinator read it as "this spoken request" and delegated "Create or update the appropriate Archboard architecture board" to the workhorse. To the user it sounded like the voice had heard itself; every user line in the transcript was real speech, so it was not echo. The coordinator's instructions say a handoff carries what the user said, which is not always true. A deterministic guard (client-managed handoffs, or the host refusing delegation from a turn whose handoff carried no user line) is a possible follow-up if the instructions do not hold.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The coordinator is told that a handoff whose input holds only the voice model's own words is not a request: it delegates, queues and steers nothing and ends with one [COMMENTARY] line
- [x] #2 The narration prompt tells the voice model that the step it was handed is all it needs, and that it hands off only for a question the user asks
- [ ] #3 A real-voice narration with fast stepping starts no workhorse work, as the user reports
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Coordinator instructions (Language paragraph): say a handoff can carry the voice model's own words, as assistant lines, when the user said nothing, and that such a handoff is no request: no delegation, queue or steer, one [COMMENTARY] line. Update the reviewed digest.
2. Narration prompt: the step handed over is all the voice needs; it hands off only for a question the user asks.
3. The real-voice rerun is the user's; leave AC3 for their report.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coordinator instructions (Language paragraph) now say a handoff with no user line carries the voice model's own words and is never a request; reviewed digest updated in authored.ts, and the instruction and realtime tests pass (183). The narration prompt now says the step handed over is all the voice needs and it hands off only for a question the user asks. A deterministic guard stays out until the real-voice run shows the instructions do not hold.
<!-- SECTION:NOTES:END -->
