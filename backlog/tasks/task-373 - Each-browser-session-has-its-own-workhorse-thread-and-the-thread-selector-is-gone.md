---
id: TASK-373
title: >-
  Each browser session has its own workhorse thread, and the thread selector is
  gone
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 12:31'
updated_date: '2026-09-29 13:10'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Boards: Agent workbench@TASK-373, Codex workhorse@TASK-373, Voice coordinator@TASK-373, Browser application@TASK-373, Archboard@TASK-373 (a tab session owns its link, workhorse, delivery, queue, lease, approvals, coordinator and voice; the thread selector, candidates, attach, relink and refresh are gone).

Design (architect, 2026-09-29): a tab mints a tab session id, keeps it in sessionStorage (archboard.tabSession) and sends it on every pane socket (?tabSession=). Per Codex child: identity, epoch, transport, protocol session, the thread-link port keyed by TabSessionId, the approval broker, archboard_app dynamic tools, account and timeline owners, the gateway, and a new sessions store (Map<TabSessionId, tab session>, byThread index). Per tab session: workhorse start, coordinator, realtime adapter, semantic publisher, semantic delivery, queue, operations, spoken approval, coordinator tools, callbacks, realtime actions, lease. Notifications route by thread to the owning session and fan out when the thread is not indexed; server requests route by the calling thread; an unowned request is refused. The coordinator starts with the tab's first message or Talk, not at sign-in; signed in means thread_capable. A session ends only when no socket has held it for TAB_SESSION_GRACE_MS (60 s, shorter than the 90 s approval expiry): voice stops, its approvals are cancelled, delivery and news stop, the link clears, and its threads are unsubscribed once idle (TASK-374). A child restart unbinds every session; nothing is resumed. Layout pane-id lookups become exact client-id or tab-session lookups (fixes the cross-tab bug, walkthrough narration included).

Stages, each committed with the gate green:
S1 delete the thread selector end to end (candidates, attach, relink, refresh, threadCandidates).
S2 tab session identity and exact pane lookups (still one link).
S3 one command lease per tab session.
S4 the coordinator starts with the conversation; drop account_ready and the sign-in ensure and adoptedCoordinator.
S5a the session store with one shared record, no behaviour change.
S5b key everything by tab session: link, publisher, approvals, per-session realtime actions; delete the voice_live recording refusal.
S6 session lifetime: presence, grace, sessions.end, approvals by session, New conversation retires old threads.
S7 docs (ADR 0019 amendment, CONTEXT.md Tab session, AGENTS.md, design docs, CLI help), the removal sweep, board proposals corrected and adopted, the README explainer video re-recorded.
<!-- SECTION:PLAN:END -->
