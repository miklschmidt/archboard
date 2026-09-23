---
id: TASK-302.04
title: 'Talk to the agent from anywhere, and watch it work'
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 03:21'
labels: []
dependencies:
  - TASK-302.02
parent_task_id: TASK-302
priority: high
ordinal: 526000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The workbench is a 320px bottom dock of three columns (session plumbing, a 200px-tall thread, tabbed side panels) that repeats claim, doing, voice and approval state, hides the person's own prompts, shows every tool as finished, and cannot be used until someone links a thread by hand. The redesign is a bottom agent bar (the agent state with its one action, Talk, the composer, the panel toggle) and a right conversation panel (prompts, agent prose, work rows with evidence, the live plan, approvals and queued prompts in the log). Setup is implicit: the first send or Talk signs in when needed and creates the workhorse (an explicit create, ADR 0019), and the conversation follows the pane that holds it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 From a fresh signed-in canvas one Enter in the composer or one press of Talk reaches the agent; signed out, the same gesture starts sign-in and the prompt waits visibly until it is delivered
- [ ] #2 The agent bar always shows the agent state with elapsed time, current step, plan progress, queued count and the one action the state needs; nothing in it repeats another region
- [ ] #3 The conversation shows the person's prompts, the agent's answers, running and finished work with durations and expandable evidence, the plan, failures with Codex's message, and approvals decided in place
- [ ] #4 Voice starts, mutes and ends from one place; when it cannot start it says why and offers the fix instead of hiding
- [ ] #5 Opening the conversation panel narrows the panes and the camera refits; agent events never open it; collapsed geometry is unchanged (ADR 0028)
- [ ] #6 Session plumbing (lease, operation and delivery tokens, thread ids, link candidates, coordinator settings) is gone from persistent chrome and available in one details surface
<!-- AC:END -->
