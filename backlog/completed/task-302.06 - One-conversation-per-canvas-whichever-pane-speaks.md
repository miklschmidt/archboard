---
id: TASK-302.06
title: 'One conversation per canvas, whichever pane speaks'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 03:40'
updated_date: '2026-09-23 04:04'
labels: []
dependencies: []
parent_task_id: TASK-302
priority: high
ordinal: 528000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Thread links are kept per layout pane (A/B) while everything else the workbench runs is singular per canvas generation: one workhorse snapshot, one semantic-delivery binding, one coordinator, one realtime session, one command lease. Two panes can therefore hold two executable links while voice, queue and board news follow only the last one created; a pane without the link cannot speak to the agent, and closing the pane that created the link strands the conversation. The redesigned agent bar is one conversation for the whole canvas that a person reaches from whichever pane they are reading, and each typed turn carries that pane's board. A read-only assessment (2026-09-23) found the smallest correct change is a decorator on the thread-link port that stores the one link under a canvas key and relabels each snapshot with the pane that asked, plus fixes where the host picks a presentation pane or an approval presenter; nothing in src/runtime and nothing on the wire changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every pane of a canvas reads the same thread link; a create or relink from any pane replaces it for all, and a command sent over any pane's transport targets it
- [x] #2 A typed turn sent from a pane carries the board that pane shows
- [x] #3 Concurrent creates from two panes leave one executable link and a usable workhorse
- [x] #4 After the pane that created the link closes, the other pane can send, start and stop voice, and answer approvals
- [x] #5 Host-started work (semantic brief, delegation context) presents through an open pane instead of refusing when the creating pane is gone
- [x] #6 ADR 0019 epoch proof, inspect-only prior epochs, explicit create and the single lease with its link-revision check still hold; owners cover the decorator and the two-pane composition over the fake Codex
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. D1: decorator createCanvasThreadLink over the thread-link port (src/server/canvas/lib/codex-workbench-canvas-link.ts) storing the one link under a constant canvas key and relabelling each snapshot with the asking pane; wire it in codex-workbench-factories threadLink.
2. D2: serialise create/attach/relink in createCanvasThreadLinkActions and refuse a create whose expected link no longer stands before workhorse.start.
3. D3: one presenting-pane rule (preferred if open, else focused, else first in reading order) replaces requireExactSemanticPane for fresh.read and backs a host presentingPaneId used by provenWorkhorseTarget.
4. D4: pane news from any pane once a delivery binding exists.
5. D5: approvals follow the link: cross-pane presenter in gateway-connections (ordinary and dynamic disconnect), ordinary teardown by any pane binding, dynamic bindLease rebinds every pending entry to the lease holder.
6. D6: owner projection compares revision and target, not pane id.
7. D7: realtime stop accepted from any lease holder on the same link and coordinator; start/appendText stay socket-bound.
8. Owners: decorator unit test, D2 adapter case, D3 fallback, cross-pane presenter gateway case, dynamic lease-follow case, two-pane system test over the fake Codex. Gate lanes, commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in 7814e222.
- D1 src/server/canvas/lib/codex-workbench-canvas-link.ts createCanvasThreadLink: one entry under key 'canvas'; read/snapshot relabel paneId and cas.paneId with the asking pane; CAS, clear, classifyAndBind, bindCandidate swap the pane and expectation to the key; classify/discoverCandidates pass through; empty pane id still refused. Wired in codex-workbench-factories threadLink.
- D2 codex-workbench-thread-links createCanvasThreadLinkActions: create, attach and relink run on one promise chain; create refuses (assertBrowserLinkStands) before workhorse.start when the canvas link moved. Deviation: the stand check is on create only; attach/relink are serialised but rely on bindCandidate's CAS, since their only pre-CAS side effect is an ownership record for a thread the person chose.
- D3 codex-workbench-semantic-pane presentingPane(preferred, panesInReadingOrder) replaces requireExactSemanticPane: preferred if open, else focused, else first in reading order, throws only with no pane. canvas-codex-host uses it for fresh.read and exposes host.presentingPaneId; bindings provenWorkhorseTarget(host, snapshot) resolves the pane for operations contextFor and the outcome report. Browser commands still use the exact commanding pane (operationPane).
- D4 canvas-codex-host publishPaneContext publishes from any pane once a delivery binding exists.
- D5 gateway-connections hasOtherPresenter counts any other open connection on the same revision+link (any pane) and now also guards dynamic onBrowserDisconnect; it returns false while the gateway is disposing so shutdown still tears every connection down (kept the existing 'lease transfer and release' owner green). ordinary-approvals teardown matches any pane binding (link !== null). approvals bindLease rebinds every pending entry to the lease holder's pane and command.
- D6 owner-projection compares link revision and target, and the delivery's pane with the binding's pane, not the reading pane.
- D7 realtime-actions: stop accepts any lease holder on the same link and coordinator; start/appendText stay socket-bound.
- authority paneForThread doc now says it is the first open pane in reading order.
Observed (pre-existing, out of scope): pane news is refused as stale_link while the workhorse thread's status differs from the status its link was bound with (coordinator-callbacks liveLinkMatchesCallback compares the whole link JSON including status); the two-pane system test finishes the turn before voice for that reason.

Validation: bun run type-check pass; bun run lint pass; bun run fmt:check pass; bun test --isolate src/server/canvas src/server/codex-workbench 234 pass 0 fail; bun test --isolate --max-concurrency=1 tests/system/canvas-state 24 pass 0 fail; tests/system/process-contracts 34 pass 2 fail (cross-process-lock 'raw lock peer and two canvases' and git-opener-sequence-watchdog), both also failing with every src change of this task reverted, so pre-existing and unrelated. Revert checks: the two-pane system owner fails when gateway-connections, codex-workbench-approvals, the D3 fresh read, or the D4 pane-news guard is reverted; the D2 adapter owner fails without serialisation; the cross-pane presenter gateway owner fails with the old same-pane rule.
Evidence per AC: #1 codex-workbench-canvas-link.test.ts (one link per canvas) + codex-canvas-conversation.test.ts (B reads A's link; B's create replaces it for reopened A). #2 codex-canvas-conversation.test.ts turn/start context paneId B, board payments. #3 codex-workbench-adapters.test.ts 'two panes creating at once leave one workhorse' + canvas-link 'a first binding from one pane refuses another pane's first binding'. #4 codex-canvas-conversation.test.ts after A closes: ordinary + dynamic approvals answered from B, realtimeStart/Stop delivered from B, B's pick reaches live voice; codex-workbench-realtime-actions.test.ts stop from another pane; gateway-recovery.test.ts cross-pane presenter; ordinary-approvals.test.ts disconnect from another pane. #5 codex-workbench-adapters.test.ts presentingPane fallback + system owner voice start after A closed (fresh brief). #6 no src/runtime change (epoch proof, inspect-only, explicit create untouched); canvas-link tests prove CAS conflicts across panes; gateway lease owners (gateway.test.ts link_changed) unchanged and green.

AC#4 'send' after close: codex-canvas-conversation.test.ts now sends a typed turn from B after A closed (one more turn/start, delivered).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The canvas now holds one Codex conversation whichever pane speaks. A thread-link decorator (createCanvasThreadLink) keeps one link under a canvas key and labels each snapshot with the asking pane; create/attach/relink are serialised and a create whose link moved is refused before thread/start; host-started work presents through an open pane (presentingPane); pane news, approvals (cross-pane presenter, lease-following dynamic approvals, link-scoped ordinary teardown), the semantic panel and voice stop follow the canvas link. No src/runtime or browser-wire change. Verified by the decorator unit owner, D2/D3/D7 unit owners, a cross-pane presenter gateway owner and a two-pane composition owner over the fake Codex (tests/system/canvas-state/codex-canvas-conversation.test.ts); type-check, lint, fmt, touched module tests and the canvas-state lane pass; the two process-contract failures are pre-existing. Docs to amend in TASK-302.05.
<!-- SECTION:FINAL_SUMMARY:END -->
