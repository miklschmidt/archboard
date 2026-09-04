---
id: TASK-143.03.03
title: Choose and disclose the pane thread link
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 10:44'
labels: []
dependencies:
  - TASK-143.01.09
  - TASK-143.01.11
  - TASK-143.03.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-thread-link
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own pane thread-link selection and readiness disclosure. Create and Attach are separate commands with separate prerequisites; no recent-thread heuristic or implicit load occurs. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pane selection lists only joined persisted/current loaded records and shows executable, inspect-only, stale, prior-epoch, source, loaded, status, and controllability reasons before bind.
- [ ] #2 Create/attach/relink/recover actions target captured pane and epoch; a focus change cannot retarget an in-flight action, and ambiguous creation remains inspect-only.
- [ ] #3 The account UI distinctly renders API key, hosted ChatGPT, explicit amazonBedrock apiKey+region, and amazonBedrockAccessKeys accessKeyId+secretAccessKey+optional sessionToken+region forms; device code, client tokens, and Bedrock profile/environment setup are unavailable with an explanation.
- [ ] #4 Missing/wrong binary, locked home, backoff/stopped, config/storage mismatch, login progress/failure/logout, command-before-ready, empty list, duplicate rows, and stale response have accessible recovery paths.
- [ ] #5 Module tests exhaust create, attach, relink, recovery, login, stale-response, ambiguous-creation, and focus-change races against captured pane/epoch identity; TASK-143.03.13 owns rendered browser coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build src/ui/workbench-thread-link as a pure-projection + controller + rendered-component module: index.ts, lib/contract.ts, lib/candidates.ts, lib/readiness.ts, lib/account.ts, lib/controller.ts, lib/projection.ts, lib/WorkbenchThreadLink.tsx. It consumes only src/ui/workbench-transport, src/ui/workbench-runtime, src/shared/* roots, and the UI foundation (ui-classnames, button); it instantiates no owner and imports no assistant-ui.
2. Candidate join (AC #1). The closed browser gateway publishes only the pane's current threadLink; it exposes no candidate-listing route, so the module takes the host-discovered inventory as a typed prop shaped like the runtime's ThreadLinkCandidate plus its ThreadLinkObservation join counts (persistedRows, loadedOccurrences). lib/candidates.ts admits a row only when it is one exhausted persisted record joined against the exhausted current-loaded list; it discloses executable/inspect-only, stale, prior-epoch, source presentation, loaded, status, and controllability before any bind, and it renders empty and duplicate inventories as explicit disclosed states rather than silently dropping rows.
3. Captured-target commands (AC #2). lib/controller.ts captures transport.captureCommandTarget() plus the transport instance at the moment the action is offered, and passes that exact target to transport.command(draft, target), so a focus change that swaps pane, child, epoch, lease, or link refuses with link_changed instead of retargeting. Create (threadLinkCreate) and Attach (threadLinkAttach) are separate commands with separate prerequisites; relink and recovery are separate again. No recency heuristic and no implicit load exists anywhere in the module. A creation that does not settle into a confirmed executable link stays inspect-only and never retries blind. Superseded settlements are ignored by revision.
4. Account UI (AC #3). lib/account.ts declares the four supported account/login/start forms derived from the vendor CodexLoginAccountParams union - apiKey, hosted chatgpt, amazonBedrock apiKey+region, amazonBedrockAccessKeys accessKeyId+secretAccessKey+optional sessionToken+region - each with its own fields, secret handling, and validation. chatgptDeviceCode, chatgptAuthTokens, and Bedrock profile/environment setup render as named unavailable methods with an explicit explanation, never as a disabled control with no reason.
5. Readiness and recovery (AC #4). lib/readiness.ts maps every reachable arm to one disclosed state and one accessible recovery: incompatible_contract (missing/wrong binary), storage_mismatch (locked home, config/storage mismatch), backoff with its retry instant, stopped, reconnecting, stale_snapshot, login progress/failure/logout, command-before-ready, empty inventory, duplicate rows, and a stale or superseded response. Transport-owned recoveries run through the transport (refresh, accountRead, login cancel, logout); host-owned recoveries (start, choose binary, unlock home, repair storage, refresh inventory) run through declared props and render as an explanation rather than a dead control when the host declares no authority.
6. Rendered component. WorkbenchThreadLink renders the projection with semantic theme tokens through static classes composed by cn, one Swiss-grid region per concern, a role=status live region for the action announcement, labelled controls, and no card or bubble shapes. Every row carries its own separate Create/Attach/Relink control, so no hidden selection state is needed to reach an arm.
7. Tests. tests/candidates.test.ts (AC #1), tests/controller.test.ts (AC #2 and #5), tests/account.test.ts (AC #3), tests/recovery.test.ts (AC #4), tests/rendered.test.ts (rendered arms), tests/fixtures.ts. The repository has no happy-dom, jsdom, or React Testing Library and this task may not add a dependency, so rendered assertions use renderToStaticMarkup the way workbench-coordinator and workbench-board-status do, behaviour is proved against the pure controller and projections, and TASK-143.03.13 owns rendered browser coverage. Each file stays under the 500-line lint cap.
8. Verify: bun run type-check, bun run lint, bun run fmt:check, bun run build:frontend, bun test --isolate over workbench-thread-link, workbench-transport and workbench-runtime, bun run test:repository, bun run test:modules.

9. Remediation after the first independent review (NOT CLEAN: 2 blockers, 3 majors, 2 minors). Scope was widened by the orchestrator to include the serialized shared/server edit this task's own investigation proved necessary; TASK-143.01.09's notes are the authority ('Reopened with user approval after TASK-143.03.03 proved that no public authoritative candidate-discovery result reaches the browser consumer ... TASK-143.03.03 UI wiring remains deferred'). Rebased onto codex/task-143-144-workbench at 1cc5f345 first.
10. Wire the joined inventory through all four layers. src/shared/codex-browser-model: a bounded, deduplicated BrowserThreadCandidate/threadCandidates snapshot field carrying the runtime's browser-safe candidate projection verbatim, plus selectionId on threadLinkAttach/threadLinkRelink and a threadLinkRefresh command. src/shared/codex-browser-gateway: the delta key the exhaustiveness guard demands; no new socket action, because discovery fits the existing command union cleanly and an explicit command keeps discovery opt-in. src/server/codex-workbench: project the flattened candidate source through the one existing presentation mapper, bound the list, and add the key to the snapshot diff. src/server/canvas: a candidate inventory owner and attach/relink through bindCandidate rather than classifyAndBind on a raw thread id.
11. Consume it in the browser module: read the inventory from the snapshot, delete the second classifier and the two invented join counts, send the selection with every bind, and route the refresh recovery through the new command.
12. Fix the three cn() sites that lost text-body, the ambiguous text-primary pair, and the unnamed row buttons.
13. Add the cheapest owner at each layer: shared schema round-trip, gateway projection and snapshot budget, transport delta parse, canvas route selection refusal, and the two real-process system owners.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 1 (commit 1c2d537a): built src/ui/workbench-thread-link — index.ts plus lib/contract.ts, lib/candidates.ts, lib/readiness.ts, lib/account.ts, lib/controller.ts, lib/projection.ts, lib/WorkbenchThreadLink.tsx, lib/AccountSection.tsx.

Decisions recorded here rather than asked:

1. Where the candidate list comes from. The closed browser gateway (BROWSER_GATEWAY_ACTIONS) has no thread-listing action, and BrowserSnapshot carries only the pane's own threadLink. src/runtime/codex-thread-link owns discoverCandidates/bindCandidate, and src/ui may never import src/runtime. Adding a gateway route would be a shared/server edit this task does not own and TASK-143.03 explicitly serializes. The module therefore takes the inventory as typed data: ThreadLinkInventoryRecord mirrors the runtime ThreadLinkCandidate projection (selectionId, threadId, state, reason, source, status, loaded, canAcceptDirectInput) plus persistedRows and loadedOccurrences from its ThreadLinkObservation, so a later wiring task hands over what it already has. The module owns the join rule, the disclosure, and the refusals.

2. Missing/wrong binary and locked home are not separate wire arms. src/server/canvas/lib/codex-workbench-readiness.ts folds binary_invalid, binary_missing, binary_wrong_version, and strict_config_rejected into readiness incompatible_contract, and storage_refused (including the dedicated-home lock) into storage_mismatch. The module discloses the host's exact bounded reason for each arm and offers both recoveries that arm can need (correct the binary / start the workbench; release the home lock / repair the storage configuration) rather than re-deriving a code the wire does not carry.

3. Recovery ownership is explicit. refresh_snapshot and read_account run through the transport; retry_login, cancel_login, and sign_out are account controls with their own arguments and live in the account section; start_workbench, choose_binary, unlock_home, repair_storage, and refresh_inventory are host-owned and are declared by the caller through hostRecoveryIntents. A recovery with no owner renders as a named explanation, never as a dead control.

4. Coordinator heads-up applied: this module's commands are threadLinkCreate, threadLinkAttach, threadLinkRelink, accountLogin, accountLoginCancel, and accountLogout, none of which changed in the TASK-143.03.01 integration, and every one already passes the target captured by captureCommandTarget() to command(draft, target).

Slice 2 (commit 319ce03a): five test owners under src/ui/workbench-thread-link/tests, plus fixtures.ts. The repository has no happy-dom, jsdom, or React Testing Library and this task may not touch package.json, so rendered assertions use renderToStaticMarkup the way workbench-coordinator and workbench-board-status do, and behaviour is proved against the pure projections and the controller. The transport double enforces the captured target the same way the real transport does, so a controller that stopped passing its captured target would fail rather than be silently retargeted. TASK-143.03.13 owns rendered browser coverage.

Where each acceptance criterion is proved:
- AC #1: tests/candidates.test.ts (13 tests) and tests/rendered.test.ts rows 'renders one row per joined record with every disclosed fact before binding', 'renders an inspect-only row with its reason and its inspection-only action', 'renders duplicate and unjoined records as refused rows with a refresh path', 'renders the empty inventory as its own state rather than a blank list'.
- AC #2: tests/controller.test.ts 'create and attach are separate commands with separate drafts', 'relink is a third command, chosen by the pane current link', 'every command carries the target captured when it was offered', 'a focus change to another epoch refuses instead of retargeting the command', 'a focus change that moves the pane link refuses the captured attach', 'an ambiguous creation stays inspect-only rather than reporting a link'.
- AC #3: tests/account.test.ts (9 tests) and tests/rendered.test.ts 'renders the four supported sign-in forms and the four unavailable methods', 'renders the Bedrock access-key form with its optional session token masked', 'renders the hosted ChatGPT form as a fieldless flow'.
- AC #4: tests/recovery.test.ts (13 tests) and the five startup/login rendered owners in tests/rendered.test.ts. Command-before-ready, empty list, duplicate rows, and stale response are covered by the controller and candidate owners named above.
- AC #5: tests/controller.test.ts (16 tests) covers create, attach, relink, login, cancel-login, logout, superseded settlement, lost response, unknown outcome, and both focus-change races; tests/recovery.test.ts covers the recovery arms.

Verification from the worktree, all green: bun run type-check; bun run lint (oxlint, 1070 files, no findings); bun run fmt:check (all matched files correctly formatted); bun run build:frontend (built, only the pre-existing chunk-size advisory); bun test --isolate over workbench-thread-link, workbench-transport and workbench-runtime — 107 pass, 0 fail, 778 expect() calls across 14 files; bun run test:repository — 122 pass, 0 fail across 18 files; bun run test:modules — 2032 pass, 0 fail across 225 files. The module's own lane is 66 pass, 0 fail, 265 expect() calls across 5 files. Every authored file is under the 500-line cap; the largest are lib/WorkbenchThreadLink.tsx at 394 and tests/fixtures.ts at 353.

Deliberately left out, with reasons:
- No gateway route for candidate discovery. Adding one is a shared/server edit outside this task and inside the serialized set; the module takes the inventory as typed data instead.
- No interactive DOM test. The repository has no DOM implementation and no dependency may be added here; interactive proof of clicks, focus order, and screen-reader output belongs to the browser owner in TASK-143.03.13.
- No shell integration. TASK-143.03.10 and TASK-143.03.11 own composition and shell placement; this module renders standalone and instantiates no owner.
- One pre-existing condition observed, not fixed here: cn() runs tailwind-merge, which does not know the repository's custom text scale, so a semantic size such as text-body is dropped when it is merged beside a semantic text colour such as text-status-foreground. src/ui/workbench-coordinator and src/ui/workbench-board-status already compose exactly this way, so this module stays consistent with them rather than inventing a second convention. It belongs to whoever owns the UI foundation, not to this task.

Remediation of the first independent review (commits 549fe7e8, ff5f9eb5), on top of a rebase to codex/task-143-144-workbench at 1cc5f345.

Finding 1 (BLOCKER, AC #1 unreachable). The joined inventory now reaches the browser. src/shared/codex-browser-model/lib/browser.ts adds BrowserThreadCandidateSchema and a threadCandidates snapshot field with three arms: unknown (nothing discovered yet), listed (records plus a truncated flag), unavailable (a bounded host reason). It also adds selectionId to threadLinkAttach and threadLinkRelink and a threadLinkRefresh command. src/shared/codex-browser-gateway/lib/envelope.ts adds the delta key its exhaustiveness guard forces. Decision, documented in the schema: no new gateway action. A refresh is a command, so it inherits the lease, captured-target, and refusal machinery the socket actions do not have, and it keeps discovery explicit — opening a pane exhausts no Codex list, which is the same rule as no recent-thread heuristic. src/server/codex-workbench/lib/projection.ts projects the classifier's flattened candidate source through the one existing projectThreadLinkSource mapper (widened to accept both shapes) and bounds the list. src/server/canvas/lib/codex-workbench-thread-links.ts adds a candidate inventory owner and the refresh action, and the canvas browser gateway publishes it from the projection read.

The bound is BROWSER_THREAD_CANDIDATE_LIMIT = 40, not 100. The snapshot fitter treats the timeline as its sole variable field, so the inventory must be bounded rather than fitted; at 100 records a full list plus a rich snapshot exceeded the 32 KiB minimum gateway budget and the fitter refused the whole snapshot. 40 leaves the fitter its history to trim, and a longer list is published truncated with that disclosed on the row summary. The snapshot-budget owner now proves it.

Finding 2 (BLOCKER, invented fields). ThreadLinkInventoryRecord and ThreadLinkInventory are now aliases of the wire types BrowserThreadCandidate and BrowserThreadCandidates. persistedRows and loadedOccurrences are gone, and the module consumes sourcePresentation from the wire instead of a second source vocabulary.

Finding 3 (MAJOR, second classifier). lib/candidates.ts no longer has exclusionOf or outcomeOf. outcome is record.state, the reason label is the host's reason mapped to a sentence with an unknown code shown verbatim, and the unreachable not_persisted, persisted_ambiguous, and loaded_ambiguous exclusions are deleted. One presentation refusal is kept: two rows naming one thread are excluded rather than one of them being chosen for the person. That is not a join rule, and it is the owner AC #4's named duplicate-rows condition needs; the schema also rejects a duplicated selectionId outright.

Finding 4 (MAJOR, bypassed CAS). The controller sends selectionId with attach and relink. The canvas route resolves the selection against the list it published (refusing one it never published, or one naming another thread), stages the ownership record when the thread has none, then re-discovers and binds through bindCandidate. The re-discovery is required, not incidental: staging the record moves the epoch, and a retained candidate is only valid while its epoch CAS is unchanged.

Finding 5 (MAJOR, dropped text-body). The three cn() sites use !text-body, the same escape src/ui/button, dialog, opener-settings, and workbench-timeline already use. This replaces the note in the earlier slice that called it a pre-existing condition to leave alone.

Finding 6 (MINOR, ambiguous text-primary). The retry-sign-in anchor now uses !text-control with text-foreground and decoration-primary, so no utility can be read as either a size or a colour.

Finding 7 (MINOR, unnamed row buttons). Each bind control carries aria-label naming the action and the thread id; the rendered owner asserts it.

Coordinator note applied: the pinned happy-dom and @testing-library stack landed on the integration branch during this remediation. This leaf stays on renderToStaticMarkup, which already proves finding 7's accessible name, so nothing here needs the mounted harness and this branch does not depend on that root change.

Verification, all green: bun run type-check; bun run lint; bun run fmt:check; bun run build:frontend; bun test --isolate over workbench-thread-link, workbench-transport and workbench-runtime — 108 pass, 0 fail, 793 expect() calls across 14 files; bun test --isolate src/shared src/server/codex-workbench src/server/canvas — 206 pass, 0 fail, 1453 expect() calls across 39 files; the three system owners — 5 pass, 0 fail; bun run test:repository — 122 pass, 0 fail; bun run test:modules — 2038 pass, 0 fail across 226 files. The module's own lane is 65 pass, 0 fail, 269 expect() calls across 5 files. Every authored file stays under the 500-line cap; the candidate projection owner was split into its own file to keep projection.test.ts under it.

Second remediation (commit 7789f6a9), on top of a rebase to codex/task-143-144-workbench at badb5a60 plus bun install.

Finding 1 (BLOCKER, foreign attach permanently broken). src/runtime/codex-epoch/lib/manifest.ts now exports EPOCH_THREAD_ATTACH_OPERATION and builds its own ownership table from it, and the canvas attach path stages that descriptor instead of the literal kind 'attached' the table never matched. The staged record and the table that must resolve it are now one value, so they cannot drift again. src/runtime/codex-epoch/tests/thread-ownership.test.ts adds an owner asserting the exported descriptor resolves as attached ownership and that a record differing in either kind or rpc resolves to nothing. src/server/canvas/tests/codex-workbench-thread-attach.test.ts no longer pins the bug: it asserts through resolveThreadOwnershipProvenance, which is the function the bind actually consults. The production system owner now attaches a thread the workbench did not create: the fake Codex fixture seeds one persisted thread before any thread/start, the owner asserts it lists as inspect_only/unknown_provenance, attaches it into an executable link, then relinks back to the created thread. That is the path attachRecord actually runs on.

Finding 2 (BLOCKER, refresh refused on an unbound pane). threadLinkRefresh is in the transport's THREAD_LINK_COMMANDS, so it no longer falls into the executable-link check. src/ui/workbench-transport/tests/capabilities.test.ts asserts it is supported exactly when the pane is thread-capable, across every readiness arm and for an unbound and an inspect-only link. The module no longer hand-lists its commands: THREAD_LINK_MODULE_COMMANDS is one exported list the fixture derives its supported set from, and the new src/ui/workbench-thread-link/tests/transport-integration.test.ts drives the real BrowserWorkbenchTransport over a small gateway socket through refresh, list, and attach — asserting the real transport enables every command in that list on a thread-capable unbound pane, that the bind carries the person's selection and the lease target on the wire, and that nothing reaches the wire before thread capability. That owner exists because a hand-listed double cannot catch the transport refusing a command the module offers.

Finding 3 (MAJOR, vacuous CAS). The inventory owner records the epoch generation it discovered under and exposes generation() and invalidate(). A bind whose published list was discovered under a different epoch is refused and the list is retired to the unavailable arm, so the browser re-discloses it rather than being told to retry a row that is no longer what it said it was. When the thread already carries an ownership record the bind consumes the person's own selectionId, which is the real one-shot CAS. The one remaining re-resolution is when this command itself must record ownership first: staging is deliberately not done for every listed thread at discovery, because that would mint ownership of threads nobody chose. Both branches and the refusal have owners in codex-workbench-thread-attach.test.ts and codex-workbench-adapters.test.ts.

Finding 4 (MINOR). The duplicate_row refusal, ThreadLinkExclusion, ThreadLinkExcludedRow, the excluded list, and the rendered refusal block are deleted, along with their tests. AC #4's duplicate-rows condition is owned where it is reachable: the shared schema rejects a repeated selection and the transport turns such a snapshot into an incompatible-contract state, both with owners.

Finding 5 (MINOR). The inventory is gateway-global and a refresh republishes it to every pane. Kept — the list describes the shared child epoch, and a per-pane copy would let two panes disagree about which threads exist — and now documented on both the server interface and the module's ThreadLinkInventory type: a pane can see its rows change without that pane acting.

Verification, all green: bun run type-check; bun run lint; bun run fmt:check; bun run build:frontend; bun test --isolate over workbench-thread-link, workbench-transport, workbench-runtime, codex-browser-model, server codex-workbench and codex-epoch — 211 pass, 0 fail, 2032 expect() calls across 35 files; the three system owners — 5 pass, 0 fail; bun run test:repository — 122 pass, 0 fail across 18 files; bun run test:modules — 2042 pass, 0 fail across 228 files.

Rebased onto codex/task-143-144-workbench at cdd0cd4b (TASK-143.03.06, .07 and 143.04.01 integrated). Two conflicts, both in src/server/canvas/lib/codex-workbench-browser-gateway.ts and both at the same seam: TASK-143.03.06's coalesced queue re-read and this task's candidate inventory construction sit next to each other. Both behaviours kept — the queue re-read, its floor, and its in-flight coalescing are untouched, and the inventory is constructed beside them and published from the same projection read. Commit f16d7440 carries the required threadCandidates field into the queue, approvals and voice-session fixtures that landed with those tasks; no behaviour changed there.

Verification after the rebase, all green: bun run type-check; bun run lint; bun run fmt:check (1131 files); bun run build:frontend; bun test --isolate over workbench-thread-link, workbench-transport, workbench-runtime, codex-browser-model, server codex-workbench and codex-epoch — 217 pass, 0 fail, 2045 expect() calls across 36 files; the three system owners — 5 pass, 0 fail, 172 expect() calls; bun run test:repository — 123 pass, 0 fail across 18 files; bun run test:modules — 2253 pass, 0 fail, 20953 expect() calls across 244 files.
<!-- SECTION:NOTES:END -->
