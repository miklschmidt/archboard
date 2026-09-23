---
id: TASK-302.04
title: 'Talk to the agent from anywhere, and watch it work'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 03:21'
updated_date: '2026-09-23 05:43'
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
- [x] #1 From a fresh signed-in canvas one Enter in the composer or one press of Talk reaches the agent; signed out, the same gesture starts sign-in and the prompt waits visibly until it is delivered
- [x] #2 The agent bar always shows the agent state with elapsed time, current step, plan progress, queued count and the one action the state needs; nothing in it repeats another region
- [x] #3 The conversation shows the person's prompts, the agent's answers, running and finished work with durations and expandable evidence, the plan, failures with Codex's message, and approvals decided in place
- [x] #4 Voice starts, mutes and ends from one place; when it cannot start it says why and offers the fix instead of hiding
- [x] #5 Opening the conversation panel narrows the panes and the camera refits; agent events never open it; collapsed geometry is unchanged (ADR 0028)
- [x] #6 Session plumbing (lease, operation and delivery tokens, thread ids, link candidates, coordinator settings) is gone from persistent chrome and available in one details surface
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Zero-configuration setup (src/ui/agent-setup): a canvas-wide state machine over the transport that signs in (ChatGPT tab from the gesture), waits for Codex, creates the workhorse once and delivers held messages in order, or starts voice; ports resolved through an agent focus that follows the focused pane.
2. Timeline evidence on the wire (TASK-302.02) projected into turns (src/ui/workbench-timeline) and adapted into assistant-ui messages with named data parts (src/ui/workbench-runtime).
3. Conversation rendering (src/ui/workbench-thread): prompts, plan progress, activity runs with evidence, markdown answers, approval marks, turn ends; voice lines and pending work at the foot.
4. Agent bar (status line with one action, Talk, composer, panel toggle) and conversation panel (menu, session details, sign-in card, empty state), over one AgentView and one AgentActions (src/ui/workbench, src/ui/application).
5. Remove the dock, Agent settings, session column, side panels and their modules; geometry: the bar keeps DOCK_BAR_HEIGHT, the panel is AGENT_PANEL_WIDTH beside the panes.
6. Verify with unit tests, a scripted fake Codex demo in the browser (running, finished, failed step, approval, signed-out sign-in and delivery, dark theme), and the browser lane owners codex-text-workbench and codex-live-voice.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped: zero-config setup (src/ui/agent-setup; ports in src/ui/application/agent-setup-ports.ts), one canvas conversation (TASK-302.06), agent bar (status line, Talk, composer, panel toggle) and conversation panel (prompts, plan, activity rows with evidence, markdown answers, approvals, voice lines, held/queued work, session details). Review loop findings fixed: approvals identified by approvalId (two approvals on one call blanked the conversation), projection failures shown, live row only while its step runs, newest running turn, progress clock signs every work item, answer links open in a new tab and images are links, bar 40px + rule, panel independent of the socket, Talk Speaking from measured output, End while connecting, visible voice problem, status priority (Not sent / Could not start / Sending; Needs you keeps the turn's facts), unsettled approvals and the spoken approval line, sign-in stated once (bar; card is the API-key alternative), and the setup state machine (sign-in failures/cancel/timeout, coordinator failure, backoff waits, ordered delivery, unknown-outcome reconciliation, voice pin release, narration's gesture tab).

Verification: src/ui/agent-setup/tests/agent-setup.test.ts and src/ui/application/tests/agent-setup-ports.test.ts (signed-out send through sign-in, create once, ordered delivery, failures and retries, voice pin), src/ui/workbench/tests/agent-status.test.ts (status priority), src/ui/workbench-runtime/tests/messages.test.ts and src/ui/workbench-thread/tests/activity-run.test.tsx (runs, live row, plan placement, folding, failures opening), src/ui/workbench-timeline/tests/timeline.test.ts (order, repeated approvals); browser owners codex-text-workbench (Enter while signed out holds the message, sign-in completes, one thread start and one turn carry it, approvals decided in place), codex-live-voice (one Talk press reaches live voice, voice lines, presentation Talk, End releases media), shell-layout (bar 40px + rule, panel narrows the stage by AGENT_PANEL_WIDTH and restores it); the geometry reviewer measured the camera refit on open/close and that a zoomed camera is kept. AC #6 reading: session details carry the account, models, context used, thread id, command lease, last command and what voice was told; the link candidates are gone with the manual link itself (ADR 0019 as amended).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Talking to the agent needs no setup: the first message or Talk signs in, starts Codex, creates the canvas's conversation and delivers, with held work shown in place. One agent bar under the panes says what the agent is doing, for how long, how far through its plan, what is queued and whether it went quiet, with the one action the state needs, Talk beside it and the composer under where the conversation opens; the conversation panel shows prompts, plans, work rows that open to their evidence, markdown answers, failures with Codex's words, approvals decided in place and what was said aloud, and opens only on the person's gesture. Verified by unit owners for the setup, status, message parts and activity rows, the text-workbench, live-voice and shell-layout browser owners, and a scripted fake-Codex demo in both themes.
<!-- SECTION:FINAL_SUMMARY:END -->
