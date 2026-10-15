---
id: TASK-478.03
title: >-
  archboard-pr writes the three /pr sections, with the picture and walkthrough
  in the Summary
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
updated_date: '2026-10-15 17:12'
labels: []
dependencies:
  - TASK-478.01
parent_task_id: TASK-478
priority: high
type: enhancement
ordinal: 842000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard-pr asks for ten explainer parts (SKILL.md section 4) and the user's /pr template asks for three sections, so agents nested one inside the other. The audit of Platform #599 to #615 traced most failures to the skill itself: the `Open it` line stores the agent's state in the body for the next update; "What changed" must come from compare and footprint, so it reads as tool output; the render rules zoom to the changed parts and never place a PR in the design; the walkthrough threshold fires on almost every PR; nothing stops provenance prose, copied paragraphs or status news in the body. The user chose the /pr template (Summary, Evidence, Merge Danger, after Matt Pocock's pr skill) with the archboard picture and a short narrated walkthrough in the Summary. archboard-pr ships to repositories that lack the user's private /pr skill, so it carries the template itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill writes one body with exactly Summary, Evidence and Merge Danger, credits the pr skill it follows, and no longer asks for What changed, Changed but not drawn, What it can reach, Reading order, Where to look closely, Proposed and built, Open it or a before render
- [x] #2 The body carries no tool vocabulary and no account of the agent's process; the board, the proposal and what it is drawn against live in one HTML comment inside the markers, which an update reads
- [x] #3 For a stack, the skill keeps one design board, puts each PR's proposal on it or on the drill-down board of one of its parts, branched from the proposal of the PR below, draws each picture `--against` that proposal with a title naming the design part, and opens the Summary with a line that gives the position and the neighbours
- [x] #4 A narrated walkthrough of three or four beats and about 90 seconds sits under the picture, with chapters and transcript collapsed, and the Summary prose does not repeat it
- [x] #5 Evidence is one before and after; status news goes in a PR comment; an update replaces the whole section; no paragraph is copied from another PR's body
- [x] #6 The skill carries one worked example body and points the agent at the repository's glossary; references/explainer.md is removed, and every remaining reference holds only what the skill still uses
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: none affected. No board in .archboard/vault binds skills/ (grep finds no skills/ path and no archboard-pr), so this is a skill-text change.
2. SKILL.md: one body template, Summary, Evidence and Merge Danger, credited to the MIT pr skill by Matt Pocock (github.com/mattpocock/skills, skills/engineering/pr). Sections: 0 prerequisites (kept), 1 decide what to draw (three rows: proposal, ephemeral board, a text view of the pr skill), 2 the proposal with the stack rules, 3 ephemeral board, 4 the picture, 5 the walkthrough, 6 write the body (worked example from TASK-467, rules per section, the never-list, a check), 7 post, 8 after the merge.
3. Stack rules: one board carries the stack; each proposal holds what is built up to its PR, branched from the proposal of the nearest PR below on that board; finer parts nest in the design part they belong to on the same board, read through a shared "Inside <part>" view; a design drawn before the code stays a draft and is never cut into a chain; every picture and recording is drawn --against the proposal below.
4. State: one HTML comment inside the markers names board, proposal and against; an update reads it, or the Open it line of an older body.
5. references: delete explainer.md; renders.md drops the before render and adds --against and the title rule; walkthrough.md becomes 3 to 4 beats, about 90 s, chapters inside the collapsed transcript, recorded --against; posting.md wraps the whole body in the markers and moves status news to comments; reconcile.md and ephemeral.md lose Proposed and built, Open it and About the picture.
6. After TASK-478.01 lands, make sure that the flags the skill names match the CLI help of render, rasterize and record.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gate: bun run check passed at e92b4f82f plus the skill commits (exit 0, no failing test in any lane, serial browser lane included). Evidence for the criteria: the skill text at c5dbef837, and the three bodies a fresh agent wrote with it in TASK-478.04 (exactly three sections, the state comment the only archboard word, a stack line, pictures drawn against the proposal below, three-beat walkthroughs with chapters in the collapsed transcript, CI evidence). The trial notes led to the fixes in c5dbef837. tests/system/repository-policy skill-frontmatter and skill-links: 7 pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard-pr now writes one body with Summary, Evidence and Merge Danger, after the MIT pr skill by Matt Pocock. The Summary holds a stack line, one to three sentences, one picture drawn --against the variant its proposal came from, and a three-beat narrated walkthrough with chapters inside the collapsed transcript. Board, proposal and against live in one hidden HTML comment. A never-list keeps tool words, process, negative-scope lists, copied paragraphs and status news out of the body. A stack keeps one chain per board, branched from the proposal below, names parts as the design does, and starts a board that nobody built with a base draft. references/explainer.md is gone, and the references were cut to what the skill uses (1,079 lines before, 964 after). A fresh agent followed it on Platform #599, #607 and #610 (TASK-478.04), and its notes led to c5dbef837. Commits a75db4380, c5dbef837.
<!-- SECTION:FINAL_SUMMARY:END -->
