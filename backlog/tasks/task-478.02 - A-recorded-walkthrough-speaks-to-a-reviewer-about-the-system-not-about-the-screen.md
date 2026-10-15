---
id: TASK-478.02
title: >-
  A recorded walkthrough speaks to a reviewer about the system, not about the
  screen
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
updated_date: '2026-10-15 21:00'
labels: []
dependencies: []
parent_task_id: TASK-478
priority: medium
type: enhancement
ordinal: 841000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recorded walkthroughs in pull requests narrate the screen and joke. Transcripts in Platform #599 to #615 open beats with "On screen now: step two", "This step is about", "Here the walkthrough focuses on", and end with "That completes the walkthrough" or, in #589, "Whew! That is the story here." A reviewer reads or hears each point twice, once as the screen description and once as the content. A recording starts the same voice session as live narration (src/server/archboard/lib/walkthrough-narration.ts, header), and that session carries the live conversational persona, "dry-witted, warm and funny" (src/runtime/codex-realtime/lib/voice-prompt.ts). That persona fits a conversation with the user, not a recorded explanation for a reviewer. TASK-293 (in progress) changes what the voice model is told about where the user stands; check for overlap before changing the same messages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recording gives its voice session the live persona with a recording section of its own, and none of the conversation rules: speak about the system in the board's names, never about the screen, the step or the walkthrough itself, humour turned down by a quarter from live talk and no further, and no closing line; live narration and conversation keep their prompts unchanged
- [x] #2 What the voice receives for each recorded beat invites no screen narration; the source of the "On screen now" and "This step" openings is found and named in the task notes
- [ ] #3 A recording made after the change, of a walkthrough in the dogfood vault, is heard by a person, and its transcript in the task notes shows no screen talk and no closing formula
- [x] #4 A test owner proves that a recording session receives the persona and its own section without the conversation rules, and a live narration session the whole live prompt, without matching their wording
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Boards: none affected. The change rewrites what a recording's voice session is told (src/runtime/codex-realtime/lib/presentation-mode.ts, voice-prompt.ts, start-policy.ts); no board draws prompt text, and no part, relationship, binding or module boundary is added, removed, renamed or rewired. The voice realtime part on Agent workbench (bound to src/runtime/codex-realtime) and the recording page's description on Board rasterizer ('reports each step it shows, which the server tells the voice model as it does a step chosen by hand') stay true: the path is unchanged, only the words differ.

1. Source of the screen talk: presentationSpeech in presentation-mode.ts hands each recorded beat over as 'On screen now: step N of M, "heading". body' plus 'It highlights: ...'; recordingPrompt tells the voice each step begins 'On screen now', gives the step number so it knows the last step, and asks it to close the walkthrough with one short sentence; start-policy.ts gives a recording ARCHBOARD_RECORDING_VOICE_PROMPT, which is the live persona (dry-witted, sarcasm, 'Whew!').
2. A recording's voice prompt becomes one narrator prompt of its own (recordingPrompt), with no persona and no conversation rules: speak to a reviewer about the system in the board's names; never about the screen, the picture, the step, the walkthrough or the video; no jokes; no opening or closing formula; say what the subjects do and why without reading the body out; one language (TASK-380 rule kept); stop when done, since silence moves the recording on. Delete ARCHBOARD_RECORDING_VOICE_PROMPT.
3. A recorded beat is handed over as content, without its position and without screen words: an instruction lead-in the prompt names, the heading, the body, and the subjects with their standing under a recording's own label. Live narration keeps 'On the user's screen now: step N of M' and its subjects rule unchanged.
4. Live prompt (ARCHBOARD_VOICE_PROMPT) and the narration prompt stay byte-identical, so TASK-293.05's narration and pane news rules are untouched.
5. Owner: src/runtime/codex-realtime/tests/presentation-mode.test.ts. A recording start's prompt shares no paragraph with the live prompt (persona and conversation); a narration start's prompt begins with the whole live prompt; a recorded beat's speech carries heading, body and subjects but not its position, and begins with the lead-in its prompt names. No wording matched.
6. One real recording of a dogfood walkthrough after the change; transcript into the notes.
7. Report: ADR 0041 and docs/design/codex-workbench-authored-contracts.md say a recording gets 'the voice's persona with a recording section'; both are outside this task's write scope, so the parent amends them.

8. The user wants the persona kept on recordings, with the jokes turned down by about a quarter and no more. Put the persona back in front of the recording section (start-policy.ts, ARCHBOARD_RECORDING_VOICE_PROMPT). Replace the no-jokes rule with a quarter less humour than live talk. Keep the rules against screen talk, step numbers and a closing line. The test owner proves that a recording keeps the persona and none of the conversation rules. Amend ADR 0041 and the authored contracts doc again.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-15 implemented in f9caee1da.

Source of the screen talk (AC2). Three places in src/runtime/codex-realtime, as they were at the parent of f9caee1da:
- presentation-mode.ts presentationSpeech handed each recorded beat to the voice as speech beginning 'On screen now: step N of M, heading. body', then 'It highlights: ...'. The realtime voice echoed the lead-in ('On screen now: step two') and framed beats as steps ('This step is about').
- presentation-mode.ts recordingPrompt told the voice each step begins 'On screen now', gave it the step number so it knows the last step, allowed at most one aside, and ended 'After the last step, close the walkthrough with one short sentence': the source of 'That completes the walkthrough'.
- start-policy.ts gave a recording ARCHBOARD_RECORDING_VOICE_PROMPT, which was the live persona (voice-prompt.ts: dry-witted, warm and funny, sarcasm, Whew!): the source of the jokes.
The recording path itself is unchanged: the recording page's pane reports each step, src/server/archboard/lib/walkthrough-narration.ts tell() turns it into a stepped change, and presentation-updates.ts appends presentationSpeech(change, recording) through thread/realtime/appendSpeech.

Built. A recording's prompt is now recordingPrompt alone (presentation-mode.ts): narrator instructions with no persona and no conversation rules. It says who listens (a reviewer, once, later); talk about the system in the board's names and never about the screen, picture, video, a step, a point, the walkthrough or what is highlighted; no jokes, asides or exclamations; no greeting, opening, summary or closing line; say what the subjects do and why in your own words without reading the heading or text out; the one language (TASK-380 rule kept); stop when done, because silence moves the recording on. A recorded beat is handed over as 'Explain in your own words: heading. body' and, when it has subjects, 'Subjects: ...' with each subject's standing: no position, no step count, no screen words. The voice needs no step number any more, because nothing asks it to close. ARCHBOARD_RECORDING_VOICE_PROMPT is deleted. Live conversation (ARCHBOARD_VOICE_PROMPT) and live narration (that prompt plus narrationPrompt, and the 'On the user's screen now: step N of M' speech) are byte-identical to before.

Overlap with TASK-293 and 293.05: nothing of theirs changed. Their work is in VOICE_CONVERSATION (quiet pane news lines), narrationPrompt (pane news as the one reason to stop) and the live leaving line; all three are untouched. A recording gets no pane news as speech (codex-workbench-session-bindings.ts sets narrated: null while a recording holds the voice), so the recording prompt needs no pane-news rule.

Test owner (AC4): src/runtime/codex-realtime/tests/presentation-mode.test.ts
- 'a narration or recording start names the walkthrough to the voice model ...': a narration start's prompt begins with the whole live prompt, persona included; a recording start's prompt shares no paragraph with the live prompt. Fails when the persona is put back in front of the recording prompt (checked by mutation).
- 'a recording's steps reach the voice model as what to explain, in the words its prompt names, never which step they are, and leaving it is never told': the beat carries heading, body and subject standing, its lead-ins are the ones the prompt names, and it carries no step number or total. Fails when the step number is put back (checked by mutation).
No assertion matches prompt wording.

Boards: none affected (see plan). archboard check --code after the commit: behind lists Realtime voice (src/runtime/codex-realtime), 1 commit, on Agent workbench and Voice coordinator. Read both descriptions: they speak of the broker, the peer connection, the coordinator's channel rule and the catalogue, not of the voice prompt, so both stay true. No relationship changed: the touched files import the same modules as before.

Real recording (AC3), after the change, on this worktree's server restarted on the new source, Codex signed in: archboard semantic record 'Codex session' --walkthrough 'Guard one app-server exchange' --layout blocks; 3 beats, 69.9 s, /tmp/t47802-rec/codex-session.mp4, talk kept in /tmp/t47802-rec/talk1. The CLI first refused with CHECKOUT_NOT_CHOSEN, so the worktree was chosen with repo use for the recording and /home/msc/Projects/archboard was chosen again right after (repo list confirms). Transcript, the final said lines of talk.json in order:

[beat 1, 0:01] Generation hooks initialize the session exactly once, negotiating a fixed capability set, and then proving that the child is using only the private storage paths prepared for it before any login or thread method opens. That gives the rest of the system a trusted, isolated starting point.
[beat 2, 0:22] Behind its gate, each reviewed method reads or mutates the request path, serializing only identities issued for this child epoch. It decodes parameters against the pinned Codex protocol, so one well-formed frame goes on the wire with owned, validated data.
[beat 3, 0:45] Every answer is decoded against the protocol, and the returned identities are adopted in a single transaction according to the method's contract. A failed mutation states whether it was delivered, and reverse requests are answered only for an owned thread, or refused by policy.

No screen talk, no step talk, no joke and no closing formula. Each beat is a reworded explanation of its body in the board's names, not a reading of it. Not exercised live: subjects with an added or changed standing, because this walkthrough is on a current variant. A person still has to listen to the video for AC3.

Outside this task's write scope, for the parent: docs/adr/0041-a-recording-is-a-talk-rendered-frame-by-frame.md (Decision: the voice model gets the voice's persona and a recording section) and docs/design/codex-workbench-authored-contracts.md (the start that records a walkthrough: prompt is the voice's persona with a recording section) are now false. A recording's prompt is its narrator instructions alone, with no persona.

Gate: bun run check passed at e92b4f82f plus the skill commits (exit 0, no failing test in any lane, serial browser lane included). AC 3 stays open: the transcripts of this recording and of the three trial recordings (TASK-478.04) show no screen talk, joke or closing line, but no person has listened to a video yet. Listen to /tmp/t47802-rec/codex-session.mp4 or /tmp/pr-audit/trial-out/607/walkthrough.mp4, then check AC 3.

Persona restored. The user enjoyed the persona and asked to turn the jokes down by 25% and no more. A recording now gets VOICE_PERSONA (ARCHBOARD_RECORDING_VOICE_PROMPT again, chosen in start-policy.ts) followed by the recording section. The section replaces "No jokes, no asides, no exclamations" with a rule to stay in character, with the humour turned down by a quarter from live talk: three jokes where a conversation would get four. The rules against screen talk, step numbers, a greeting and a closing line stay, and so does the one-language rule. The section no longer repeats the persona's "heard, not read" paragraph. Live conversation and live narration prompts are byte-identical to before. Test owner: presentation-mode.test.ts proves that a recording keeps a leading run of the live prompt's paragraphs (the persona) and none of the rest (the conversation), with no wording matched. Two mutations of start-policy.ts each fail it: a recording given the whole live prompt, and a recording given its section alone. bun test src/runtime/codex-realtime: 32 pass. lint, type-check, fmt:check and tests/system/repository-policy (27 pass) are clean. ADR 0041 and docs/design/codex-workbench-authored-contracts.md now say that a recording gets the persona with a recording section and none of the conversation rules. AC 3 was restated: a joke is allowed again, so the transcript only has to show no screen talk and no closing formula.

AC 3 waived by the user on 2026-10-15 ("Close 478 and merge!"). Nobody listened to a recording made with the restored persona, and no such recording exists. The transcripts of the recordings made without the persona show no screen talk and no closing formula. AC 3 stays unchecked, because no evidence proves it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A recording now gives its voice session the live persona with a recording section of its own, and none of the conversation rules. The section forbids screen talk, step numbers, a greeting and a closing line, and turns the humour down by a quarter from live talk. Each recorded beat is handed over as its heading, body and subjects, with no screen position or step count. The test owner in presentation-mode.test.ts proves that a recording keeps the persona and none of the conversation rules, and two mutations fail it. AC 3, a person listening to a recording with the restored persona, was waived by the user and is unchecked. Commits f9caee1da and ff0bdac91.
<!-- SECTION:FINAL_SUMMARY:END -->
