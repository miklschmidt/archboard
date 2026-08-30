# Codex workbench delivery map

**Planned:** 2026-08-30

**Scope:** TASK-143 and TASK-144 after TASK-140 merged into `main`

The Backlog records are the executable specification. This map owns delegation,
integration order, and reconciliation. A worker activates one ready leaf,
researches its current seam, and records an implementation plan then; To Do
tasks deliberately have no speculative `implementationPlan` field.

## Unit of delegation

A leaf owns one deep module, one test/document owner, or one serialized shared
configuration seam. Cross-module leaves are reserved for final composition,
removal, shell/browser integration, and root package/lockfile edits whose value
is precisely the atomic integration boundary.

The active graph contains **83 implementation leaves**: **64 under TASK-143**
and **19 under TASK-144**. TASK-143.04.08 is archived because each browser
owner now registers itself when it becomes runnable.

| Milestone   | Leaf ownership                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TASK-143.01 | identities/browser DTO; ignored/generated/decoded exact protocol; timing; authored contracts; process/storage/auth; epoch; JSON-RPC; session; thread link; workhorse transaction; root conformance; generated-boundary policy; final production composition; lifecycle process owner |
| TASK-143.02 | extraction-ready browser realtime contract/export; native media/WebRTC; sole 0.151.0 adapter; real-process contract                                                                                                                                                                  |
| TASK-143.03 | browser transport; assistant-ui dependency/adapter; thread-link/timeline/composer/queue/approval/coordinator/board UI; text frame; shell/fullscreen text; self-registering text browser owner                                                                                        |
| TASK-143.04 | voice projection; controls; captured context; canonical transcript; spoken approval; frame/fullscreen voice; self-registering controlled browser owner; real-audio smoke                                                                                                             |
| TASK-143.05 | wait graph; seven-family approval broker; reviewed six-tool catalogue; general dynamic-tool dispatcher                                                                                                                                                                               |
| TASK-143.06 | semantic publisher/delivery; serialized legacy server/runtime, control client, CLI, fixture, timing, and current-doc retirement                                                                                                                                                      |
| TASK-143.07 | reviewed coordinator/voice catalogue; capable coordinator lifecycle; sole queue port; four operations; callbacks; later-turn spoken gate; dispatcher                                                                                                                                 |
| TASK-144    | serialized dependency/lockfile; Vite/root/frontend/Oxlint aliases; theme/import/shell; immutable shadcn inputs; classes; native formatting; separate button/dialog/opener; browser and agent-guide enforcement                                                                       |

## Shared-seam serialization

- Root `package.json`/`bun.lock`: TASK-143.01.13 pins Codex and conformance,
  TASK-144.01 adds Tailwind/Base UI, then TASK-143.03.12 adds assistant-ui.
- UI alias: TASK-144.02 owns Vite; TASK-144.15 and TASK-144.17 own the two
  TypeScript projects; TASK-144.18 makes existing Oxlint boundary rules resolve
  `@/` without reading shadcn config; TASK-144.04 alone validates the literal
  `components.json` and runs the dry-run after all four agree.
- CSS: TASK-144.03 owns canonical import/theme order, TASK-144.13 imports the
  stylesheet, TASK-144.09 freezes the aesthetic guide, and TASK-144.14 maps the
  existing shell stylesheet to semantic variables without rewriting markup.
- Base UI source: TASK-144.04 tracks and hash-gates immutable upstream button
  and dialog fixtures. TASK-144.20 reduces the button deep module,
  TASK-144.19 consumes it and reduces the dialog deep module, and TASK-144.08
  migrates opener.
- Frame/shell: TASK-143.03.10 owns the text frame; TASK-143.04.06 extends it.
  TASK-143.03.11 extends the existing `PresentationDock` for text, then
  TASK-143.04.10 extends that same owner for voice.
- Browser inventory: TASK-143.06.04 atomically removes the legacy injection
  owner and repairs test inventory first; TASK-143.06.08 reconciles the
  documented executable baseline to 19.
  TASK-143.03.13 adds/runs text and updates 19 to 20. TASK-143.04.07 adds/runs
  voice and updates 20 to 21. Each landed owner is immediately runnable.
- `AGENTS.md`: TASK-144.12/16 establish UI guidance; TASK-143.06.08 updates
  injection guidance; text/voice browser registration then changes only exact
  inventory counts and owner names in serialized order.
- Timing: TASK-143.01.16 adds all workbench bounds before consumers;
  TASK-143.06.07 removes only legacy injection names after migration.
- Final runtime: TASK-143.01.14 depends on accepted realtime, approvals/tools,
  semantic delivery, coordinator callbacks, and coordinator dispatch, then
  composes one production graph. TASK-143.01.15 tests that graph through the
  server/process boundary.

No milestone-to-milestone dependency is used inside TASK-143. Leaf dependencies
are the source of truth and avoid a false cycle between the final TASK-143.01
composition root and TASK-143.05-.07 inputs.

## Delegation classes

Every leaf records one literal model and effort. **54 of 83 leaves** are
intentionally suitable for `gpt-5.6-luna`; the remaining 29 use
`gpt-5.6-sol`:

- `gpt-5.6-luna`, high: bounded exploration, mechanical configuration,
  generated-boundary checks, exports, cleanup, documentation, and fixtures.
- `gpt-5.6-luna`, xhigh/max: one behavioral runtime module with a frozen public
  contract, including protocol/session, media, reducers, catalogues, queue,
  callbacks, and state-policy modules.
- `gpt-5.6-sol`, medium: production composition, cross-module legacy removal,
  lifecycle/process owners, and broad integration review.
- `gpt-5.6-sol`, high: routine rendered UI and browser implementation. This
  includes TASK-143.03.03-.09, TASK-143.03.11, TASK-143.03.13,
  TASK-143.04.02-.07, TASK-143.04.10, TASK-144.03, TASK-144.08,
  TASK-144.11, TASK-144.14, TASK-144.19, and TASK-144.20.
- `gpt-5.6-sol`, xhigh: the substantial workbench-frame design in
  TASK-143.03.10 and any change to the reference-mockup/aesthetic contract.
- `gpt-5.6-sol`, xhigh: TASK-143.01.17 authors the immutable agent/tool bytes.
  Luna implementers may only load, hash, validate, and dispatch that record.

This leaves a clear Luna majority without assigning visual design, authored
agent policy, or cross-module composition to a cheaper model.

## Root orchestration topology

One persistent `gpt-5.6-sol` / `xhigh` root thread owns the complete global DAG
directly. It does **not** create permanent child orchestrators for TASK-143.01
through TASK-143.07 or TASK-144: cross-parent dependencies, shared package,
CSS, and browser owners, and final composition would split ready-state and
reconciliation authority.
The root may create bounded worker and independent reviewer threads, but it
never delegates scheduling or integration ownership.

The root maintains one isolated integration branch from the reviewed plan
commit plus an explicit leaf-keyed active set covering implementation, review,
and remediation. Readiness comes only from a clean committed integration
`HEAD`: dependencies must be Done there and the candidate must be absent from
the active set. Before dispatch, the root marks the selected leaves In Progress
through Backlog, commits that reservation, and starts every worker from exactly
that commit. It starts at most four disjoint leaf workers and two reviewers
concurrently, leaving capacity for the root, callbacks, validation, and
recovery. A shared path or prefix is one serialized lane even when two tasks
appear in the same conceptual wave.

Each leaf gets one visible project-worktree worker starting from the committed
reservation `HEAD` and the exact model/effort in its `Delegation profile`. That
worker may record the researched plan only on its already-In-Progress leaf; it
owns only named paths, commits its implementation and focused evidence, never
marks the task Done, never pushes, and remains the remediation worker for that
leaf. A sibling leaf is a new responsibility, not an unannounced reuse of the
thread.

The root assigns one independent reviewer thread to each leaf review loop. That
same reviewer rereviews the complete fixed worker `BASE` through each immutable
remediation `HEAD` until `REVIEW_CLEAN`; the reviewer is not replaced between
passes. The root validates callbacks, challenges findings against source and
acceptance, and returns valid findings to the same worker. Only after clean
review does the root reconcile the worker commit, run dependent validation,
finalize the leaf through Backlog, and commit that finalization on the
integration branch. It requires a clean checkout, advances the integration
`HEAD`, removes the leaf from the active set, then recomputes readiness and
starts downstream worktrees from exactly that new commit. Root-owned boundary
gates run sequentially in one validation lane. If scheduling, architecture,
preserved work, reviewer continuity, or authority becomes ambiguous, the root
pauses dispatch and callbacks its supervising source thread instead of
inventing a new coordinator tier.

If dependent validation fails after implementation reconciliation, the success
transition does not run. The leaf stays In Progress and in the remediation
active set, and the root reserves the sequential integration/validation lane
exclusively for that leaf. The captured failing integration `HEAD` is frozen:
the root starts no new worktree and reconciles, validates, finalizes, or advances
no other leaf. Already-active workers and reviewers may continue in isolation
and callback, but the root queues their reviewed commits with their worker and
reviewer identities; they do not change integration or Backlog finalization.

The root sends the failing leaf's same worker the exact failed command and
output, captured integration `HEAD`, and preserved-work evidence. The worker
commits remediation on its existing branch without changing the fixed worker
`BASE`; the same reviewer rereviews that complete range through the new
immutable `HEAD`. After `REVIEW_CLEAN`, the root applies the remediation to the
unchanged failing integration `HEAD` and reruns the failed validation plus every
focused gate invalidated by the change. This loop repeats until validation
passes. Only then may the root finalize that leaf, commit finalization, require
a clean checkout, remove it from the active set, and advance integration.

The root then drains queued reviewed leaves one at a time onto the new clean
committed `HEAD`, running each leaf's dependent validation before finalization.
A reconciliation conflict or changed validation result returns to that leaf's
same worker and reviewer loop; it never receives a root patch or replacement
thread. An irreparable or ambiguous ownership, cross-leaf causality, or
recovery path callbacks the supervising source thread without creating another
worker or coordinator tier. Readiness is recomputed only after the exclusive
recovery and queued reconciliation lane is empty and clean.

## Dependency waves

1. Pin exact Codex generation, identities, timing, capabilities/login/thread
   profiles, authored contracts, root dependency order, immutable shadcn
   inputs, Tailwind aliases/theme, and repository boundary owners.
2. Build process/storage/auth, epoch, JSON-RPC/session/pagination, thread
   classification, workhorse transaction, browser realtime contract/media,
   approval/catalogue, semantic, coordinator lifecycle, and queue ports.
3. Build dispatchers, realtime adapter/recovery, coordinator operations,
   callbacks/spoken gate, browser gateway, then the one production composition
   root and its lifecycle process owner.
4. Remove the legacy injection path in its green server/system-owner,
   control-client, CLI/system-owner, remaining environment, timing, and
   current-document leaves. Land Tailwind/shadcn shell foundations and the
   exact assistant-ui import policy before dependent UI modules.
5. Implement one UI module per leaf. Compose text before voice, and shell text
   before extending the same fullscreen dock for voice.
6. Land and register the controlled text browser owner, then voice. Run the
   clean-process real text/voice smoke and composed boundary reviews.

## Orchestration loop

1. From a clean committed integration `HEAD`, select leaves whose Backlog
   dependencies are Done and which are absent from the implementation,
   review, and remediation active set. Read each record, decisions, named owner
   path, neighbors, and public tests.
2. Mark the selected leaves In Progress through Backlog, commit that reservation,
   then create isolated worktrees from that exact commit with the model/effort
   class above. Each worker records its researched implementation plan. Its
   dispatch prompt supplies the exact parent callback thread.
3. Keep code and focused verification inside the named seam. A discovered
   contract change returns to the parent instead of leaking into a peer leaf.
4. Assign one independent reviewer thread to the leaf with `gpt-5.6-sol`:
   medium for broad code review, higher architectural reasoning only when the
   seam changes. It must reject weakened tests, lint, formatting, types, or
   public verification, and its prompt names the parent callback thread, fixed
   worker `BASE`, and current immutable `HEAD`.
5. The dispatcher does not poll or keep a turn open for review. The reviewer
   callbacks the parent with `REVIEW_CLEAN` or complete actionable findings;
   the parent returns findings to the same worker and requires the same
   reviewer to rereview the complete fixed-BASE range after every remediation.
   After clean review, reconcile the implementation and run dependent
   validation. On failure, keep the leaf In Progress and active; freeze the
   complete integration `HEAD` and exclusive validation lane; queue all other
   active reviewed work without reconciliation or finalization; send exact
   failure, integration, and preserved-work evidence to the same worker; retain
   the same complete-range reviewer; apply reviewed remediation to the unchanged
   failing `HEAD`; and rerun failed and invalidated gates until green. Only then
   finalize through Backlog, commit finalization, require a clean checkout, and
   drain queued leaves sequentially with their own dependent validation.
6. If validation failure has ambiguous ownership or cross-leaf causality, pause
   the lane and callback the supervising source; do not patch in the root or
   create a replacement worker, reviewer, or coordinator.
7. A queued leaf that conflicts or validates differently returns to its same
   worker/reviewer loop. Recompute readiness only after recovery and the queued
   integration lane are empty, finalized, committed, and clean.
8. Run `bun run check` at TASK-144, production composition, text UI, voice UI,
   and final TASK-143 boundaries.

Every delegated thread calls `codex_app__send_message_to_thread` for the exact
parent before its local final response. A worker reports `READY_FOR_REVIEW`, or
conditionally `PLAN_APPROVAL_REQUIRED` / `BLOCKED`, with this complete envelope:
`SOURCE`, `STATUS`, `BASE`, immutable implementation `HEAD`, `CHANGED_SCOPE`,
`VALIDATION`, `PRESERVED_WORK_AUDIT`, `REMAINING_RISK`, and `PARENT_ACTION`. A
reviewer reports `REVIEW_FINDINGS` or `REVIEW_CLEAN` with the same core fields
plus complete `FINDINGS`. The parent owns Backlog acceptance and finalization;
a worker never reports `FINALIZED` and a missing callback is not replaced by
parent polling.

## Boundary reviews

1. TASK-144: TASK-140 aesthetics, native Oxc enforcement, resolver agreement,
   Base UI behavior, and unchanged shell/Excalidraw operation.
2. TASK-143.01/.02: exact process/storage/auth/protocol, session/link, realtime
   public contract, production graph, reload/shutdown, and generated boundary.
3. TASK-143.05-.07: approval identity, wait graph, literal catalogues, target
   matrix, semantic delivery, queue, capable coordinator, callbacks, and spoken
   gate.
4. TASK-143.03: closed browser transport, assistant-ui ownership, complete text
   workbench, accessibility, and operator-shell/fullscreen integration.
5. TASK-143.04: browser resource lifecycle, exact realtime binding/recovery,
   captured context, voice UI, visual fallback, and real microphone smoke.

The plan is ready only when the independent reviewer returns exactly
`REVIEW_CLEAN` and explicitly confirms that the complete DAG is coherent and
granular enough for Luna to implement the majority of leaves without making a
cross-module architecture decision.
