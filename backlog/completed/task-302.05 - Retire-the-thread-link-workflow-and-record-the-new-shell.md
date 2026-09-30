---
id: TASK-302.05
title: Retire the thread-link workflow and record the new shell
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 03:21'
updated_date: '2026-09-23 05:43'
labels: []
dependencies:
  - TASK-302.03
  - TASK-302.04
parent_task_id: TASK-302
priority: high
ordinal: 527000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the agent bar and navigator ship, the thread-link chooser, the Agent settings dialog, the session column, the side-panel tabs and the orphan modules have no purpose, and the docs and ADRs still describe the old workflow (ADR 0019 requires the person to create a link; operator-canvas-shell.md shows a bottom workbench; the voice acceptance procedure names a Start agent button).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No production code or test references the removed thread-link, agent-settings, session-column or side-panel UI, and unused UI modules are deleted
- [x] #2 ADR 0019 records that the first send or Talk creates the workhorse and that the conversation follows the pane holding it
- [x] #3 docs/design/operator-canvas-shell.md, CONTEXT.md, TESTING.md and the voice acceptance procedure describe the shipped shell
- [x] #4 The browser lane owners assert the new behaviour through roles, geometry and wire commands, not copy
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Delete the thread-link chooser, Agent settings, session column, side panels, dock and the modules and registry files they leave unused, with their lint exemptions.
2. Amend ADR 0019 (one canvas link made by the first message or Talk) and update DESIGN.md, CONTEXT.md and AGENTS.md sentences about a pane's link.
3. Record the shipped navigator and agent in docs/design/operator-canvas-shell.md with rendered captures in both themes; rewrite the voice acceptance procedure and TESTING.md.
4. Move the browser lane owners to the new shell through shared selectors and data-slot hooks: shell-layout, workspace-address, opener-settings, codex-text-workbench, codex-live-voice.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Docs: ADR 0019 amended (one canvas link made by the first message or Talk); DESIGN.md, CONTEXT.md, AGENTS.md say the link is the canvas's; docs/design/operator-canvas-shell.md gains The navigator and The agent with rendered captures in both themes; the voice acceptance procedure and TESTING.md walk the agent bar and panel. Browser owners moved to the new shell: shell-layout (geometry incl. bar and panel), workspace-address, opener-settings, codex-text-workbench (signed-out send through sign-in to approvals), codex-live-voice (Talk through setup to live voice, voice lines, presentation). Removed: dock, Agent settings, session column, side panels, thread-link chooser, unused registry items and components.

Verification: grep finds no production or test reference to the thread-link chooser, Agent settings, session column, side panels or dock; the voice transcript, voice context, spoken approval, board status and coordinator UI modules (no consumers) and the registry thread items are deleted; ADR 0019 amended; operator-canvas-shell.md, CONTEXT.md, DESIGN.md, AGENTS.md, TESTING.md and the voice acceptance procedure describe the shipped shell; the architecture vault's Browser application and Agent workbench boards say the agent bar and the canvas's link. Browser owners assert through data-slot hooks, roles, geometry and fixture wire records; the full serial browser lane passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Retired the thread-link workflow and recorded the new shell: the manual link, Agent settings, dock, session column and side panels are gone with the modules only they used; ADR 0019 now says the canvas has one link made by the first message or Talk; the design, domain and testing docs and the architecture vault describe the navigator and the agent bar with rendered captures; the browser lane owners were moved onto the new shell and pass.
<!-- SECTION:FINAL_SUMMARY:END -->
