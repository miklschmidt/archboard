---
id: TASK-315
title: >-
  A voice handoff with no words from the user is never taken as the user's
  instruction
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 21:35'
updated_date: '2026-09-24 01:38'
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
In the 2026-09-23 23:15 narration the voice model handed off while explaining steps, saying "Give me a second, checking the rest", though the user had asked nothing. The coordinator received `<input>assistant: On your screen, we are starting with the ground rules...</input>`: the voice model's own narration. It read that as "this spoken request" and delegated "Create or update the appropriate Archboard architecture board" to the workhorse. The user heard the voice picked up by their microphone. The log cannot confirm or rule that out: the input audio for that minute was already pruned, and an echo the voice model heard but nobody transcribed leaves the same trace as no user speech, because a V3 delegation with no user-side text falls back to the running transcript. Either way the handoff carried the voice model's own words. A deterministic guard (client-managed handoffs, or the host refusing delegation from a turn whose handoff carried no user line) is a possible follow-up if the instructions do not hold.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The coordinator is told that a handoff holding only the voice model's own words (assistant lines with no user line) is the voice model's, never the user's: it starts no board change from it, answers a request the words show, such as an announced lookup, and otherwise tells the voice model in one [COMMENTARY] line that the handoff request was unclear
- [x] #2 The narration prompt tells the voice model that the step it was handed is all it needs, and that it hands off only for a question the user asks
- [x] #3 A real-voice narration with fast stepping starts no workhorse work, as the user reports
- [x] #4 The coordinator's channel rule says [FINAL] is the only message the voice model reacts to, and a turn that answers a handoff always ends with one
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

User correction: the voice was picked up by their microphone. The coordinator rule now also covers user input that repeats or closely matches what the voice model just said, and its [COMMENTARY] line tells the voice model that the handoff was its own voice, so it was dropped and nothing will come back. Digest updated; instruction and coordinator tests pass (152).

User decision 2026-09-24: no rule for the microphone echo case (rare); only the assistant-only handoff is handled. The echo clause is removed from the coordinator instructions; digest re-pinned, tests pass (183).

User direction 2026-09-24: what went wrong is that the coordinator took the voice model's words as the user's explicit instruction. The rule now says assistant-only input is the voice model's spoken words: the coordinator never treats it as the user's instruction and starts no board change from it, answers a request those words show (such as a lookup the voice announced), and otherwise tells the voice model the handoff request was unclear. Digest re-pinned; tests pass (183).

User point 2026-09-24: coordinator answers must wake the voice model. The channel rule (start-policy.ts, rendered into the coordinator's world state while voice is live, not the developer instructions) now says [FINAL] is the only message the voice model reacts to (Codex 0.155.1 v3_output_writer: FINAL is a speakable append, COMMENTARY a quiet one), and every turn that answers a handoff ends with one. In the 23:15 session the first handoff turn ended with only [COMMENTARY] ("The workhorse has started..."), the voice fell silent after "Give me a second", and the user asked "You good" 18 s later. The recording rule shares the channel lines but keeps its never-[FINAL] line without the handoff line. The unclear own-words handoff is now answered with a short [FINAL]. Tests pass (183), lint exit 0.

User request 2026-09-24: the live channel rule now ends with two example turns (a lookup answered, and work handed to the workhorse), each a [COMMENTARY] line followed by the [FINAL] answer.

User real-voice rerun 2026-09-24 (row e of the narration acceptance): fast stepping started no workhorse work.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The coordinator reads a handoff made only of the voice model's own words as the voice model's, never the user's instruction, starts no board change from it and answers what it asks or says it could not tell; every answer to a handoff ends with [FINAL], the only line the voice reacts to, with two example turns; a narrating voice hands off only for a question. Verified by the instruction tests and the user's real-voice rerun.
<!-- SECTION:FINAL_SUMMARY:END -->
