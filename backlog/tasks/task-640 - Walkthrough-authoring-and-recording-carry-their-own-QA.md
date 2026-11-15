---
id: TASK-640
title: Walkthrough authoring and recording carry their own QA
status: Done
assignee:
  - '@claude'
created_date: '2026-11-15T02:24:00Z'
updated_date: '2026-11-15T04:47:00Z'
labels: []
dependencies: []
type: bug
ordinal: 1082000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The README explainer said that Codex "uses exactly what you have on screen, nothing more", because its Ask step claimed that Codex "changes nothing". Codex can hand work to an agent that reads the whole repository and changes it on request. Nothing in the consumer skill asked the author to check a claim, or to read what the voice said before a recording was used. The kept talk of one take also lost 288 ms of voice, which the recorder reports but the README kit hides. The consumer guide also pushed narratives to be thin ("what the picture cannot show", "a few sentences"), so the voice filled the gaps itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The consumer walkthrough reference has the author check every narrative claim against source or product behavior before saving it
- [x] #2 The consumer walkthrough reference says how to check a recording: a whole voice, and each beat's spoken words against its narrative and source, with the repair for each failure
- [x] #3 The consumer walkthrough reference lets a narrative hold everything its point needs, with no limit to what the picture cannot show or to a few sentences
- [x] #4 The archboard-pr walkthrough guide uses the consumer check instead of its own
- [x] #5 The README kit reports a voice dropout in a narrated recording
- [x] #6 The explainer's Ask step says what Codex can do, and the README explainer video is recorded again and passes the check
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the Ask step of "What Archboard does" through a claimed edit-walkthrough.
2. In skills/archboard/references/canonical-walkthroughs.md, let a narrative hold everything its point needs, add a claim check to beat authoring, and add a recording check (whole voice, per-beat transcript against narrative and source).
3. Point skills/archboard-pr/references/walkthrough.md at that check.
4. Make scripts/readme-assets/narrated.ts report a voice dropout from the kept talk.
5. Record the explainer again, run the check on it, and relink the README.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Explainer reauthored (486b7079eb), then put in plain user language (4789d9de10, 5d0bd7ffc0) after a take inverted "Merging the code adopts nothing". Web-shop walkthroughs reauthored with a regenerated history.import.json (fad33c9726), then restated as descriptions (7cf7c7579c) after three PR takes in a row answered step text that sounded like a request; pr-walkthrough pins 452d05c6. Site player text matches "How an order is placed today". A try at warning only about audible loss through silentConcealedSamples was reverted (53f2640c7d) because that counter does not prove the lost audio was silent. Final takes: explainer and pr-walkthrough concealed nothing; newcomer concealed 287 ms with no quiet hole inside speech (TASK-641).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Walkthrough authoring and recording now carry their own QA. The consumer reference (skills/archboard/references/canonical-walkthroughs.md) lets a narrative hold all its point needs, has the author prove each claim, and adds a recording check: a whole voice, and each step's spoken words against narrative and source, where a short opener passes and a reply fails. The PR walkthrough guide and the README asset guide use it. "What Archboard does" and the web-shop example's three walkthroughs were reauthored through the CLI, the fixture was exported again and pr-walkthrough pins 452d05c6, and the site player mirrors the new "How an order is placed today". The README kit prints the recorder's dropout warning for a new recording and none on --replay. Verified: bun run check 26/26, all 13 PR checks, a fresh fixture import, and the transcripts of the final README takes (explainer and pr-walkthrough concealed nothing; newcomer concealed 287 ms with no quiet hole inside speech). Follow-up: TASK-641 (where and why a take loses about 290 ms).
<!-- SECTION:FINAL_SUMMARY:END -->
