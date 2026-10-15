---
id: TASK-478.03
title: >-
  archboard-pr writes the three /pr sections, with the picture and walkthrough
  in the Summary
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
updated_date: '2026-10-15 15:43'
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
- [ ] #1 The skill writes one body with exactly Summary, Evidence and Merge Danger, credits the pr skill it follows, and no longer asks for What changed, Changed but not drawn, What it can reach, Reading order, Where to look closely, Proposed and built, Open it or a before render
- [ ] #2 The body carries no tool vocabulary and no account of the agent's process; the board, the proposal and what it is drawn against live in one HTML comment inside the markers, which an update reads
- [ ] #3 For a stack, the skill keeps one design board, puts each PR's proposal on it or on the drill-down board of one of its parts, branched from the proposal of the PR below, draws each picture `--against` that proposal with a title naming the design part, and opens the Summary with a line that gives the position and the neighbours
- [ ] #4 A narrated walkthrough of three or four beats and about 90 seconds sits under the picture, with chapters and transcript collapsed, and the Summary prose does not repeat it
- [ ] #5 Evidence is one before and after; status news goes in a PR comment; an update replaces the whole section; no paragraph is copied from another PR's body
- [ ] #6 The skill carries one worked example body and points the agent at the repository's glossary; references/explainer.md is removed, and every remaining reference holds only what the skill still uses
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
