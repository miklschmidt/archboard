---
id: TASK-302.07
title: Voice hears what the person picks while the agent is working
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 04:05'
updated_date: '2026-09-23 04:16'
labels: []
dependencies: []
parent_task_id: TASK-302
priority: medium
type: bug
ordinal: 529000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while making the conversation canvas-wide (TASK-302.06): pane news (ADR 0034) is refused as stale_link whenever the workhorse thread status (for example active) differs from the status its link had when it was bound, because liveLinkMatchesCallback in src/runtime/codex-coordinator-callbacks/lib/delivery-authority.ts compares the whole link snapshot, status included. The status is presentation of the thread, not its identity. With one pane or two, the voice model therefore stops hearing where the person is looking exactly while the agent works — the moment it matters most.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While a workhorse turn runs, a hand-made pick in a pane reaches the live voice session as pane news
- [x] #2 Callback and pane-news authority still refuse a link whose identity changed: another thread, child, epoch or revision
- [x] #3 An owner covers delivery across a thread status change and the refusal across an identity change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define link identity once in codex-thread-link (sameThreadLinkIdentity: state, thread, child, epoch — the fields a CAS token carries) and use it wherever callback authority compared whole link snapshots.
2. delivery-authority.ts: liveLinkMatchesCallback and sameLink compare identity, not status.
3. Owners: runtime test in codex-coordinator-callbacks authority-races (delivered across a status change, refused across thread/child/epoch change); system test codex-canvas-conversation picks during the running turn instead of finishing it first.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: deliver.ts classifyForDelivery re-classifies the target; the fresh link carries the thread's live status (active during a turn) while the captured binding keeps the status it was bound with (idle), and liveLinkMatchesCallback deep-compared the two. The host-vs-captured sameLink compares two snapshots of one binding revision, so status never differed there, but it now compares identity too for one rule.
The canvas decorator (codex-workbench-canvas-link.ts) only relabels paneId per asking pane; the semantic-delivery binding the callbacks read keeps the binding pane's label, so there is no interplay with this fix.
Dropped the authority-races 'direct_input' scenario: it built an executable link with canAcceptDirectInput false via Reflect.set, which the ExecutableThreadLink type forbids (literal true); a thread that stops taking input classifies inspect_only, which the renamed 'inspect_only' scenario still refuses.
The thread-context controller's private sameLinkIdentity was the same predicate; it now uses the shared one.
Not changed (outside this task, same bug class): codex-thread-context delivery-guards finalBindingReason uses link-equality sameLink, which compares status, so settled-change injection into the workhorse (thread/inject_items) is refused link_changed while a turn runs. Reported to the parent.
System test: the turn-finished waits read the pane's link status, which is the bound status and was idle all along; they now wait for the timeline's latest turn to complete.
Validation: bunx tsc --noEmit — 21 errors, all in src/ui (parent's in-progress frontend), none elsewhere; bun run lint — lint:tests passes, lint:policy fails only on 3 src/ui findings; policy lint over touched modules exit 0; oxfmt --check touched files clean; bun test src/runtime/codex-coordinator-callbacks src/runtime/codex-thread-link src/runtime/codex-thread-context src/server/canvas 276 pass; tests/system/canvas-state 24 pass. Both new owners fail against the old deep comparison.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pane news reaches live voice while a workhorse turn runs. Callback authority (delivery-authority.ts liveLinkMatchesCallback, sameLink) compared the fresh link to the bound one including the thread's status, so an active turn made every pick stale_link. It now compares link identity — state, thread, child, epoch — through one predicate, sameThreadLinkIdentity, exported by codex-thread-link and also used by the thread-context controller. Verified by tests/system/canvas-state/codex-canvas-conversation.test.ts (pick during the running turn reaches thread/realtime/appendText) and authority-races.test.ts 'a thread's status is not its identity…' (delivered across status change; stale_link for another thread, child or epoch); both fail against the old comparison. Follow-up for the parent: thread-context delivery-guards has the same status comparison for settled-change injection.
<!-- SECTION:FINAL_SUMMARY:END -->
