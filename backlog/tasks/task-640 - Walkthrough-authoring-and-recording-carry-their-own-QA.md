---
id: TASK-640
title: Walkthrough authoring and recording carry their own QA
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-15T02:24:00Z'
updated_date: '2026-11-15T04:07:00Z'
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
Explainer reauthored (486b7079eb, then plain user language 4789d9de10 and 5d0bd7ffc0 after a take inverted "Merging the code adopts nothing"). Web-shop walkthroughs reauthored with a regenerated history.import.json (fad33c9726), then restated as descriptions (7cf7c7579c) after three PR takes in a row answered beat text that sounded like a request ("Shoppers should not wait…", "This draft", "Inspect the webhook"); pr-walkthrough pin now 452d05c6. Site player text matches "How an order is placed today". Recording check found most "290 ms" dropouts were silent concealment (a62f845f53). Final takes: explainer and pr-walkthrough clean; newcomer carries a fixed 33 ms audible concealment that recurs identically (TASK-641).
<!-- SECTION:NOTES:END -->
