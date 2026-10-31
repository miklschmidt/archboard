---
id: TASK-559.22
title: Show the flows and walkthroughs in context in the right column
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T03:17:00Z'
updated_date: '2026-10-31T04:37:00Z'
labels:
  - frontend
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 994000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner found the left Flows and Walkthroughs tabs confusing, because they filter by the open module without saying so, and asked for the right column to show in-context things: the walkthroughs and flows that touch the parts being looked at or selected. Decision: the right column is the context, and the left tabs list the whole model, so a list in the left column never changes under a reader. This fills the empty room between the description and the legend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With nothing selected, the column lists the flows and walkthroughs that touch the open module
- [x] #2 With a selection, the same lists follow the selected subjects
- [x] #3 The left Flows and Walkthroughs tabs list the whole model, whatever is open, and their counts do not change as a reader moves
- [x] #4 At the root with nothing selected the column lists neither, because everything touches the root and the left tabs already hold it all
- [x] #5 A row opens its flow or walkthrough, a long list shows a few rows and how many more, and the legend stays fully on screen
- [ ] #6 The owner accepts it by eye
- [x] #7 With a module open or selected that holds parts, the column states its entry points, hidden parts, callers and pass-through entry points in one short line, combined into no score, and the line opens the Interface section of About
- [x] #8 With one module selected, the column offers Trace onward and Trace back in the control style of main, and the picture grades each further hop, across the doors too, and the trace goes with the pick
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rules: relevance.ts answers what the right column lists, from touchesScope and one shared reach of a selection. Nothing at the root with nothing selected.
2. Panel: ModelPanelContext under the subject, inside the scrolling body, few rows and how many more. A row opens its flow or walkthrough and brings the left column to its tab.
3. Left tabs: ModelChoiceList lists the whole model, counts from the model, the rest row goes, and the walk of [ and ] follows the list.
4. Door: one click opens, Ctrl keeps selecting, a removed door selects, the endpoints move to a hover tip, and About keeps the whole list.
5. Docs, one rule test, one browser owner, screenshots, gate.

3. Interface line: ModelInterfaceLine reads interfaceMeasures from the module's inspection. A selected module with parts gets the Interface section in About. useAboutPlace carries the asked section.

4. Trace: TraceToggle moves to its own file for both panels. pictureReach walks the whole model, with a card or the outermost module that holds no card standing for all it holds, and says the hops as the picture's cards and lines.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope addition from the owner's delegate for AC 7. The purpose of the redesign is to find code smells through A Philosophy of Software Design, so this line matters most. (1) The line and the Interface section of About hold for any selected module with parts: the id === scope gate is gone, and moduleInterface derives from projection.complete, the whole content before a view narrows it. (2) Each count selects through the existing selection, on the module's own picture, opening the module when it is not open: parts as their cards, callers on the door that holds them. About names the hidden parts. No permanent mark, no score, no colour scale, none of the words deep, shallow or smell. (3) When onContainer is not empty, the line adds the count of distinct callers that reach the module itself, labelled 'to module', as a fact. The line moved under an Interface heading, because the counts now select: 'Open in About' in the heading keeps the route to About. On this repository 114 modules hold parts, 70 have such callers, and 9 read as zero entry points with callers. Browser gateway has 5 distinct callers on the model read used here, against 6 in the delegate's message, which counts relationships or a later read. Named for CONTEXT.md, which this branch does not edit: the words entries and 'to module' on the line.

Verification: check:all exit 0 in 152 s, 21 of 21 tasks, 46 of 46 browser files. reader-context.test.ts owns the lists, the interface line, its counts, the door and the engine. reader-trace.test.ts owns the graded hops across doors, and failed with the old drawn-line walk (nothing graded) and with arrival at a container reaching only the part. interface-counts.test.ts owns which door selects a nested caller. Trace: the walk covers the whole model, a card or the outermost module that holds no card stands for all it holds, and onward and back are one walk in reverse. A relationship that names the open module as a whole reaches its parts onward, and a part's trace back does not cross it. reach.ts now applies its own stated rule on arrival, so the older board reaches further too. Two older browser tests changed on purpose: canonical-model-modes expects the whole-model Flows tab, and canonical-model-focus selects a door with Ctrl. semantic-board-interface expects hidden parts by name. Left open: the owner accepts it by eye.
<!-- SECTION:NOTES:END -->
