---
id: TASK-143.03.05
title: Control workhorse turns from the composer
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 11:32'
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
  - src/server/canvas/lib/codex-workbench-timeline.ts
  - src/server/canvas/lib/codex-workbench-text-actions.ts
  - src/server/canvas/tests/codex-workbench-timeline.test.ts
  - src/server/canvas/tests/codex-workbench-timeline-remediation.test.ts
  - src/server/canvas/tests/codex-workbench-adapters.test.ts
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
- [x] #1 The module's only assistant-ui import is named root ComposerPrimitive; submit, steer, interrupt, draft, pending, and focus behavior remain Archboard-owned and target the captured current thread link/turn.
- [x] #2 Idle submit uses the literal turn/start body, active steer uses the literal turn/steer body with host-proven expectedTurnId, and interrupt targets the captured active turn; link/state changes before dispatch refuse.
- [x] #3 Composer disables during pending command lease, preserves or clears draft by documented delivered/not_delivered/outcome_unknown outcome, and never creates an optimistic assistant record.
- [x] #4 Keyboard, multiline, IME, screen-reader label, focus restoration, stale link, disconnect, late result, duplicate activation, and active-turn races are covered by module tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Module shape, as delivered. src/ui/workbench-composer/composer.ts (the module's sole assistant-ui import site), contract.ts, index.ts, lib/{link,intent,keys,draft,vocabulary,controller}.ts and lib/WorkbenchComposer.tsx, tests/{model.ts,intent.test.ts,controller.test.ts,keys.test.ts,mounted-composer.test.tsx}. No repository-policy allowlist edit: tools/oxlint-plugin-archboard.js keys ASSISTANT_UI_OWNERS on the "src/ui/workbench-composer" directory, so every file in the module may already import ComposerPrimitive. No package.json, bun.lock, src/ui/shell, or test-inventory edit.

2. What the reviewed primitive can and cannot carry. @assistant-ui/react 0.15.17's composer refuses to send while a run is in progress unless its forbidden Queue capability is enabled: ComposerPrimitive.Root calls useComposerSend(), which is null when composer.canSend is false, and ComposerPrimitive.Input's Enter handler returns early on `threadState.isRunning && !hasQueue`. Archboard's steer exists to correct a running turn, so the primitive's send and its Input can never carry it. Only ComposerPrimitive.Root is rendered, for the form element and the mechanic that focuses the input when a person taps blank composer space; the submit handler prevents the default, which is also how Root skips its internal send. Archboard owns the text buffer, the keyboard, the draft policy, the pending policy, and every dispatch. ComposerPrimitive.Input, Send, Cancel, Queue, Dictate, StopDictation, and DictationTranscript are never rendered or reached.

3. The authoritative in-progress turn (lib/link.ts). readComposerTurn() reads only the published snapshot: exactly one turn with status inProgress is active, none is idle, more than one is ambiguous and steers nothing. readComposerLink() adds availability — connected, thread_capable, and a link that is executable, unbound, or inspect_only, each keeping the host's own reason and its own next action.

4. The three literal bodies (lib/intent.ts), typed as Extract over the closed BrowserCommandDraft union so a wrong shape is a type error: idle submit is {command:"start", threadId, prompt}; submit during an active turn is {command:"steer", threadId, turnId, prompt} carrying the id the host re-proves as expectedTurnId; interrupt is {command:"interrupt", threadId, turnId} for the turn captured when the control was rendered. threadId always comes from the captured link. Prompts are pre-checked against the contract's own bound (non-empty, NUL-free, at most 16384 UTF-8 bytes).

5. Non-retargetable dispatch and one state owner (lib/controller.ts). Every dispatch captures the transport's target at activation and hands that exact target back to command(). Local refusals cover a link that is not executable, an ambiguous active turn, and an interrupt whose captured turn is gone or replaced; a failed capture is always not_delivered because the command did not exist yet. After the await the controller re-reads the link: a delivered or unknown answer for a thread the pane has left becomes outcome_unknown with a retained copy naming its own thread, while a definitive not_delivered keeps its own answer. One command in flight at a time; a second activation is refused with nothing sent.

6. The draft policy (lib/draft.ts), one function and both consumers: delivered clears; not_delivered leaves the text in the live composer; outcome_unknown clears the live composer and retains an inert, readonly, dismissable copy that nothing resubmits, because Archboard never retries an unknown mutation. A retained copy stands until dismissed, replaced by a newer one, or answered by a delivered send of the same text; a later command or a refusal leaves it alone.

7. The rendered surface (lib/WorkbenchComposer.tsx). Archboard's own textarea, send control, interrupt control, status output, and retained-draft region; semantic tokens through @/ui/ui-classnames cn and @/ui/button; the accessible name says which send the keystroke performs; the status region is an <output> whose implicit status role carries the message and its recovery; focus returns to the input when a command settles but only when focus is still inside the composer. A link that is not executable renders no input and no primitive at all, so the composer mounts anywhere in that state; the executable branch requires an AssistantRuntimeProvider ancestor and says so in its docstring and in WorkbenchComposerProps.

8. Serialized server remediation, added after the fixed-range review found the browser could not see a running turn at all on a long thread. src/server/canvas/lib/codex-workbench-timeline.ts paged oldest-first and dropped the newest turns when maxTurns or maxBytes was hit, and projectData trimmed from the tail, so a long thread hid its in-progress turn and every reader of that projection saw idle. readTurnPages now pages newest-first and publishes chronologically, stopping before it fetches history the budget has already spent; projectData walks newest-first and marks the oldest retained turn as the truncation boundary. src/server/canvas/lib/codex-workbench-text-actions.ts gives turn/start the same authoritative in-progress guard steer already had, refusing with an in-contract invalid_command and an actionable message rather than letting two turns race on one thread. No timeline-level truncated disclosure was added: BrowserTimelineSchema is strict and carries no such field, and the closed model is not this task's to edit.

9. Test owners, one cheapest owner per fact, every file under 500 lines, all fixtures parsed through the closed browser model with a real identity authority and no `as` casts. Pure: intent.test.ts (turn read, link states, literal bodies, every pre-dispatch refusal), controller.test.ts (captured target, authoritative delivered turn, pending lease and duplicate activation, draft dispositions, transport refusals, disconnect, late result, retained-copy lifetime), keys.test.ts (keyboard and IME decision, draft policy table, transport vocabulary). Rendered, on the src/ui/dom-testing harness: mounted-composer.test.tsx (Enter versus Shift+Enter multiline, compositionstart suppressing submit until compositionend, screen-reader label, focus restoration and focus not stolen, tap-to-focus, disabled during a pending lease, and a delivered send leaving the submitted text nowhere in the document). Server: one owner proving a budget cut keeps the newest in-progress turn and marks the oldest, and one proving the start guard refuses before any turn is started.

10. Verify from the worktree and report exact counts: bun run type-check; bun run lint; bun run fmt:check; bun run build:frontend; bun test --isolate src/ui/workbench-composer src/ui/workbench-runtime src/ui/workbench-transport src/ui/dom-testing src/server/canvas src/server/codex-workbench; bun run test:repository; bun test --isolate --max-concurrency=1 tests/system/canvas-state/codex-workbench-production.test.ts. Commits are small and conventional with the Co-Authored-By trailer.
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

Independent fixed-range review of 1bee41e1..d3d14e6f returned NOT CLEAN on the truncated-timeline idle decision, fixed at the source in fa74777e.

Rebased onto codex/task-143-144-workbench (512a97f4); bun install reported no changes. tests/model.ts gained the snapshot's now-required threadCandidates field.

MEDIUM — the browser could not see a running turn at all on a long thread (fa74777e, this task's serialized server edits). src/server/canvas/lib/codex-workbench-timeline.ts paged turns oldest-first (sortDirection "asc") and returned as soon as maxTurns (800) or maxBytes (768 KiB) was reached, and projectData trimmed from the tail as well, so the turns dropped were exactly the newest. Every reader of that projection then saw an idle workhorse: the composer offered Send and sent turn/start while a turn ran, and turn/start had no authoritative in-progress guard of its own. (a) readTurnPages now pages newest-first and publishes chronologically, and stops before fetching history the budget has already spent — strictly fewer pages for the same retained bytes, so the cheapest correct fix was also the cheaper one. projectData walks newest-first and marks the oldest retained turn as the truncation boundary, because that is where history was cut. Decision: no timeline-level `truncated` disclosure was added. BrowserTimelineSchema is .strict() with exactly {kind, threadId, turns, nextCursor}; adding a field means editing the closed browser model plus the gateway and every fixture, and root/closed-model edits are serialized away from this leaf (TASK-143.03 AC #3). The per-turn outputsTruncated mark on the oldest retained turn is the disclosure that exists. (b) codex-workbench-text-actions.ts gives turn/start the same authoritative in-progress read steer already had, factored into one authoritativeActiveTurns helper. Decision on the refusal shape: a plain Error reaches the browser as the gateway's opaque `command_failed` with a static message, so the guard throws CodexWorkbenchGatewayError("invalid_command", …) instead — an in-contract, definitive, actionable refusal. Naming the reason on the wire would need a new BrowserGatewayErrorCode, which is the closed contract's (TASK-143.01.02/.10), so the composer's invalid_command sentence names the next action rather than guessing the cause. (c) No composer heuristic was needed after (a) and (b); the host's message is preferred over the composer's vocabulary when the host sent one. Owners: "a budget cut drops the oldest turns and keeps the newest in-progress turn" (codex-workbench-timeline-remediation.test.ts), "browser start is refused while the authoritative thread read shows a running turn" (codex-workbench-adapters.test.ts, beside the steer guard's owner), and the composer's "the host's in-progress guard on a start is a definitive refusal with a next action". The existing adapter owner's session fake now reports the thread the host would really see — idle for the start, running for the steer.

LOW 2 — lateFor() no longer overrides a definitive not_delivered (eb7179b2). A relink in flight makes a delivered or unknown answer unreadable here, but the host saying nothing was delivered stays true; relabelling it moved safe-to-resend text into the inert region. Owner: "a definitive not_delivered is not relabelled unknown by a relink in flight".

LOW 3 — the executable branch's AssistantRuntimeProvider requirement is now stated in the WorkbenchComposer docstring and beside WorkbenchComposerProps; every other link state renders no primitive and mounts anywhere.

LOW 4 — keys.ts no longer claims a submitMode="none" prop; the reviewed Input is not rendered at all.

LOW 5 — an unbound pane has its own link kind, sentence, and next action instead of being presented as an inspect-only history. linkRefusal now derives code, message, and recovery from the link kind, so the three non-executable states cannot drift apart. Owners: "an unbound pane reads as unbound, not as an inspect-only history" and "a submit against an unbound pane is refused as unbound, with its own next action".

LOW 6 — WorkbenchComposerTransport drops capabilities(): nothing read it, and the transport re-checks command support inside command() and refuses with its own code, so a second read here could only disagree. The fixture comment now says three members.

LOW 7 — the recorded plan was rewritten to match the delivered solution, including the assistant-ui finding and the serialized server remediation.

INFO 8 — the retained copy now has one documented lifetime, in lib/draft.ts and controller.retainedAfter: it stands until the person dismisses it, until a newer one replaces it, or until a delivered send of the same text answers its question. A later command answers a different question and a refusal answers none, so neither clears it. Owners: "a retained copy stands through a later command and goes on a delivered resend" and "a refusal leaves a standing retained copy alone".

INFO 9 — IME boundary. The composition guard reads both the event's isComposing flag and module state set by compositionstart/compositionend, which covers the Chromium and Samsung Flip surface Archboard targets. Safari's ordering, where compositionend fires before the confirming Enter's keydown, is out of scope: Archboard's shell is desktop Chromium, and there is no Safari owner to prove a fix against.

Verification after remediation, all from the worktree on eb7179b2: bun run type-check pass (both TypeScript projects); bun run lint pass; bun run fmt:check pass across 1146 files; bun run build:frontend pass; bun test --isolate src/ui/workbench-composer src/ui/workbench-runtime src/ui/workbench-transport src/ui/dom-testing src/server/canvas src/server/codex-workbench 292 pass 0 fail 1602 assertions across 46 files (workbench-composer alone 80 pass 0 fail 163 assertions across 4 files); bun run test:repository 123 pass 0 fail 1067 assertions across 18 files, so the assistant-ui import policy owner stays green with no allowlist extension; bun test --isolate --max-concurrency=1 tests/system/canvas-state/codex-workbench-production.test.ts 1 pass 0 fail 54 assertions. No serial-browser or opt-in lane ran. Every authored file stays under the 500-line limit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The workbench composer now controls workhorse turns, and the host projection it reads no longer hides the turn it must decide from.

src/ui/workbench-composer is the Archboard-owned text composer for one linked workhorse. Its only assistant-ui import is the named root ComposerPrimitive, and only Root is rendered — for the form element and the mechanic that focuses the input when a person taps blank composer space. The reviewed Input and the primitive's own send are deliberately unused: @assistant-ui/react 0.15.17 refuses to send while a run is in progress unless its forbidden Queue capability is enabled, so neither can express a steer, which is exactly what this composer exists to do. Archboard therefore owns the text buffer, the keyboard, the draft policy, the pending policy, and every dispatch; the submit handler prevents the default, which is also how Root skips its internal send, so one gesture sends one command.

Idle submit sends the literal turn/start body, submit during a running turn sends the literal turn/steer body carrying the turn id the host re-proves as expectedTurnId, and interrupt targets the turn captured when the control was rendered — all three typed as Extract over the closed BrowserCommandDraft union. The authoritative in-progress turn is read only from the published snapshot: one inProgress turn is active, none is idle, more than one is ambiguous and steers nothing. Every dispatch captures the transport's target at activation and hands that exact target back to command(), so a pane that navigated is refused rather than retargeted, and a result that lands after a relink is never applied to the composer now on screen. One command may be in flight at a time; the composer disables during that lease and a second activation sends nothing. The draft policy is one documented function: delivered clears, not_delivered leaves the text in the live composer, and outcome_unknown clears it and retains an inert dismissable copy that nothing resubmits, because Archboard never retries an unknown mutation. No optimistic assistant record is ever created — a delivered send claims only a turn the host's own answering snapshot publishes.

The independent review found that the browser could not see a running turn at all on a long thread, so the composer's idle-versus-running decision was unsound at the source rather than in the composer. src/server/canvas/lib/codex-workbench-timeline.ts paged turns oldest-first and stopped at maxTurns or maxBytes, and projectData trimmed from the tail, so the newest turns were exactly the ones dropped. It now pages newest-first, publishes chronologically, stops before fetching history the budget has already spent, and marks the oldest retained turn as the truncation boundary. src/server/canvas/lib/codex-workbench-text-actions.ts gives turn/start the authoritative in-progress guard steer already had, refusing with an in-contract invalid_command rather than letting two turns race on one thread.

Verified on eb7179b2 from the worktree: bun run type-check, bun run lint and bun run fmt:check (1146 files) pass; bun run build:frontend passes; bun test --isolate over src/ui/workbench-composer, src/ui/workbench-runtime, src/ui/workbench-transport, src/ui/dom-testing, src/server/canvas and src/server/codex-workbench is 292 pass 0 fail with 1602 assertions across 46 files; bun run test:repository is 123 pass 0 fail with 1067 assertions, so the assistant-ui import policy stays green with no allowlist extension; the codex-workbench production system owner is 1 pass 0 fail with 54 assertions.

AC #1 is proved by the mounted surface owners (accessible name per action, tap-to-focus, one command per gesture) together with the controller's captured-target owners. AC #2 is proved by intent.test.ts's three literal-body owners, its thread-id and turn-read owners, and its whole pre-dispatch refusal block, plus the mounted steer owner and the two new server owners that make the underlying turn read sound. AC #3 is proved by the pending-lease, duplicate-activation, draft-disposition and no-message-list owners in controller.test.ts and by the mounted delivered/not_delivered/outcome_unknown owners, the delivered one asserting the submitted text is nowhere in the document. AC #4 is proved by keys.test.ts, the mounted keyboard, multiline, IME, label, focus and disabled owners, and the controller's stale-link, disconnect, late-result, duplicate-activation and active-turn-race owners. Independent fixed-range review of 1bee41e1..d3d14e6f returned NOT CLEAN on the truncated-timeline idle decision, fixed at the source in fa74777e; the remaining low and informational findings are remediated in eb7179b2.
<!-- SECTION:FINAL_SUMMARY:END -->
