---
id: TASK-184
title: >-
  Point where the diagram means, and send board news to threads rather than
  panes
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 15:22'
updated_date: '2026-09-12 17:01'
labels: []
dependencies: []
ordinal: 337000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three strands the reader asked for together after TASK-183. They share a release and a review, not a subsystem, so each is a subtask of its own and they can land in any order.

The first is geometry: a route leaves and arrives at a card at whatever angle its first corridor happens to want, so an arrowhead can meet a card tangentially and a rounded turn can start on the card's own edge. The screenshot is at node_modules/.cache/archboard-review/connector-approach.png.

The second is delivery: a pane is a presentation surface a person opens and closes, and it is currently also the thing that decides who hears that a board changed. A write captures ARCHBOARD_PANE and stamps it on the announcement; a delivery port drops a change whose author matches its own pane; and the context check requires the pane's displayed board to be the board that changed. A thread that needs to know its architecture moved therefore hears nothing unless somebody happens to be looking at the right board in the right pane.

The third is prose: the archboard skill's reference set has grown redundant and is being rewritten by a peer who owns skills/archboard/** exclusively. Claude edits nothing in that directory; what Claude owns is the code that refers to those files.
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Three strands the reader asked for together, each closed on its own evidence.

**A route meets what it points at.** The complaint read as angled arrowheads; the measurements said otherwise — every endpoint already left along the side's normal, and what was missing was straight line: a rounded corner takes its radius off both legs, and a track was allowed to sit six units from a card when the arrowhead alone is seven and a half. An approach floor of twelve units is reserved on the first and last turn, the track clearance matches it, and the self-loop — which bypassed the rounding entirely as one cubic from a face back to itself — is built from orthogonal stubs like every other route. Measured across every board of the demo vault: 206 endpoints, none slanted, none cramped, in both grammars.

**Board news reaches sessions, not screens.** A pane is a window a person opens and closes; it had become the thing that chose who heard that an architecture changed. Authorship is now the writing thread, stated per invocation, with the paired coordinator counted as the same session and read live; a closed or differently-occupied pane means only that there is no presentation to report. Four cross-boundary defects were found and fixed on the way, two of them pre-existing: a disconnect destroying the recipient, presentation lag reading as stale board truth, a relink leaving the session unattributable, and a correlation mixing one thread with another's operation.

**The prose stopped repeating itself.** Astra rewrote the skill to 966 words from 5298 and cut the always-injected workhorse prompt to 231 from 643, keeping the target, epoch, authority and approval contracts and the `--as-session` requirement the delivery rule depends on. Claude's part was the code that pointed at the retired files, the derived skill trees, and the three reviewed digests.

Closed after independent renderer, schema, UI-boundary and prompt reviews, visible QA on the geometry in both directions, and a final `bun run check` at exit 0 with 2943 tests passing.
<!-- SECTION:FINAL_SUMMARY:END -->
