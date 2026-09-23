---
id: TASK-302
title: Reinvent board navigation and the agent workbench
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 03:20'
updated_date: '2026-09-23 05:43'
labels: []
dependencies: []
priority: high
type: enhancement
ordinal: 522000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user, 2026-09-23: navigation has no organization and quickly becomes impossible to navigate; the agent workbench shows redundant information and rarely the monitorability wanted, the main agent interaction is meh, and manually linking threads before voice can start is cumbersome. They asked for a reinvention with no obligation to keep past UI decisions, with extra attention to visual and interaction design. A four-designer panel scored by three judges settled the design (operator console base with conversation-first grafts): a navigator with one row per board organised by folders, drill hierarchy and name, a filter, the variant states of the board being read and a live 'working now' block; a bottom agent bar holding the agent's state, Talk and the composer; a right conversation panel with prompts, activity evidence, plans and approvals in the log; zero-configuration start (the first send or Talk signs in and creates the workhorse). Mapping reports and the design panel output live in the session scratchpad; the durable result is docs/design/operator-canvas-shell.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A person can find, open and compare any board in a vault of 200 boards without scrolling past unrelated ones
- [x] #2 A person can type or talk to the agent from a fresh canvas without linking, choosing or configuring a thread
- [x] #3 While an agent works, its state, current step, progress and anything it needs from the person read at a glance, and its prompts, commands, files, tools, plans and approvals read in depth
- [x] #4 Every fact about the agent and the boards appears in exactly one place in the shell
- [x] #5 docs/design/operator-canvas-shell.md describes the shipped composition with rendered captures in both themes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Subtasks 302.01–302.07 done. Review loop on 2026-09-23: five scope reviewers (navigator, agent setup and wiring, conversation runtime, agent surfaces, server) and four boundary reviewers (timeline wire, setup-to-link, listing-to-outline, panel geometry); every must-fix finding and most optional ones were fixed (commits 0d0f366d, b08c6b7c, ddef2525, the setup branch d5b1c780/b6224de6, the server branch fa8e4742…15a6aa17), each with an owner test. Left as follow-ups for the user to decide (not created): the voice-controls module's components and the voice session's wave/controls views have no consumer; tool arguments are redacted by secret key names but command output is carried as the operator's terminal shows it (documented trust boundary); a turn longer than 256 items can lose its opening prompt from the window; the agent context names the pane's address rather than a drilled-into board; ADR 0028's prose still says the reference pane is about 1272×952 (it is 1272×899, pre-existing).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Navigation and the agent workbench were rebuilt. The navigator organises any vault into folders and drill hierarchy with one row per board, finds any board or state by a filter, and gathers live agent work in one block. The agent needs no setup — the first message or Talk signs in, starts Codex, creates the canvas's one conversation and delivers — and lives in one agent bar (state, step, time, plan progress, queue, the one action, Talk, composer) with a conversation panel that shows prompts, plans, work with its evidence, answers, failures, approvals and what was said aloud. Verified by unit owners, the full browser lane (shell-layout, workspace-address, codex-text-workbench, codex-live-voice and the rest), system and repository lanes, a scripted fake-Codex demo in both themes, and a nine-reviewer review loop whose findings were fixed.
<!-- SECTION:FINAL_SUMMARY:END -->
