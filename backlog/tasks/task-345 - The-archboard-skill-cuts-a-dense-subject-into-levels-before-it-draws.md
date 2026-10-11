---
id: TASK-345
title: The archboard skill cuts a dense subject into levels before it draws
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 22:39'
updated_date: '2026-10-11 14:10'
labels:
  - skill
dependencies: []
priority: high
type: enhancement
ordinal: 586000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User review 2026-09-25: the Archboard server board puts 22 cards and 49 labelled relationships on one level, seven of them route handlers, and three hubs (Agent CLI 7 out, Pane registry 7 in, Semantic board store 7 in) carry most of the lines. It is slow to lay out and hard to read, and the user judged that collapsing the routes into one card with a drill-down 'seems like the way it should have been done from the start', which makes it an archboard skill issue: the skill teaches levels and drill-downs (TASK-156) and groups (TASK-235.08) but nothing made the author notice that the subject had outgrown one level. Skill evaluations are human-run: never start eval:skill run or grade.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The archboard skill tells an author when one board holds more than a reader can take in at one level and how to cut it: a set of like parts becomes one card with a drillDown into a board of its own, and the rest stays on the level above
- [x] #2 The rule is stated in the skill's own vocabulary without examples drawn from skill evaluations, and describes archboard or a generic subject
- [x] #3 The dogfood Archboard server board is remodelled by that rule: its route handlers move to a linked routes board reached by drillDown, and both boards are rendered and looked at
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one rule to skills/archboard/references/create-architecture.md (count the cards one level holds; a set of like parts becomes one card with a drillDown into its own board; reconciled with the existing views advice) and a pointer in SKILL.md runbook step 5. 2. Create the board 'Archboard server routes' (module level). 3. Branch Archboard server as TASK-345, cut the nine route cards into one 'Route handlers' card (id Y70KOm9C kept) that drills down to it, adopt. 4. Render and look at both boards.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit re-verified: current variant TASK-448 had 29 nodes, 9 of kind route, 90 edges, no routes board. Done: skill rule (create-architecture.md, SKILL.md step 5); new board 'Archboard server routes' (module, 21 nodes, with views 'Board writes' and 'Reads and checks' and a 4-beat walkthrough); Archboard server adopted from proposal TASK-345 (now 21 nodes, 52 edges). Decisions: card kind is module (the level of the board it opens, DRILL_DOWN_LEVEL_MISMATCH); card is unbound because a file binding made every other file's anchors ANCHOR_MISMATCH and a lib-directory binding claimed HTTP listener and Mutation admission; three calls the card made (renderer, history lens, code check) moved to the Archboard server container so check --code reports no new finding (same pattern as the container's existing calls to the store and lease). The one-member 'writes' group on Mutation admission and the group on the card were removed because the renderer drew an empty orange region taller than the server. The routes board has no container card, so it has no upward link (breadcrumb returns); a container made the route row 5800 px wide. The five flows and the walkthrough that named route cards were restated onto the card, six beats given a view to avoid WALKTHROUGH_VIEW_MISSING; one self step (the write envelope) dropped. No code changed, so the footprint step does not apply. Evidence: check clean; check --code diff before/after adoption shows no new finding; eval:skill check ok; bun test skill-evaluation + install-targets 247 pass. Pictures looked at (scratchpad PNGs): before 5365x3649 with nine route fan-outs; after 5790x3426 but one fan and a readable write path; routes board 4725x1818 and its Board writes view. Not proven: that an author follows the new rule (needs a human-run skill evaluation). README.md of .archboard lists the boards and was out of write scope: it needs a row for 'Archboard server routes'.

2026-10-11 parent review: read the rule in create-architecture.md and SKILL.md step 5 (generic examples: routes of a server, CLI commands, queue handlers, screen components; none from skill evaluations), and looked at the rendered boards: Archboard server before (9 route cards, 90 edges) and after (one 'Route handlers' card, 21 nodes, 52 edges) and the new 'Archboard server routes' board. The server board is not smaller on the page (5790 wide against 5365) but has one fan-out instead of nine and a visible write path. Not verified: whether an author now follows the rule, which needs a human-run skill evaluation. Open observations from the work: a group on the new card drew an empty orange region taller than the server (likely a renderer defect), and the routes board has no container, so it has no upward link.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The archboard skill now tells an author when one level holds too much (a dozen or more cards: look for three or more like parts with the same callers and collaborators) and how to cut it (one card with a drillDown into its own board, the level above keeps one relationship per collaborator and per caller), in create-architecture.md and step 5 of SKILL.md, with generic examples. The dogfood Archboard server board was remodelled by it: nine route cards became one Route handlers card that drills down to the new Archboard server routes board, and the vault README lists it. Verified: ./bin/dogfood check reports no diagnostics, no new code finding, eval:skill check and 247 skill-evaluation and install tests pass, and both boards were rendered and looked at. Whether the rule changes authors' boards needs a human-run skill evaluation.
<!-- SECTION:FINAL_SUMMARY:END -->
