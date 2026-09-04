---
id: TASK-143.03.03
title: Choose and disclose the pane thread link
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 09:29'
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
<!-- SECTION:NOTES:END -->
