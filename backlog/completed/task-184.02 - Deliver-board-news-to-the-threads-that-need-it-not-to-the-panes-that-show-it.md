---
id: TASK-184.02
title: 'Deliver board news to the threads that need it, not to the panes that show it'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 15:22'
updated_date: '2026-09-12 17:01'
labels: []
dependencies: []
parent_task_id: TASK-184
ordinal: 339000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Facts as they stand. A CLI write captures ARCHBOARD_PANE and puts it on the write envelope (src/runtime/semantic-board-client/index.ts), the announcement carries it as `by` (src/server/canvas/lib/semantic-change-feed.ts), and a delivery port drops any change whose `by` equals its own pane (ownChangeReason in src/runtime/codex-thread-context/lib/refusal-reasons.ts). Separately the context check requires the pane's own context to name the board that changed (boardMatches in lib/context-match.ts), so a change is delivered only when that pane is showing that board.

Two of those are recipient choice wearing the clothes of validation. The third — proving that the context an adapter built is exactly this event, this target and this link — is legitimate and stays.

What the architecture has not got is any association between a thread and a board: ThreadLinkTarget and DeliveryTarget carry thread, child, epoch and operation, and the thread link is keyed by pane. The only thread-to-board relation today is 'the pane this thread is bound to is displaying that board', which is exactly the relation being removed. Deciding what replaces it is part of this task and needs the reader's answer on the recipient contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No write captures or states a pane: ARCHBOARD_PANE and the envelope's pane author are gone, and no announcement carries an author-by-pane.
- [x] #2 No delivery decision anywhere in the fanout — event source, resolver, refusal, delivery, coordinator — depends on which pane a person has open, what it is showing, or whether it is focused.
- [x] #3 An agent's own write is delivered to its own thread rather than suppressed; redundancy is the accepted cost and the thread is told how to read it.
- [x] #4 Context validation that proves a built context is exactly the event, the target and the link is preserved, and the difference between that and recipient choice is written down where the next reader will look.
- [x] #5 Which threads hear about a board is decided by a recorded thread-to-board association or cursor, using what the runtime already has; no new subscription platform, no new dependency.
- [x] #6 A runtime owner over the real fanout proves a change reaching a thread that needs it while no pane shows that board, and proves an own write arriving rather than vanishing.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Report the facts before touching anything: which checks are recipient choice wearing the clothes of validation, and what the runtime has to replace them with. (Done: the pane author, the own-change refusal, and the requirement that the bound pane be showing the changed board.)
2. Take out the pane author entirely — capture, envelope, announcement, feed, context, refusal — since nothing sent it and nothing may.
3. Put back a real author: the agent session, stated per invocation, never read from a shared process's environment.
4. Detach the recipient from the screen: the bound pane is identity, not display, and a board nobody is showing is described by its own current architecture with no selection borrowed from anywhere.
5. Keep every target-authority check exactly as it is: child, epoch, link, cursor, feed.
6. Own the five cases the reader named.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## The rule, as implemented

An active agent session receives every settled board change except the ones it makes itself.

- **Author identity is the writing thread.** A thread that goes on being the same thread is the same session, so a write landing after the turn that made it is still its own; a relink or a new session is a new thread and so a new author. Nothing is minted per turn.
- **The pair is one session.** A delivery port compares against the workhorse it serves *and* the coordinator paired with it (`pairedThreadId` on the controller), so neither is told about the other's writes — to the person talking to them they are one participant.
- **Unattributable is delivered.** An external command line or a person's terminal states no session; its change reaches everybody, the author included. Redundancy rather than silence.
- **A port with nothing to compare hears everything**, its own writes included.
- **No display anywhere in the decision.** A closed pane, or one showing another board, cannot drop news.

## How the identity travels

`--as-session <thread>` beside `--doing` as a global flag, stripped from argv before any command's parser, held per invocation in the client session and stated in the write envelope as `session`. A flag rather than an environment variable, deliberately: one private app-server child serves every thread of a workbench, so anything read from that process's environment would stamp one session's identity onto another's writes — the exact failure that made the pane attribution worse than nothing. Stated, not proven, on the same trust boundary as `--doing`: a session that lies about its identity buys silence for itself and never noise for anybody else.

The workhorse instruction template says so now, and its reviewed digests were updated with it (three pinned copies, all three moved together).

## What was kept, and why it is not the same thing

Every exact-target check stays: the child and epoch capability, the thread link and its CAS evidence, the cursor and feed identity, and the whole `contextMatchesEvent` proof that the context an adapter built is exactly this event and this target. That is target authority — "may this be delivered here at all, and is what is being delivered the truth" — and it is a different question from "who should be told".

What came out of `requireExactSemanticPane` and `contextPane` is the requirement that the bound pane be *showing the changed board*. A settled change now resolves its context from `boundPaneId()` — identity, not presentation — so a closed pane no longer throws and a pane reading something else no longer silences its session.

## What an off-screen change says

`semanticBoardContext(board, null)` now resolves the board's own current architecture and reports **no selection**: the description opens with "Nothing on screen is reading …", and the mismatch ambiguity is still listed when a pane reported a different board. Nothing is borrowed — a selection is a person pointing at something in one architecture and is not a fact about another — and the change is not left contentless either, which is what "the changed board's truth with no presentation selection" asks for.

## The five regressions

`src/runtime/codex-thread-context/tests/session-news.test.ts`, over the real delivery port: its own session's write refused as `own_change`; the paired coordinator's write refused the same way; another session's write and an unattributable one both delivered; a port with no identity hearing everything including its own; and a relinked session treating the previous thread's write as somebody else's news. Plus, at the canvas seam, `codex-workbench-adapters.test.ts` proving the bound pane resolves by id whatever it displays (and only a missing binding or a closed pane refusing), and `semantic-agent-context.test.ts` proving a board nobody is reading is described without a selection being invented.

## Review round: five blockers, and what they turned out to be

The reviewers were right on every count, and my earlier "closed presentation resolves" claim was wrong end to end. What was still pane-filtered:

**1. A closed browser destroyed the recipient.** `onBrowserDisconnect` cleared the thread-context binding, so there was no delivery port left to receive anything — no amount of loosening the board check could have helped. It now forgets only which binding that connection took. What still ends a binding is the session ending (the controller clears on child exit, then retires the epoch) or a relink replacing it. Both are facts about the agent; neither is about a window.

**2. Missing presentation read as stale board truth.** With no pane report, `reportFor(null)` returned `staleReasons: ["pane_has_not_reported"]`, so the brief was stale and the port refused it as `stale_event`. Staleness means "what you are being told may be behind the board", and the board had just been read at the version the change landed at — the only thing missing was what is on somebody's screen. Both presentation-shaped reasons are reported as **ambiguity** now, which is where "what could not be resolved" belongs; version-based staleness is untouched, and no authority check was disabled to get there.

**3. The paired coordinator had no production provider.** `pairedThreadId` existed on the controller option and in the harness only, so the author filter saw the workhorse alone. It is wired from the live graph now (`readyCoordinatorThread`), and — the second half of that finding — it is read **per event** rather than sampled when the port was built: a coordinator is created, restarted and retired inside one workhorse's life.

**4. The coordinator's own consumer had no filter at all.** It subscribes to the publisher independently, and normalization keeps what a voice says out loud while discarding who wrote it — so a write the workhorse was spared was still read out by its own pair. The gate is in `enqueue`, the one place both the subscription and a direct call pass through, before normalization, with a new `own_change` reason and the live pair read at that moment.

**5. A different-thread relink left the session unattributable.** `linkedWorkhorse` required the graph's workhorse snapshot to be the pane's linked thread. A relink from A to an existing B moves the link and leaves the child's owner as A, so the context named A, every event failed to prove its target, and delivery refused as `unknown_provenance` for as long as the relink stood. The context now names the thread the pane's **executable link** names — identity, which relink moves — while the child and epoch stay the graph's and the delivery's own capability check still proves them. This was a pre-existing defect, not one this task introduced.

## What is owned, and what is not

Mine, all runtime and all on real modules:
- `session-news.test.ts` — own session refused, paired coordinator refused, another session and an unattributable write delivered, a port with no identity hearing everything, and the identity being read live so a thread this session no longer is becomes news.
- `offscreen-delivery.test.ts` — the **injection** itself, with nothing on screen: the thread is handed the news, and its own session's write is handed to nobody.
- `own-session.test.ts` (coordinator) — neither half of a session hears the other's write, another session's and an unattributable one are not dropped for whose work they were, and the pair is re-read after a coordinator restart.
- `codex-workbench-adapters.test.ts` — the bound pane resolves by id whatever it displays; only a missing binding or a closed pane refuses.
- `semantic-agent-context.test.ts` — a board nobody is reading is described by what it says, with no selection invented.

Not mine, and I am not claiming it: the full production composition join — host, publisher, delivery and a live workbench generation — is the reviewer's in-flight test. My owner drives the real publisher-to-port subscription and the real canvas context path, but its identities come from the delivery harness rather than from a composed generation, so it proves the join at the port and not at the graph. The coordinator wiring is type-checked against the live getters and covered at the module, not at the composition.

## Gate

`bun run check` → exit 0, zero `(fail)`, 2938 passing (2760 module / 275 files, 155 system / 36, 8 repository, 15 browser / 12 files). Log `/tmp/claude-1001/gate-184c.log`.

## Review round two: presentation lag, and the coordinator's correlation

**Presentation lag was filtering delivery.** `reportFor` marked the reading stale when the pane had drawn an older version — and that is the ordinary case at the only moment that matters: a write commits, announces, and is read here at its new version, all before the browser has drawn again and said so. So every visible external change was refused as `stale_event`. The version difference is a fact about the screen now, said as **ambiguity** ("the pane drew version N and the board is at M, so the picture on screen is behind; what it says was selected is still selected"), and a pane that has drawn a version this process cannot read yet says so the same way. Board-level staleness — missing, unreadable — is untouched, and no authority check was disabled.

Verified with the reviewer's own isolated script: `OFFSCREEN` and `VISIBLE_OLDER_REPORT` both now report `attempted: true, outcome: "delivered"`, where the second was `stale_event` before.

**The coordinator correlated against the thread that started the child.** `workhorseLink` read the workhorse snapshot, which keeps naming the starter; a relink to an existing thread moves the thread-context binding and leaves that snapshot alone. Both halves of the rule failed at once: the relinked thread's own writes were not recognised as its own, and everybody else's failed the link match as `stale_link`. The correlation now takes **both** the thread and the captured link evidence from the thread-context binding, falling back to the snapshot when nothing is bound; the child epoch and the operation stay the snapshot's, because a relink does not move the capability this generation runs under, and `assertCurrent` still proves them.

That reader moved to `lib/codex-workbench-binding-readers.ts` — what the live generation says about itself, asked rather than remembered — which also put `codex-workbench-bindings.ts` back under its line limit.

## Owners added this round

- `src/server/canvas/tests/codex-workbench-correlation.test.ts` — the production reader: with a workhorse started on A and a delivery bound to B, the correlation names B and carries B's link evidence, while the child epoch and operation stay the child's; with nothing bound it falls back to the starter.
- `src/server/canvas/tests/codex-workbench-disconnect.test.ts` — the real `createCanvasThreadLinkActions`: a browser disconnect asks the controller for nothing at all, and disconnecting twice or on a connection that never bound changes nothing either.
- `own-session.test.ts` gained the relink case: with the correlation moved to the relinked thread, its own write is refused as `own_change` and somebody else's is refused for neither `own_change` nor `stale_link`.

## Correction to my earlier note

I wrote that the full production composition join was "the reviewer's in-flight test". That was wrong — no such test existed, and delegating validation to an assumed owner is not evidence. The delivery end-to-end validation is mine. What I have is: the reviewer's isolated script (real `semanticInputFor` → publisher → port) passing on both cases, the production-provider owners above, and module owners over the real delivery and callback code. What I still do not have is a composed-generation join, and I am not claiming one.

## Review round three: one target or the other, never a mixture

Astra's last concrete finding, and the sharpest of them. The correlation took the bound thread but kept the *creation* workhorse's operation, and a thread and the operation that bound it are proved together: asked to prove thread B against the operation that bound thread A, the epoch authority answers `mismatched_thread` and nothing is delivered at all. A relink records its own operation for the thread it bound, so the correlation is now the bound target **whole** — thread, child, epoch and operation — falling back to the workhorse's own target whole when nothing is bound.

The owner was masking it: its `provenance()` stub ignored the request. It now uses an epoch authority that behaves like the real one — it refuses a target whose operation belongs to another thread — with distinct operations for A and B, and it asserts exactly what the authority was asked to prove. Proven red against the mixture: `mismatched_thread: operation operation-a belongs to thread-a, not thread-b`.

## Final gate

`bun run check` → **exit 0**, captured in the same shell as the command. Run with `ARCHBOARD_VAULT` unset and a fresh `XDG_STATE_HOME` (`/tmp/claude-1001/gate-final2-Nmfk`). Zero `(fail)` lines, zero `error: script` lines, **2943 passing**: 2765 module tests across 277 files, 155 system across 36, 8 repository, 15 browser across 12 files. Log: `/tmp/claude-1001/gate-184-final2.log`.

An earlier attempt at this gate exited 1 — Astra's prompt cleanup had landed and the instruction digests had drifted, so every owned canvas died on import. The digests were refreshed and the gate re-run; that first log is superseded and is not the evidence.

## What the evidence is, exactly

Production readers and runtime joins, not a composed-generation test:
- the reviewer's isolated script over the real `semanticInputFor` → publisher → delivery port, both cases now `attempted: true, outcome: "delivered"`;
- production-reader owners for the correlation (with a real epoch authority) and for the disconnect action;
- module owners over the real delivery port and the real coordinator callbacks, including the relink and the live-pair cases;
- canvas owners for pane-independent resolution and for a board nobody is reading.

There is still no test that composes a whole workbench generation and drives it end to end, and nothing here should be read as claiming one.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A running agent session now hears every settled board change except the ones it makes itself, and no part of that decision looks at a screen.

What a pane used to decide, and no longer does: a write stated the pane it was running for and a delivery port dropped changes whose pane matched its own; the context check required the bound pane to be displaying the very board that changed; a browser disconnect cleared the thread-context binding, which is the recipient itself; and a pane that had drawn an older version made the change read as stale. Any one of those silenced a session that was still working.

What replaces it. Authorship is the writing thread — a thread that goes on being the same thread is the same session, so a write landing after its turn is still its own and a relink is a new author — stated per invocation as `--as-session <thread>` beside `--doing`, never read from a shared process's environment. The pair is one session: a port compares against its workhorse and the live coordinator paired with it, read at the moment each change arrives. Unattributable writes, which is everything outside this canvas, are delivered to everybody. A closed pane or a pane reading something else means only that there is no presentation to report, and the context says so — the board's own current architecture, an empty selection, and the lag said out loud as ambiguity rather than as staleness.

Every target-authority check is intact and two were repaired. The child epoch and capability, the thread link and its CAS evidence, the cursor and feed identity, and the proof that a delivered context is exactly this event all stand. A relink to an existing thread used to leave the context naming the thread that started the child, so every event failed provenance; and the coordinator's correlation mixed a bound thread with the operation that bound another, which the epoch authority refuses as a mismatched thread. Both now take one whole target — the bound one, or the workhorse's own.

Verified by production-reader owners for the correlation (against an epoch authority that refuses a mixture) and for the disconnect action, module owners over the real delivery port and the real coordinator callbacks including the relink and live-pair cases, canvas owners for pane-independent resolution and for a board nobody is reading, a runtime join over the real board read, publisher and port, and `bun run check` at exit 0 with 2943 tests passing. No test composes a whole workbench generation; nothing here claims one.
<!-- SECTION:FINAL_SUMMARY:END -->
