---
id: TASK-143.04.10
title: Keep live voice Stop reachable in fullscreen
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:42'
updated_date: '2026-09-04 15:36'
labels: []
dependencies:
  - TASK-143.03.11
  - TASK-143.04.06
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/canvas/CanvasPane.tsx
  - src/ui/canvas/tests/workbench-transport-publication.test.tsx
  - src/ui/shell/Shell.tsx
  - src/ui/shell/shell.css
  - src/ui/shell/tests/codex-voice-presentation.test.tsx
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 237000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete the single production voice composition seam. CanvasPane constructs at most one VoiceSession for its current workbench transport from the pane’s existing media owner, publishes the exact caller-owned voice registration and evidence to Shell, and Shell supplies that source to the accepted WorkbenchFrame while extending the existing PresentationDock with immutable active-voice disclosure and Stop. Shell never owns media, realtime, or session lifecycle and no second dock, fullscreen owner, or global store is introduced. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CanvasPane creates at most one VoiceSession for its current transport from useCanvasSession’s existing media owner, publishes one exact pane/transport/session registration with caller-owned context and transcript evidence, retains it through a transient disconnect, and clears/disposes it deterministically before replacement or unmount.
- [x] #2 Shell supplies that registration to the accepted WorkbenchFrame without constructing or disposing media, realtime, or session state; the bound voice source stays immutable across pane focus, workbench navigation, one/two panes, and fullscreen transfer, and authoritative stopped/withdrawn state restores the text-only frame.
- [x] #3 The same PresentationDock identifies active voice pane, workhorse, coordinator, realtime session, mute and phase beside the existing text source. Its one labelled Stop routes to the immutable active VoiceSession, falls back to text only when no active voice identity exists, and keeps stale/stopping/failed/outcome-unknown identity visible until authoritative reconciliation.
- [ ] #4 Shell CSS preserves the accepted dock hierarchy, 44px touch target, keyboard focus, high contrast, reduced motion, and no overlay collision at desktop and Flip sizes.
- [x] #5 The focused CanvasPane and shell owners prove single ownership/publication, text-only, voice-only, simultaneous text/voice, exact context/transcript source, focus/fullscreen invariance, fail-closed duplicate-active state, replacement, stopped/unmount/reload cleanup, and exact Stop routing. Rendered browser behavior remains TASK-143.04.07.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the narrow CanvasPane voice registration beside CanvasPaneProps. Build one VoiceSession per current workbench transport from the pane’s existing realtime owner, retain it through transient disconnect, publish null before replacement or unmount, and dispose only the adapter subscriptions. Keep one VoiceContextHistory per mount and expose guarded read-only transcript records from the exact snapshot/session correlation.
2. Refactor the Shell pane registry so text ownership and voice registration can appear and retire independently. Supply the exact captured voice source, context, and transcript slot to the accepted WorkbenchFrame without creating or disposing media, realtime, session, history, or transcript state in Shell.
3. Extend the existing PresentationDock with immutable active-voice disclosure beside the text source. Keep one Stop button: route it to the sole active VoiceSession when stoppable, disable it on an active but unstoppable or duplicate-active source, and fall back to text interrupt only when no active voice identity exists.
4. Extend the focused production CanvasPane owner and add the focused Shell voice owner for the reachable lifecycle, source, conflict, and routing regressions. Keep rendered browser coverage in TASK-143.04.07.
5. Run only the focused CanvasPane, Shell, and WorkbenchFrame owners, both TypeScript projects, scoped Oxlint and Oxfmt, the frontend build, and diff and tracked-state checks. Keep TASK-143.04.10 In Progress with all acceptance criteria unchecked for independent review.

6. Make the Shell registry ref the single full-record authority and use one revision only to invalidate React consumers and resubscribe exact text, voice, and transport publications.

7. Extend the CanvasPane registration with caller-owned retained presentation identity that captures the last exact session and mute evidence, survives media detach with a stale binding, and clears only on authoritative stop, withdrawal, or replacement.

8. Project retained identity into the dock without text fallback, disclose unknown mute truth honestly, and add one fullscreen-only live status from VoiceSessionView.accessibleStatus with assertive failure announcements.

9. Add production-shaped focused regressions for detach, stopping, outcome unknown, announcement priority, and single registry ownership, then rerun only the authorized focused checks.

10. Make CanvasPane voice presentation an explicit active-or-none contract. Reapply a cached session id only when the current view still carries the same binding; clear identity when close removes binding or replacement marks the session stale.

11. Teach Shell to consume the explicit presentation result without rebuilding identity, and add focused close, replaced, and terminal non-stoppable outcome-unknown regressions that prove no dock/frame resurrection or text Stop fallback.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation paused before UI edits. Shell receives only each pane BrowserWorkbenchTransport through CanvasPane.onWorkbenchTransport. CanvasSession owns the existing BrowserWorkbenchMediaOwner, but CanvasPane does not publish it or a captured VoiceSession, and production has no createVoiceSession or captureWorkbenchFrameVoiceSource caller. Constructing a new media/session owner in Shell or dispatching realtimeStop directly through the transport would create the duplicate owner or Stop path this task forbids.

Mandatory UI-worker audit independently confirmed the same gap and edited no files. The smallest required contract change is a pane-level immutable voice registration with lifecycle/null cleanup that retains one VoiceSession built from the pane existing realtime owner and current transport. Shell can then capture that exact source, subscribe to its view, pass it to WorkbenchFrame, disclose it in PresentationDock, and call source.session.stop(). If the frame must also render live voice, the registration needs the already caller-owned context and transcript slot, whose production construction is likewise absent.

No code or CSS changed and no tests ran because the task requires a parent callback before expanding beyond Shell.tsx, shell.css, the focused test, and this Backlog record. TASK-143.04.10 remains In Progress with all acceptance criteria unchecked.

Parent expanded the authorized seam to CanvasPane after the recorded blocker. CanvasPane now creates one VoiceSession from the existing pane media owner and exact current workbench transport, publishes one frozen registration with mount-owned context history and guarded transcript evidence, retains it through transient transport loss, and retires it in voice-null / adapter-dispose / text-null order before replacement or unmount. Evidence ingestion deduplicates unchanged voice context, session view, and connection state.

Shell now keeps nullable text and voice ownership per pane, captures the exact frame voice source once, supplies ready voice so the existing Start control is reachable, holds a sole active source across focus and fullscreen transfer, fails closed on duplicate-active registrations, and removes stopped or withdrawn voice from the frame. The existing PresentationDock discloses voice identity beside text and its single Stop prefers the active VoiceSession, disables during conflict or an unstoppable active state, and falls back to text only when no active voice identity exists.

Scoped verification passed: `bun run type-check`; 27 focused CanvasPane, Shell, and WorkbenchFrame tests with 358 assertions; scoped Oxlint and Oxfmt; `bun run build`; and `git diff --check`. Browser behavior remains owned by TASK-143.04.07. TASK-143.04.10 remains In Progress and all acceptance criteria remain unchecked for independent review.

Independent-review remediation complete. Shell now keeps the pane registry only in its ref; one revision invalidates React readers, and subscription ownership follows registry object identity instead of mirroring records in state or resubscribing on every publication.

CanvasPane now exposes a caller-owned presentation projection that retains the last exact binding and realtime session id across a null media snapshot. Shell treats that retained identity as the active owner even when the current VoiceSession is unavailable, keeps Stop disabled when the adapter cannot stop, and never retargets the button to text. Authoritative stopped, replaced, registration withdrawal, or transport replacement retires the identity. Mute reads Muted or Unmuted only from current same-session media evidence; stopping, failure, or missing media reports Unknown.

The existing fullscreen dock now carries VoiceSessionView.accessibleStatus through one visually hidden live output. Normal and duplicate-source messages are polite; a view with failure evidence is the only assertive alert. The visible conflict label no longer creates a second voice announcement owner. The required UI worker re-read the visual authority, made the rendered UI changes, and reported no CSS change was needed.

Remediation verification passed: `bun run type-check`; 27 focused CanvasPane, Shell, and WorkbenchFrame tests with 378 assertions; scoped Oxlint and Oxfmt; `bun run build`; and `git diff --check`. Real-browser rendering remains assigned to TASK-143.04.07. TASK-143.04.10 remains In Progress with every acceptance criterion unchecked for rereview.

Second lifecycle rereview remediation complete. CanvasPane voice presentation is now a discriminated active-or-none contract. It caches the last exact binding/session pair but reapplies only the session id, and only while the current view still carries the same field-wise binding. A missing binding clears the cache, so VoiceSession.close cannot resurrect active dock identity. Stopped and replaced projections return an explicit retired result even when the raw replaced view still exposes stale binding/session bytes.

Shell consumes the discriminant directly. Ready or unbound unavailable registrations can still reach WorkbenchFrame, while retired replacement removes both dock and frame voice. Production-shaped terminal stop-unconfirmed evidence remains active and visible with Unknown mute truth, but Stop stays disabled and cannot fall through to the text interrupt. Focused owners cover real CanvasPane presentation close behavior, raw replaced identity retirement, and non-stoppable outcome-unknown routing.

The required UI worker re-read the visual authority and changed only the four authorized TypeScript source/test files; no CSS change was required. Validation passed: root and frontend type checks; 49 focused CanvasPane, Shell, WorkbenchFrame, and VoiceSession lifecycle/projection tests with 1,367 assertions; scoped Oxlint and Oxfmt; frontend build; and diff checks. Real-browser behavior remains TASK-143.04.07. TASK-143.04.10 remains In Progress with all acceptance criteria unchecked.

Canonical integration validation passed at the review-clean range: 49 focused CanvasPane, Shell, WorkbenchFrame, and VoiceSession lifecycle/projection tests with 1,367 assertions; root and frontend TypeScript; scoped Oxlint and Oxfmt; frontend build; git diff --check; and patch-equivalent range-diff. Criteria 1, 2, 3, and 5 are supported by those module and DOM owners. Criterion 4 remains unchecked because no authorized module/static check can prove the rendered no-overlay-collision claim at desktop and Samsung Flip sizes. TASK-143.04.07 remains the owner of real rendered fullscreen, keyboard, forced-colors, and Flip browser verification; none of those browser checks ran here. The task therefore remains In Progress and has no final summary.
<!-- SECTION:NOTES:END -->
