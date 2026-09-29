---
id: TASK-373
title: >-
  Each browser session has its own workhorse thread, and the thread selector is
  gone
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 12:31'
updated_date: '2026-09-29 15:56'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
S1 (a5d7d19d): thread selector deleted end to end — threadLinkRefresh/Attach/Relink, snapshot threadCandidates and BrowserThreadCandidate(s), BROWSER_THREAD_CANDIDATE_LIMIT, runtime discoverCandidates/bindCandidate/candidate-discovery.ts, server candidate inventory and attach/adopt, UI candidates.ts/recovery.ts and controller bind/bindSelection/unlink/refreshInventory/recover. Beyond the spec: the UI controller's recovery field (snapshot.recovery, captureServerRecovery, serverRecoveryIntents) went with recovery.ts because nothing read it; the thread-link transport port lost state/refresh/accountRead; the gateway options lost checkoutRoot (only attach used it); the production fake no longer seeds a foreign persisted thread. Gate green.

S2: tab session identity and exact pane lookups (one link still). The tab mints archboard.tabSession in sessionStorage (src/ui/pane-session/lib/tab-session.ts) and every pane socket sends ?tabSession=; the server parses it (TabSessionId, parseTabSessionId in @/server/codex-workbench), refuses Codex requests without one, and passes it to gateway.connect; connections, projection, lease binding and presenter contexts carry tabSessionId. Browser commands read context from the exact sending pane (clientId); server-started work presents through presentingPane (clientId null); contextPane and walkthrough narration are keyed by clientId. Beyond the spec: the tab-session map lives in its own src/server/archboard/lib/tab-sessions.ts (pane-registry.ts would pass its 600-line limit), panesOfTabSession is not added yet (nothing uses it before S5b), the server port presentingPaneId is gone (contextForOperation takes clientId: string | null instead), and bindVoicePane/voicePanes are deleted.

S3: one command lease per tab session. The ledger is { sessions: Map<TabSessionId, { active, retired }> } (BrowserSessionLeaseLedger per session, sessionLeaseLedger in lease.ts); gateway-leases.ts createSessionLeases keeps one LeaseOwner per tab session (of(id), isActive(commandId), all()), made at once for sessions the retained ledger holds; admission, execution and the gateway pick the connection's own session's owner, so a claim releases only a holder in the same tab session and the link-revision check is unchanged. The lease tests moved to src/server/codex-workbench/tests/gateway-leases.test.ts (gateway.test.ts passed 500 lines): 'a claim releases only its own tab session's lease', expiry and renewal with another tab's lease beside them. Leftover for S6: session lease owners and ledger entries are never forgotten (gateway.endSession).

S4: the coordinator starts with the conversation (one link still). threadLinkCreate runs coordinator, workhorse, delivery bind: coordinator.ensure when the pane's link names no thread (keeps a ready coordinator no conversation carried), coordinator.replace when it names one (New conversation retires the old coordinator via TASK-374); a coordinator that is not ready refuses the create with its reason and starts no workhorse. Sign-in no longer ensures a coordinator (hooks initializeSession and the account refresh); signed in is thread_capable; browser readiness account_ready removed end to end (shared schema, gateway ACCOUNT_READINESS, ui capabilities, queue state, agent-setup phase arm); adoptedCoordinator deleted (owner-state, owner-transitions, bindings). Beyond the spec: ui settlement announces the failed coordinator's reason for a create refused with command_failed (the removed phase arm used to show it); archboard-dev SKILL smoke step now sends one message before looking for the coordinator's thread/start. Tests: adapters 'a create whose coordinator cannot start is refused with its reason and starts no workhorse', 'a new conversation replaces the coordinator that carried the old one before its workhorse starts'; production-initialization 'a signed-in session is ready without starting a coordinator'; account-login 'a matching completion refreshes the account to thread-capable and starts no coordinator'; controller 'a create refused because its coordinator could not start publishes the coordinator's reason'; production system test asserts no thread/start before the create and the coordinator's first; live-voice browser test expects Talk to start coordinator then workhorse.

S5a: session store with one shared record, no behaviour change. codex-workbench-sessions.ts (CodexWorkbenchSessionComponents, CodexWorkbenchTabSession { id, components, actions: { threadLinks, realtime }, state: { queue, queueThreadId, currentCoordinatorCall, threads } }, createCodexWorkbenchSessions: open/require/list/forThread/claimThread/onNotification/routeCoordinatorTool/routeCallback/childExit/stop/dispose/onChange; SHARED_TAB_SESSION_ID 'server' opened by the generation's sessions factory). codex-workbench-session-factories.ts builds one session's owners and actions over the shared generation components; codex-workbench-session-bindings.ts holds the per-session bindings (ProductionCodexWorkbenchBindings.tabSession(id, shared, state), named tabSession because session is the protocol session's binding). Generation components: identity, epoch, transport, session, threadLink, approvals, dynamicTools, sessions, gateway. Notifications route by params.threadId (claimed: owner only; else every session); coordinator tool and tell_coordinator requests route by the calling thread, an unowned one gets its owner's refusal. create claims the coordinator and workhorse threads, the voice start's fresh coordinator is claimed. Departures: shutdown keeps today's order as two store phases (sessions.stop then generation settlement then sessions.dispose) instead of one dispose(cause); the threadContext generation hook and hooks/server stopRealtime/stopQueue are deleted (the delivery binding already carries the same hooks; the store stops voice and queue); account read's action input carries tabSessionId. Tests: new codex-workbench-sessions.test.ts (notification routing, proven to fail with fan-out only; request routing and refusal); generation fixture split (session-fixture.ts), generation test asserts the whole shutdown order. Gate green.

S5b: every conversation is keyed by its tab session. The sessions store opens a record per tab (socket owner openTabSession in connectionFor; installBrowserGateway takes {gateway, sessions}); SHARED_TAB_SESSION_ID and codex-workbench-server-link.ts are deleted and the thread-link port is keyed by TabSessionId. Per-session semantic publisher (server port semanticPublisherFor/narrationChangesFor; panesOfTabSession and a remembered presenting pane in codex-wiring), contextForEvent files under event.pane.paneId, contextForOperation takes the tab session. Approvals link tab:<id> of the session holding the thread, projected and answered per session; a terminal retires once its own session's connections showed it; an approval on a thread no session holds is cancelled on receipt. Dynamic approvals carry their session; authority resolves the caller through sessions.forThread. Voice: the voice_live recording refusal is deleted end to end, the voice start trace hands out per-attempt notes. Departures: runtime codex-thread-context and codex-dynamic-tools no longer compare the context's pane with the link key (it is a tab session now); the runtime coordinator weighs only its own starts when nothing is retained, so a second tab's coordinator can start in the same epoch. workhorseLink/correlatedTarget and the correlation test are deleted. Tests: conversation system test rewritten for tab sessions (approvals only in their tab, reload, New conversation), recording-start runs a recording and another tab's voice at once, pane-context ignores another tab's pick, gateway per-session terminal retirement, approval-sessions test, coordinator reuse test. Gate green.

S6: session lifetime. TAB_SESSION_GRACE_MS (60 s) in timing.ts. Presence is the clientId -> tab map in tab-sessions.ts plus a grace timer per tab with no pane left (noted at admitSocket, forgotten with the pane's owning socket, so a reload's forget-then-note keeps the session); endTabSessionsOnceGone subscribes per generation from installLifecycleSignals and runs gateway.endSession (lease owner and ledger entry dropped) then sessions.end. sessions.end (codex-workbench-session-end.ts): live -> ending at once (a returning tab gets a fresh record; forThread answers live sessions only, so an ending session's new approvals are cancelled on receipt), clear the link, settle approvals (ordinary cancelTabSessionApprovals 'browser tab session ended', dynamic endSession as disconnected/browser_disconnected), stop voice, dispose spoken approval, delivery, callbacks, publisher, shut the queue, unsubscribe every claimed thread once idle, then dispose realtime and coordinator tools and drop the threads. TASK-374's retire.ts moved to runtime codex-thread-unload (createCodexThreadUnload), used by the coordinator and by the store. New conversation retires the old workhorse thread (scope.retireThread) and releases the replaced coordinator's thread once the coordinator unloaded it (releaseThread from onRetired, also for voice's fresh coordinator). A disconnect no longer settles approvals: hasOtherPresenter, presenter contexts, the ordinary/dynamic/thread-link onBrowserDisconnect hooks and controllerTokens are deleted. Departures: presence lives in tab-sessions.ts keyed by client id rather than a socket-keyed tab-session-presence.ts; the link is cleared first rather than at step 5; no new session_ended cause. Tests: tab-session-presence, codex-workbench-session-end, ordinary 'the tab session's end settles its approvals; a disconnect does not', dynamic endSession, gateway lease end, gateway 'rejects a dynamic decision after the tab session ends', gateway-recovery reconnect keeps approvals, adapters New conversation gives up old threads; codex-workbench-disconnect.test.ts deleted.
<!-- SECTION:NOTES:END -->
