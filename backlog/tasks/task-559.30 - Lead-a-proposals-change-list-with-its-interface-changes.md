---
id: TASK-559.30
title: Lead a proposal's change list with its interface changes
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T04:17:00Z'
updated_date: '2026-10-31T09:04:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.23
  - TASK-559.27
parent_task_id: TASK-559
priority: medium
ordinal: 1002000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0044:220 says that a comparison states interface changes first, because they cost every caller. The Changes tab does not. Audit rank 6. compareInterfaces holds the answer and TASK-559.27 brings it back to the comparison read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Changes tab states interface changes first
- [x] #2 A row selects the changed module on the picture
- [x] #3 A comparison with no interface change says so
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Derive one row for each module in comparison.interfaceChanges, with what moved and the counts that differ, in a pure rule that change-list.ts calls, because the drawing of the comparison knows where a removed module stands.
2. Put the rows above the change list in the Changes tab, as a tree of their own. A row uses choices.showHere, the path of a count of the interface line, and brings the picture back from About.
3. State the case of no interface change in one quiet line, and say so on a row whose module the state lacks.
4. Test the rule in a unit owner and the visible behavior in canonical-model-comparison.test.ts. Update DESIGN.md, reader-redesign.md and test-suite.md.
5. Look at 93RlBGLx and G7qK7B9v at 1920 by 1080, then run check:all.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Architecture: no proposal is needed. The reader already read the comparison, and no module, relationship or flow changes meaning.
Decision: the rows live in ChangeList and not in findModule's path, because findModule reads model.modules, finds no parent for a removed module and would open the roots and select nothing. The parent comes from the drawing of the comparison, which holds what the state removed.
Decision: counts stay on the rows, on one line that shows only what differs. They add scale to a fact: callers 14 → 13 says more than one name alone.
Decision: a module whose counts moved with no interface change has no row. On 93RlBGLx that is 3 of 5 modules, all outgoing only. They are no cost to a caller, and the change list below already names the relationship. model compare still states them.
Decision: a module with parts on one side shows no count, because no parts is not a count of zero (ADR 0044).
Decision: interface rows are no steps of the walk, so N, P and the count of the tab keep their meaning.
Limit: the section has no cap. 93RlBGLx against Current has 2910 changes and an interface section 11807 px high. The list is far longer, so the rows only add to a scroll that exists. N and P still reach every change.
Seen, not caused here: a selected removed module shows 'The canonical model cannot be read coherently.' beside Open code (screenshot 5). The cause was not investigated.
Evidence: screenshots in /tmp/integrate/slice30/. check:all exit 0 on 3643c47ba, 21 of 21 tasks, 47 of 47 browser owners, log /tmp/integrate/slice30-gate.log.

Merged to integrate/pr19, gate 21 of 21 in 143 s, server 17842 restarted. Open: selecting a removed module shows 'The canonical model cannot be read coherently.' beside Open code.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Changes tab now opens with the interface changes of a proposal, as ADR 0044 asks. Each module reads once, with what moved and the counts that differ, before and after. A row selects the module on the picture that holds it, through the path of a count of the interface line. A module the state lacks says so and its row reaches it on the drawing of the comparison. A proposal with no interface change says so in one quiet line. Verified in a real browser on 93RlBGLx and G7qK7B9v, by canonical-model-comparison.test.ts and interface-changes.test.ts, and by check:all. Left In Progress for the integrator.
<!-- SECTION:FINAL_SUMMARY:END -->
