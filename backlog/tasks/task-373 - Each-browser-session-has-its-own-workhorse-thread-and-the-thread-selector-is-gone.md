---
id: TASK-373
title: >-
  Each browser session has its own workhorse thread, and the thread selector is
  gone
status: To Do
assignee: []
created_date: '2026-09-29 12:31'
updated_date: '2026-09-29 12:52'
labels:
  - codex
  - voice
  - frontend
dependencies:
  - TASK-374
priority: high
type: feature
ordinal: 658000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user, 2026-09-29: thread linking is silly. A canvas holds one thread link that every pane and every browser shares (ADR 0019 as amended by TASK-302), and the server still discovers every persisted Codex thread as a link candidate and keeps attach, relink and refresh commands, although the browser has rendered no selector since bd5bcdfb (2026-09-23).

Decisions of the user, 2026-09-29:
- Each browser session (tab) has its own Codex workhorse thread, created on the session's first message or voice start. The tab keeps its session in sessionStorage, so a reload keeps the conversation and a new tab or window starts a new one.
- Voice is per tab too: each session has its own coordinator and its own voice session, so two tabs can talk at the same time. A recording page is its own session, so it is no longer refused while voice is live in another tab.
- When no tab has held a session for a short grace period, the session ends: its pending approvals are cancelled, board news to its workhorse stops, and its threads are unsubscribed so Codex unloads them when idle (TASK-374 adds thread/unsubscribe). A reload within the grace keeps everything, pending approvals included.
- "New conversation" stays in the agent menu: it forgets the tab's thread, and the next message starts a new one.

Decisions made in planning (routine): the tab mints a session id rather than storing a thread id, so both panes of a tab share the session before its first message and the server never trusts a thread id from the browser; a duplicated tab shares its conversation, since the browser copies sessionStorage; board changes reach every live session's workhorse; a session holds no link in a new child epoch, so after a server restart the next message creates a new thread and nothing is resumed (ADR 0019).

Found in research: the server looks panes up by the layout ids A and B, which repeat in every tab, so several lookups take the first pane with that id across all tabs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A browser tab's first message or voice start creates a workhorse thread for that tab, and every later message and voice session from the tab runs on it
- [ ] #2 A reload of the tab keeps its thread, and a new tab or window starts a new one
- [ ] #3 Two tabs on one Archboard server hold two separate conversations
- [ ] #4 ADR 0019, CONTEXT.md, the operator shell design and the affected boards describe a workhorse per browser session
- [ ] #5 Two tabs on one Archboard server can each talk by voice at the same time, each on its own coordinator and workhorse
- [ ] #6 A session that no tab has held for the grace period ends: its pending approvals are cancelled, board news to its workhorse stops, and its threads are unsubscribed
- [ ] #7 A reload within the grace keeps the tab's conversation, voice aside, and its pending approvals
- [ ] #8 "New conversation" starts a new workhorse for the tab, and the next message runs on it
- [ ] #9 A recording is not refused because voice is live in another tab
- [ ] #10 No thread selector or candidate list remains, and the attach, relink and refresh commands and the code that served only them are deleted
<!-- AC:END -->
