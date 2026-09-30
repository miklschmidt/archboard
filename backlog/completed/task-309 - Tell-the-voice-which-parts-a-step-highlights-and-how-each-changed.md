---
id: TASK-309
title: Tell the voice which parts a step highlights and how each changed
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 13:40'
updated_date: '2026-09-23 13:46'
labels:
  - voice
  - recording
dependencies: []
ordinal: 541000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A narrated or recorded walkthrough step reaches the voice as 'step N of M', the heading and the body only (presentationSpeech). The voice never learns which subjects the step highlights or how the comparison marks them, so on a pull request's recording it can only speak about a change the body happens to name, and the picture's added, changed and removed marks go unexplained. The user (2026-09-23) asked for the voice to be given the highlighted subjects and their change standing for each step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each step handed to the voice names the subjects the step highlights, by name (a relationship or step by its ends and label), never by id
- [x] #2 On a variant with a predecessor, each named subject says whether it was added, changed or removed against it, and a changed one says what moved
- [x] #3 The voice's presentation and recording instructions say how to use them: speak about the change in its own words, never read the list out
- [x] #4 Owned by a unit test of the subjects a step names and the recording e2e still hands every step over
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. codex-realtime: StepSubject {name, standing, moved} on the stepped change; presentationSpeech appends 'It highlights: …' naming each, with (added|changed: what moved); both presenting prompts say what the list is and to explain the change in their own words, never read it out.
2. server/canvas/narrated-subjects.ts (module root so its owner can import it): names each beat subject (part/sequence by name, relationship/step by ends and label), compares the variant with its predecessor (compareVariants, new shared changeOf beside standingOf) and says what moved, naming a moved-from part by the predecessor's names.
3. walkthrough-narration: walkthroughOnPane returns board, variant and walkthrough, so narrationChangeOf can add the subjects.
4. Skill and DESIGN.md say what the voice is told.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A removed part cannot be a beat subject (integrity: subjects are on the variant), so standing is added, changed or unchanged in practice; the skill tells PR walkthroughs to name removals in the body. Long moved values (over 120 characters, e.g. a description) are said to have changed without their old text.
Verified: narrated-subjects.test.ts (names, standings, moved fields incl. an endpoint moved off a removed part; a variant branched from nothing gives standing null and skips an unknown id); presentation-mode.test.ts (a step's subjects and their change reach the voice under the words the prompt names); recording e2e hands both steps over in order; lint, type-check, 342 tests across server/canvas, codex-realtime and shared/semantic-board. Not verified with the real voice (no Codex sign-in available to a private canvas). A running canvas needs a restart to pick it up.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Each step handed to the voice now lists what it highlights, by name, and on a proposal whether each was added or changed and what moved; the narration and recording prompts say how to use it. Verified by unit owners and the recording e2e; the real voice run is pending.
<!-- SECTION:FINAL_SUMMARY:END -->
