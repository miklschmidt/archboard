---
id: TASK-478.04
title: Three PRs of the device trust stack are re-explained with the new skill
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
updated_date: '2026-10-15 17:12'
labels: []
dependencies:
  - TASK-478.01
  - TASK-478.02
  - TASK-478.03
parent_task_id: TASK-478
priority: medium
type: task
ordinal: 843000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The new archboard-pr has to be judged on the bodies it writes, and the device trust stack (Admin-By-Request/Platform #599 to #615) is where the old one failed. #599 (certificate authorities), #607 (gateway) and #610 (native callers) cover three different areas. Their boards live in /home/msc/Work/Docs-Architecture-Design/architecture-design: the stack built a parallel chain on "Device Trust Control Plane" (5 parts growing to 79) beside the 22-part "Managed PostgreSQL design" that #589 names, so the trial first rebuilds what these three PRs touch as drill-downs of that design. Nothing reaches the Platform pull requests: posting is the user's decision after reading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The parts that #599, #607 and #610 build are drawn in a scratch copy of the Docs-Architecture-Design boards, on a board of their own that starts with a base draft and names its parts as the design of #589 names them, each proposal branched from the proposal of the PR below; Docs-Architecture-Design itself is unchanged
- [x] #2 Three bodies with their pictures and walkthroughs are written to files following the new skill, and nothing is posted to Platform
- [x] #3 The task notes list, per body, every problem of the audit that still appears, with a follow-up task for each one that the skill or archboard has to fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Copy the Docs-Architecture-Design boards into /tmp/pr-audit/dt/.archboard/vault. That repository keeps the old layout, which ADR 0049 no longer serves.
2. Give a fresh agent the new skill and the environment facts, and nothing of this conversation. Ask it to re-explain #599, #607 and #610 into /tmp/pr-audit/trial-out and to post nothing. Ask it to note every place where it did not follow the skill.
3. Read the bodies and pictures against the nine problems of the audit. Fix the skill where the notes show it unclear. File a task for each archboard defect.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Deviation from AC #1: Docs-Architecture-Design keeps its boards in the old layout (architecture-design/ with ARCHBOARD_VAULT in .envrc). Since ADR 0049, archboard refuses a set ARCHBOARD_VAULT and serves only <dir>/.archboard/vault, so the current CLI cannot read that repository in place. Moving a shared team repository to the new layout is the user's decision, so the trial copies its boards into a scratch vault (/tmp/pr-audit/dt/.archboard/vault) and restructures them there. Nothing is written to Docs-Architecture-Design.

A fresh agent ran the trial on the scratch vault. It drew a new board, "Device Trust Control Plane as built". The board starts with a base draft, "Nothing built", that holds the five parts that existed before the stack. A chain of eight proposals follows (#599, #600, #605 to #610), each branched from the one below. The old chain was cut from the design, so it stays as drafts.

Bodies: /tmp/pr-audit/trial-out/{599,607,610}/body.md, with after.svg and walkthrough.mp4 (7.4, 7.5 and 8.4 MB). Notes: /tmp/pr-audit/trial-out/NOTES.md. Nothing was posted. Docs-Architecture-Design and the Platform working copies are unchanged. The registry names the same chosen Platform working copy as before. The agent forgot the 203 worktrees that its first repo use registered.

Bodies against the nine audit problems:
1. Length and nested templates: fixed. The bodies have 502, 447 and 498 words. The old bodies of these PRs had 686, 1172 and 1468. Each has exactly Summary, Evidence and Merge Danger.
2. Agent state and process in the body: fixed. Only the hidden state comment names board, proposal and against. No tool words, no provenance.
3. Pictures not anchored to #589: improved. Titles say "Inside Endpoint Gateway" and "Inside Bun reference Client", and part names follow the design. Still open: #607 (1576 px) and #610 (1478 px) are wider than the GitHub column, so their labels shrink. The skill now splits such a picture into one per design part.
4. Planned frame: fixed. No picture carries it (data-slot planned-frame: 0 in all three SVGs).
5. Tool output as sentences: fixed. None.
6. Video and duplication: improved. Each body has one video, because each crosses three or more parts. Chapters sit inside the collapsed transcript. Transcripts talk about the system, not the screen. The first #607 recording stated a wrong fact, so the skill now checks the transcript against the diff.
7. Evidence as provenance: fixed. Each Evidence names the CI job and tests of the PR. Residual: each After paragraph lists three to five tests in 70 to 90 words. The skill now names at most two.
8. Stack shape and copied text: fixed. One shape, a stack line in each, no copied paragraph, no CI news.
9. Language: improved. The Summary and Merge Danger use plain sentences. The Evidence paragraphs stay dense (see 7).

Skill fixes from the trial notes: c5dbef837. Archboard defect found and reproduced: TASK-479. A part added to a variant after it was branched gets an order that its branches already hold.

Not filed: the key lists "More emphasis" and "Illustrated traffic" whenever a picture draws a line. picture-key.ts states that as deliberate (LINE_MARKS), so it is a design question, not a defect.

Not filed: a claim taken with --for 4h seemed to end after about an hour. Nobody reproduced it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A fresh agent re-explained Platform #599, #607 and #610 with the new skill into /tmp/pr-audit/trial-out, posting nothing. The boards are in a scratch copy of Docs-Architecture-Design, because that repository keeps the layout that ADR 0049 no longer serves. The bodies have 447 to 502 words (the old ones 686 to 1468), three sections, no tool words or provenance, no planned frame, and pictures titled by the design part they sit inside. Residual: two pictures are wider than the GitHub column, and the Evidence paragraphs list too many tests. The skill now splits such pictures and names at most two tests (c5dbef837). The archboard defect it hit is TASK-479.
<!-- SECTION:FINAL_SUMMARY:END -->
