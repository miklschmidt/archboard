---
id: TASK-308
title: >-
  Teach the archboard skill to write boards and walkthroughs a reviewer or
  newcomer understands
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 13:31'
updated_date: '2026-09-23 13:33'
labels:
  - skill
  - docs
dependencies: []
ordinal: 540000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user (2026-09-23) finds the pr-lens and eli5 skills (github.com/coldteadotai/pr-lens, MIT) good at getting a diagram's content right and at explaining the how and why to an agent, and wants archboard to learn from them. pr-lens's document format and renderer differ from archboard's (deltas written per element, lanes and layout hints, nested view trees, character caps), so only the content and teaching techniques transfer: what a pull request's board shows, how a beat is worded, and what a newcomer's explanation cuts to. A finding from the comparison: the recording voice is given only a beat's heading and body, never its subjects, view or comparison marks, so a body has to say in words what changed and to which parts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pull request recipe starts from the diff against the merge base and a one-sentence why, and says which neighbours the board keeps and what it leaves out
- [x] #2 The walkthrough guidance says how a beat is worded: one point per beat, a heading that says what changed or holds, a body that says what behaves differently to which named parts, two or three subjects, plain words; and that the voice speaks only from the heading and body
- [x] #3 A newcomer's walkthrough recipe: the answer sentence first, one path of a few parts, a picture that grows beat by beat, and a close that restates the answer
- [x] #4 Nothing of pr-lens's format or renderer semantics is taught, and no text is copied
- [x] #5 Recipes checked against the CLI by writing one board through them on a private canvas
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research (subagent): read pr-lens and eli5 skills and our skill; separate content/teaching techniques from format/renderer semantics.
2. sequences-views-walkthroughs.md: how a beat is written (and that the voice speaks only from heading and body); PR recipe starts from the merge-base diff and a why sentence, keeps direct neighbours, words change beats; a newcomer's walkthrough recipe.
3. SKILL.md routing; authoring.md emphasis test sharpened.
4. Check the recipes against the CLI on a private canvas.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Adapted from pr-lens and eli5 (MIT, Coldtea AI) in our own words, no text copied. Taken: one point per beat; a heading that states the point, and for a change what the PR did (a heading already true on main describes the code, not the change); a body that explains what the picture cannot show, with named parts and the number that matters; two or three subjects; plain words; the why first and a place to look (not a verdict) last; the merge-base diff and a one-sentence why before drawing; direct neighbours for reach, helpers/config/types/tests out; newcomer: answer sentence first, one path of 4-10 parts, views that grow by at most three parts, the failure a reader meets, the answer restated with one number. Left out as format- or renderer-bound: per-element deltas (ours come from branching and compare), lanes and layout hints, nested view trees and stage/focus kinds, a one-or-two cap on the main connection, payload samples, label/subtitle split, character caps, the correction overlay, gitignored render output.
Found while comparing: the recording voice gets only 'step N of M', the heading and the body (presentationSpeech, 1500-character cap), never subjects, view or comparison marks; the skill now says so. A newcomer example marking every path relationship hero clashed with authoring's 'never past half', so the newcomer recipe leaves spine to the general emphasis rule.
Checked on a private canvas: a newcomer board with three growing node-region views, beats bound to them and a closing beat was accepted and each view rasterized to the parts it adds; the PR recipe's command versions were checked earlier (TASK-305). fmt:check, test:repository pass. The skill's effect on agents is for the human-run skill evaluation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The archboard skill now teaches how a beat is worded for a reader and for the voice (which hears only heading and body), starts a pull request's recording from the merge-base diff and a why sentence with change-worded beats, and adds a newcomer's walkthrough that grows the picture a few parts at a time. Content techniques adapted from pr-lens and eli5; none of their format. Checked against the CLI on a private canvas.
<!-- SECTION:FINAL_SUMMARY:END -->
