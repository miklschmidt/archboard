---
id: TASK-517.01
title: Separate host policy from Codex workbench mechanics
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24 11:38'
updated_date: '2026-10-24 12:47'
labels: []
dependencies: []
parent_task_id: TASK-517
priority: high
type: task
ordinal: 926000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current workbench requires Archboard context and instructions throughout its runtime. Both applications need the same agent authority and lifecycle behavior with their own domain policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Role instructions, context events, domain tools, and checkout access enter through explicit host contracts.
- [x] #2 Reusable mechanics preserve exact generation checks, unknown delivery outcomes, approval ownership, and coordinator retirement.
- [x] #3 Archboard supplies board context, catalogues, narration, and domain instructions through its integration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This delivery contributes host separation to the parent proposals: Archboard@TASK-517; Agent workbench@TASK-517; Voice coordinator@TASK-517; Codex workhorse@TASK-517; Codex session@TASK-517; Browser application@TASK-517; Archboard server@TASK-517.
1. Split reusable execution authority from Archboard board meaning without weakening identity or freshness comparisons.
2. Compose core role instructions with immutable host instructions. Hash the exact composed instructions and manifests.
3. Inject host context sources, domain tools, and checkout admission. Keep board catalogues, pane news, and narration in Archboard.
4. Remove mandatory Archboard environment variables from the Codex process contract. Preserve its environment allowlist and protected storage roots.
5. Move board-specific semantic publishing out of the Codex SDK and into the Archboard integration.
6. Preserve the current public Archboard behavior through the new policy inputs and run focused backend owners.
7. Inspect the implementation for a smaller interface and commit the changes with Refs: TASK-517.01.
The parent owns board adoption, the complete gate, review, and final acceptance evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent changed package exports so the Archboard semantic publisher belongs to workbench. The SDK no longer exposes semantic-context. The host-separation implementer owns the matching source and test relocation. Canonical realtime contracts stay in workbench until TASK-517.02.

SDK environment checkpoint 78c87705e passed 51 focused environment, storage, and process cases. Scoped lint and formatting passed. Browser types passed. The concurrent host extraction still owns the remaining source type error. The parent updated ownership documentation and TASK-517 proposal bindings for the semantic publisher. Current variants retain the prior paths until the parent adopts the completed proposals.

After the initial gate failure, every remaining normal lane ran. System tests passed 257 cases and repository owners passed 142 cases. The complete canonical browser inventory then passed all 19 owners with the installed system Chromium. TASK-518 records the corrected browser prerequisite. TASK-519 owns the reproduced renderer timing failure before the next full gate.

The reproduced renderer timing failure is repaired in e77643cbe under TASK-519. The final focused timing is 2938.28 ms against the unchanged limit below 3000 ms, with byte-identical solver outputs. A fresh complete gate now decides whether this delivery can close.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Separated host instructions, context conversion, checkout admission, and voice policy from reusable execution mechanics. Moved board semantic publishing out of the Codex SDK. SDK setup now accepts explicit host environment inputs. All 827 focused backend cases passed. The complete gate exited 0 at 3af12506e with 4909 module, 257 system, 142 repository, and 19 browser owners passing. TASK-518 and TASK-519 record the gate repairs. Parent TASK-517 retains the architecture proposals for package extraction and final adoption.
<!-- SECTION:FINAL_SUMMARY:END -->
