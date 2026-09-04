---
id: TASK-143.03.05
title: Control workhorse turns from the composer
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 11:04'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.03
  - TASK-144.20
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-composer
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own text composer submit/steer/interrupt behavior against the authoritative workhorse runtime. This leaf alone may directly import the reviewed assistant-ui composer primitives; it copies no Elements. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module's only assistant-ui import is named root ComposerPrimitive; submit, steer, interrupt, draft, pending, and focus behavior remain Archboard-owned and target the captured current thread link/turn.
- [ ] #2 Idle submit uses the literal turn/start body, active steer uses the literal turn/steer body with host-proven expectedTurnId, and interrupt targets the captured active turn; link/state changes before dispatch refuse.
- [ ] #3 Composer disables during pending command lease, preserves or clears draft by documented delivered/not_delivered/outcome_unknown outcome, and never creates an optimistic assistant record.
- [ ] #4 Keyboard, multiline, IME, screen-reader label, focus restoration, stale link, disconnect, late result, duplicate activation, and active-turn races are covered by module tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Module shape. Build src/ui/workbench-composer as one UI module: composer.ts (the sole assistant-ui import site — a frozen private bridge exporting only ComposerPrimitive, mirroring src/ui/workbench-timeline/timeline.ts), contract.ts (public types), index.ts (public entrypoint), lib/ (private implementation), tests/ (owners + fixtures). No repository-policy allowlist edit is required: tools/oxlint-plugin-archboard.js keys ASSISTANT_UI_OWNERS on the directory "src/ui/workbench-composer" (assistantUiOwner matches relativePath === owner || startsWith(owner + "/")), so any file inside the module may import ComposerPrimitive. Nested members Queue, Dictate, StopDictation and DictationTranscript are rejected by that rule and are never touched. No package.json, src/ui/shell, or test-inventory edit (TASK-143.03 AC #3 serializes those; test:modules discovers module owners under src/ automatically).

2. Authoritative turn read (lib/active-turn.ts, pure). The composer's turn state comes only from transport.state().snapshot: threadLink must be state "executable" and timeline.turns filtered to status === "inProgress". Exactly one in-progress turn is the active turn; zero is idle; two or more is refused as ambiguous, because src/server/canvas/lib/codex-workbench-text-actions.ts steer refuses unless the host's own thread read finds exactly one in-progress turn whose id equals the command's turnId. The module never invents, caches past, or optimistically advances a turn id.

3. Literal command bodies (lib/intent.ts, pure) — AC #2. Idle submit produces exactly the closed-model start draft {command: "start", threadId, prompt}. Active submit produces exactly the steer draft {command: "steer", threadId, turnId, prompt}, where turnId is the authoritative in-progress turn id that the host re-proves as expectedTurnId. Interrupt produces {command: "interrupt", threadId, turnId} against the turn captured when the interrupt control was offered, never a re-read. threadId always comes from the captured link, never from a separate field. Drafts are typed as BrowserCommandDraft with no "as" cast.

4. Non-retargetable dispatch (lib/dispatch.ts) — AC #2. Every gesture calls transport.captureCommandTarget() at activation and then transport.command(draft, target), so the transport refuses rather than retargets when the pane navigated between composition and dispatch. Before capture the module also refuses locally, with its own reason, when the link is no longer executable, when the captured threadId differs from the snapshot link's threadId, or when the captured active turn is gone or has been replaced (the active-turn race). Transport refusals are read through BrowserWorkbenchTransportError: .outcome supplies delivered/not_delivered/outcome_unknown and .code supplies the visible reason for link_changed, link_required, lease_required, lease_expired, not_ready, response_lost and replaced.

5. Pending lease, draft policy, no optimistic record (lib/draft.ts, lib/pending.ts) — AC #3. One command may be in flight at a time; while pending, the composer input, Send and Interrupt are disabled (aria-disabled plus aria-busy on the form) and a second activation is refused without a second transport.command call. Documented draft policy: delivered clears the draft; not_delivered preserves it in the live composer (the submit path throws MessageNotSentError so the runtime's ExecutableProvider restores the text, and workbench-runtime already publishes the "The draft was restored" recovery line); outcome_unknown neither clears silently nor auto-restores — the text is retained as an inert Archboard-owned recovery copy behind an explicit restore control, because auto-restoring a submission whose delivery is unknown invites a duplicate turn while dropping it loses the person's words. The module adds nothing to the runtime's messages: the authoritative snapshot timeline is the only source of an assistant record.

6. Rendered surface (lib/WorkbenchComposer.tsx) — AC #1, aesthetics. Archboard owns every rendered element; ComposerPrimitive supplies only headless Root/Input/Send mechanics. Styling uses the semantic theme through @/ui/ui-classnames cn and @/ui/button, static complete utility strings, no arbitrary values, one-pixel rules, no chat bubbles or cards. Accessibility: an explicit textarea aria-label that names the current action (message the workhorse vs steer the current turn), a role="status" live region for pending and outcome, visible focus in both themes, and the semantic 44px touch target on Send and Interrupt.

7. Keyboard, multiline and IME (lib/keys.ts, pure decision function). Enter submits, Shift+Enter inserts a newline, and Enter never submits while an IME composition is open: the decision reads both the event's isComposing flag and module composition state set by compositionstart and cleared by compositionend, so a composition-confirming Enter is a text event rather than a send.

8. Focus (lib/focus.ts). A settled submit or interrupt returns focus to the composer input, keyed by a stable signature of the settled command so a late result cannot steal focus from a control the person has since moved to — the same shape as src/ui/workbench-approvals/lib/focus.ts approvalFocusReturn.

9. Test owners — AC #4, one cheapest owner per fact, every file under 500 lines, all fixtures parsed through the closed model. tests/model.ts follows src/ui/workbench-approvals/tests/model.ts: createIdentityAuthorities() plus createCodexBrowserModel(), snapshot()/executableLink()/commandTarget() builders parsed by BrowserSnapshotSchema and friends, and a recording fake transport; no "as" casts anywhere. Then: tests/intent.test.ts (pure) for the three literal bodies, idle vs active selection, ambiguous and vanished active turns, stale link; tests/dispatch.test.ts (pure) for captured-target pass-through, local and transport refusals, duplicate activation counting exactly one command, late result after a link change, and disconnect; tests/draft.test.ts (pure) for the delivered/not_delivered/outcome_unknown policy and the absence of an optimistic assistant record; tests/composer-surface.test.tsx (renderToStaticMarkup) for the screen-reader label, the pending disabled markup and the status region; tests/mounted-composer.test.tsx (src/ui/dom-testing harness: registerHappyDom(), await loadRenderedUiTools(), afterAll(unregisterHappyDom), never a static @testing-library import) for Enter vs Shift+Enter multiline, compositionstart/compositionend suppressing submit, and focus restoration.

10. Verify from the worktree and report exact counts: bun run type-check; bun run lint; bun run fmt:check; bun run build:frontend; bun test --isolate src/ui/workbench-composer src/ui/workbench-runtime src/ui/workbench-transport src/ui/dom-testing; bun run test:repository (the assistant-ui policy owner must stay green); bun run test:modules. Commit in small conventional slices (feat(workbench-composer), test(workbench-composer), chore(backlog)). No AC checks and no final summary: an independent reviewer runs first.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete (@claude-opus), lane-d branch codex/task-143-03-05 on 1bee41e1. Two commits: 3d973ac1 feat(workbench-composer), d769c82e test(workbench-composer).

Built src/ui/workbench-composer: composer.ts (sole assistant-ui import site), contract.ts, index.ts, lib/{link,intent,keys,draft,vocabulary,controller,WorkbenchComposer}.ts(x), tests/{model,intent,controller,keys,mounted-composer}. Every file under the 500-line limit (largest: WorkbenchComposer.tsx 374, controller.test.ts 359).

DESIGN DECISION THAT CHANGED THE OBVIOUS SHAPE — the reviewed primitive cannot carry submit. @assistant-ui/react 0.15.17's composer refuses to send while a run is in progress unless its Queue capability is enabled: ComposerPrimitive.Root calls useComposerSend(), which is null when composer.canSend is false, and ComposerPrimitive.Input's own Enter handler returns early on `threadState.isRunning && !hasQueue`. Archboard's steer exists precisely to correct a running turn, and Queue is on the repository policy's forbidden list, so routing a steer through the primitive's send is impossible. A first implementation that used ComposerPrimitive.Input as the text buffer was proven wrong by the mounted owner (the steer test sent nothing at all), which is why the mounted owner exists.

Final shape: Archboard owns the text buffer (useState), the keyboard, the draft policy, the pending policy, and every dispatch. ComposerPrimitive.Root supplies the form element and the mechanic that focuses the input when a person taps blank composer space (a real Samsung Flip affordance, and the reason the primitive still earns its place); the submit handler prevents the default, which is also how Root skips its internal send, so exactly one command leaves per gesture. ComposerPrimitive.Input is not used, and the Queue/Dictate/StopDictation/DictationTranscript members are never reached.

AUTHORITATIVE TURN READ (lib/link.ts). readComposerTurn() reads only the published snapshot: exactly one turn with status inProgress is active, none is idle, more than one is ambiguous and steers nothing. That mirrors the host's own refusal in src/server/canvas/lib/codex-workbench-text-actions.ts, which re-reads its thread and rejects a steer unless exactly one in-progress turn matches the named turnId as expectedTurnId. The composer never remembers a turn it once saw. readComposerLink() adds the availability read: connected + readiness thread_capable + threadLink executable, otherwise unavailable/inspect_only carrying the host's own reason.

LITERAL BODIES (lib/intent.ts), typed as Extract over the closed BrowserCommandDraft union so a wrong shape is a type error: idle submit -> {command:"start", threadId, prompt}; submit during an active turn -> {command:"steer", threadId, turnId, prompt}; interrupt -> {command:"interrupt", threadId, turnId} against the turn captured when the control was rendered. threadId always comes from the captured link, never from the timeline. Prompts are pre-checked against the contract's own bound (non-empty, NUL-free, <= 16384 UTF-8 bytes) so a message the host would reject is refused with the text still in front of the person.

NON-RETARGETABLE DISPATCH (lib/controller.ts). Every dispatch calls transport.captureCommandTarget() at activation and passes that exact target back to transport.command(draft, target), so a pane that navigated is refused by the transport rather than retargeted. Before capture the composer refuses locally when the link is not executable, when the active turn is ambiguous, or when an interrupt's captured turn is gone or replaced. A failed capture is always not_delivered, because the command did not exist yet. After the await, the controller re-reads the link: a result for a thread the pane has left becomes outcome_unknown with a retained copy naming its own thread, never a status applied to the composer now on screen.

DRAFT POLICY (lib/draft.ts), one function, both consumers: delivered -> cleared (the host published a turn carrying the message; keeping the text invites a duplicate); not_delivered -> left in the live composer (nothing reached the workhorse, resending is safe); outcome_unknown -> cleared from the live composer and retained beside it as an inert, readonly, dismissable copy that nothing resubmits, because Archboard never retries an unknown mutation and leaving the text armed under Send would make one keystroke start a second turn whose predecessor may already be running.

NO OPTIMISTIC RECORD. The controller holds no message list (proved structurally: its state is exactly pending/status/retained/settled) and a delivered start claims only a turnId that the host's own answering snapshot publishes as in-progress; when the answer shows no single in-progress turn the composer reports outcome_unknown instead of inventing one. The mounted owner also asserts the submitted text is nowhere in the document after a delivered send.

PENDING LEASE. One command in flight at a time. While pending the input, Send, and Interrupt are disabled and aria-busy is set on the form; a second submit or interrupt is refused with no second transport.command call.

ACCESSIBILITY. The input's accessible name names the action it performs ("Message the Codex workhorse" / "Steer the current Codex turn"); the status region is an <output> whose implicit status role carries the announcement plus its recovery sentence; focus returns to the input when a command settles but only when focus is still inside the composer, so a control the person moved to keeps it; controls keep the semantic 44px touch target; semantic tokens only, through @/ui/ui-classnames cn and @/ui/button, static complete utility strings.

REPOSITORY POLICY. No allowlist extension was needed or made. tools/oxlint-plugin-archboard.js keys ASSISTANT_UI_OWNERS on the directory "src/ui/workbench-composer" (assistantUiOwner matches relativePath === owner || startsWith(owner + "/")), so composer.ts already may import ComposerPrimitive; tests/system/repository-policy/assistant-ui-imports.test.ts passes unchanged. No package.json, bun.lock, src/ui/shell, or test-inventory edit (TASK-143.03 AC #3 serializes those); module owners under src/ are discovered by test:modules with no inventory entry.

VERIFICATION, all from the worktree: bun run type-check pass (both projects); bun run lint pass; bun run fmt:check pass across 1094 files; bun run build:frontend pass; bun test --isolate src/ui/workbench-composer src/ui/workbench-runtime src/ui/workbench-transport src/ui/dom-testing 117 pass 0 fail 675 assertions across 14 files (workbench-composer alone: 74 pass 0 fail 151 assertions across 4 files); bun run test:repository 123 pass 0 fail 1067 assertions across 18 files; bun run test:modules 2139 pass 0 fail 19197 assertions across 230 files. No system, serial-browser, or opt-in lane ran.

DELIBERATELY LEFT OUT. (1) No renderToStaticMarkup owner: every rendered fact this leaf owns (accessible name, focus, keyboard, IME, disabled-during-pending, tap-to-focus) needs a real DOM, and the rest is proved more cheaply by the three pure owners. (2) The composer does not bind assistant-ui's MessageNotSentError draft-restore path, because it no longer routes submit through the runtime's onNew; controller.submit is still shaped for WorkbenchRuntimeProvider's onSubmit seam so TASK-143.03.10 may bind it, and the mounted owner binds it while proving exactly one command per gesture. (3) The runtime's own status region is left as TASK-143.03.02's; the composer publishes its own. (4) No shell integration, no browser owner: TASK-143.03.10, .11, and .13 own those.

Acceptance criteria remain unchecked and the task remains In Progress for independent review.
<!-- SECTION:NOTES:END -->
