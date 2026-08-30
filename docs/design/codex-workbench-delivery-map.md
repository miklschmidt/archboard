# Codex workbench delivery map

**Planned:** 2026-08-30
**Scope:** TASK-143 and TASK-144 after TASK-140 merged into `main`

This document explains how to execute the Backlog graph. The task records own
the behavior, acceptance criteria, references, and dependencies. This map owns
only delegation and reconciliation, so an implementation detail changes in one
place: the active leaf's plan.

## Unit of delegation

An implementation leaf owns one named deep module or one narrow configuration
seam. Its tests live with that module or exercise its public interface. A leaf
does not resolve a neighboring module's policy, add a second state owner, or
change another leaf's contract implicitly.

The graph contains 74 implementation leaves: 57 under TASK-143 and 17 under
TASK-144.

| Milestone   | Leaf ownership                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-143.01 | Shared identities/browser DTO; ignore/generate/register exact protocol; process; epoch; transport; instructions; session; thread link; workhorse start; gateway/canvas |
| TASK-143.02 | Frozen realtime package/API; serialized root registration; boundary enforcement; browser media/WebRTC; sole Archboard realtime adapter                                 |
| TASK-143.03 | Browser transport; assistant-ui pin/adapter; owned thread/timeline/composer/queue/approval/coordinator/board UI; text frame; shell; browser owner                      |
| TASK-143.04 | Voice projection; controls; context; transcript; spoken approval; frame/fullscreen integration; controlled browser owner; inventory; real-audio acceptance             |
| TASK-143.05 | Wait graph; approval broker; six-tool catalogue; dynamic-tool dispatcher                                                                                               |
| TASK-143.06 | Semantic publisher; linked delivery; legacy control module removal; legacy command-surface removal                                                                     |
| TASK-143.07 | Coordinator/voice tool catalogue; coordinator lifecycle; queue policy; bound effects; callbacks; spoken gate; dispatcher                                               |
| TASK-144    | Serialized dependencies; aliases; theme/import/shell; shadcn; classes; Oxfmt/owner; dialog/opener/owner; guide/AGENTS/enforcement                                      |

The shared seams have explicit serial owners:

- TASK-143.01.13 registers protocol conformance, TASK-143.02.04 registers the
  private workspace, TASK-144.01 owns the accepted Tailwind/Base UI dependency
  set, and TASK-143.03.12 adds assistant-ui last.
- TASK-144.02 configures the Vite plugin/runtime alias, TASK-144.15 mirrors it
  in frontend TypeScript, and TASK-144.17 mirrors it in root TypeScript before
  shadcn configuration is accepted.
- TASK-144.03 creates `src/ui/theme/app.css`, TASK-144.13 imports it from the
  frontend, and TASK-144.14 migrates `shell.css` to consume its tokens.
- TASK-143.03.10 establishes `src/ui/workbench-frame`; TASK-143.04.06 adds
  voice after the text frame is accepted.
- TASK-143.03.13 and TASK-143.04.07 own separate text and voice browser tests;
  TASK-143.04.08 alone registers both in the canonical browser inventory.
- TASK-144.08 migrates opener settings and TASK-144.11 alone changes its
  existing browser owner.

Dependencies encode every order above. No two ready leaves own the same module
or configuration seam at the same time.

## Dependency waves

1. Establish shared identities, exact protocol inputs, private-package
   governance, authored instructions, and the one root dependency chain.
2. Build process/transport/session and Tailwind theme/resolver seams, then bind
   current-epoch threads and create the workhorse-start transaction.
3. Add approval/tool catalogues, semantic context, coordinator catalogue and
   lifecycle, queue policy, realtime package/media/adapter, and the browser
   gateway.
4. Implement one UI module per leaf against frozen ports. Text composition and
   shell integration precede voice composition and fullscreen projection.
5. Add the separate text and controlled-voice browser owners, register them
   once, run the real-audio acceptance procedure, and execute composed boundary
   reviews.

## Orchestration loop

1. Select only a leaf whose Backlog dependencies are Done. Read its task,
   referenced decisions, current module neighbors, and public tests.
2. Give one isolated worktree and one leaf to a `gpt-5.6-luna` worker. Use
   high reasoning for configuration or mechanical seams and xhigh or max for
   behavioral modules. The worker activates the task and records its researched
   implementation plan only then.
3. Keep implementation and focused verification inside the owned seam. Route a
   discovered cross-module contract change to the parent before code crosses
   the boundary.
4. Review the leaf independently with `gpt-5.6-sol`. The reviewer checks the
   leaf's task contract, module boundaries, reachable states, strict types,
   lint, formatting, and direct verification. Findings return to the same
   worker until clean.
5. Reconcile the reviewed commit into the integration branch, run the nearest
   downstream contract owners, and mark the leaf Done through the Backlog
   finalization workflow.
6. Close an integration milestone only after every child is Done and its
   composed public behavior passes. Run the complete `bun run check` before
   accepting TASK-144, TASK-143.01, TASK-143.03, and TASK-143.04, and once more
   for TASK-143.

The parent coordinator owns dependency selection, interface conflicts,
integration tests, review routing, and final reconciliation. A leaf worker owns
one module and does not coordinate peer work.

## Boundary reviews

Review composed seams after these milestone groups:

1. TASK-144: merged TASK-140 aesthetics, native Oxc enforcement, Base UI
   behavior, and unchanged shell/Excalidraw operation.
2. TASK-143.01: process, effective storage isolation, protocol/transport,
   session, thread-link, shared DTO, and browser gateway.
3. TASK-143.05-.07: approval identity, wait graph, tools, semantic delivery,
   queue, coordinator, callbacks, and spoken gate.
4. TASK-143.03: closed browser transport, ExternalStoreRuntime, complete text
   workbench, accessibility, and operator-shell integration.
5. TASK-143.02 plus TASK-143.04: browser resource lifecycle, exact realtime
   session binding, voice UI/recovery, and the real microphone/speaker smoke.

The plan is ready for implementation only when an independent plan reviewer
reports no inconsistent dependency or ownership seam and explicitly confirms
that every leaf supplies enough bounded context for a Luna worker to implement
and verify it without making a cross-module architecture decision.
