---
id: TASK-293.01
title: 'Say "user", not "person", wherever the glossary is spoken'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-21 02:08'
updated_date: '2026-09-21 02:13'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-293
priority: high
ordinal: 508000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The maintainer reads "person" as odd and chose "user" on 2026-09-21; CONTEXT.md already defines User and avoids person, human and operator. Everything a model or a reader is told still says "the person": the voice prompt, the presentation texts, the start policy, the coordinator instructions, the tool manifests, DESIGN.md, CLAUDE.md, TESTING.md and the consumer skill, and identifiers such as PersonPresentationChange and onPersonChange. New pane-news sentences will say "user", so old text has to agree first or the voice model hears two words for one thing. Comments are deliberately not swept (258 files): new and touched comments say user, the rest change when next edited. CONTEXT.md still carries a Pending edits entry describing user edits the server has not accepted, which looks like a leftover from before the browser stopped writing (ADR 0023).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every model-facing string (voice prompt, presentation and start-policy texts, coordinator instructions, tool manifests and their digests) says user, and the manifests still load
- [ ] #2 DESIGN.md, CLAUDE.md, AGENTS.md, TESTING.md and skills/archboard say user, with the derived skill copies synced
- [ ] #3 Identifiers that named the person name the user, with no behaviour change and the gate green
- [ ] #4 The Pending edits glossary entry is removed if nothing in the product still has that state, or corrected if something does
- [ ] #5 Committed on its own before the next subtask starts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Commit the plan of record (CONTEXT.md glossary, TASK-293 and its subtasks) as docs first.
2. Scripted, reviewed replacement of person/people with user/users (case kept) in: every source file holding a non-comment mention (voice prompt, presentation-mode, presentation-updates, start-policy, outcome report, present-walkthrough-step, tool manifest archboard-voice.json, CLI help and claim/pane/lock texts, dispatch-approval, board-lock-contracts), whole file so its comments agree; AGENTS.md, DESIGN.md, TESTING.md, INSTALL.md, README.md, skills/archboard, evals/README.md. Kept: the licence NOTICE, "React like a person" in the voice prompt (it means a human being, not the user), ADRs and design records (history), comments in untouched files.
3. Identifiers: PersonPresentationChange, onPersonChange, byPerson, movedByPerson, noteWhereThePersonIs, personDecision, personHasMoved, otherPerson, the board-routing operator kind "person". Not renamed: the wire and persisted value "human" (claim holder, change origin), which is a contract and stored in lease files.
4. Recompute the voice manifest digest; sync skills; remove the Pending edits glossary entry after checking nothing has that state.
5. Verify: lint, fmt, both type-checks, module lane, system lane, repository lane; browser lane because the voice prompt and UI identifiers moved. Commit.
<!-- SECTION:PLAN:END -->
