---
id: TASK-302
title: Reinvent board navigation and the agent workbench
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 03:20'
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
- [ ] #1 A person can find, open and compare any board in a vault of 200 boards without scrolling past unrelated ones
- [ ] #2 A person can type or talk to the agent from a fresh canvas without linking, choosing or configuring a thread
- [ ] #3 While an agent works, its state, current step, progress and anything it needs from the person read at a glance, and its prompts, commands, files, tools, plans and approvals read in depth
- [ ] #4 Every fact about the agent and the boards appears in exactly one place in the shell
- [ ] #5 docs/design/operator-canvas-shell.md describes the shipped composition with rendered captures in both themes
<!-- AC:END -->
