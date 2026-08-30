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

The graph contains 53 implementation leaves:

| Milestone   | Leaf ownership                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-143.01 | Shared identities and browser DTO; exact protocol; child process; epoch; JSON-RPC transport; instructions; session; thread link; server gateway                        |
| TASK-143.02 | Private realtime package contract; browser media/WebRTC lifecycle; Archboard realtime adapter                                                                          |
| TASK-143.03 | Browser transport; assistant-ui adapter; thread link UI; timeline; composer; queue; ordinary approvals; coordinator disclosure; board status; frame; shell integration |
| TASK-143.04 | Voice presentation state; controls; context; transcript; voice-specific approval; frame integration                                                                    |
| TASK-143.05 | Wait graph; approval broker; six-tool catalogue; dynamic-tool dispatcher                                                                                               |
| TASK-143.06 | Semantic publisher; linked delivery; legacy control module removal; legacy command-surface removal                                                                     |
| TASK-143.07 | Coordinator lifecycle; queue policy; bound workhorse effects; callbacks; spoken gate; coordinator tool dispatcher                                                      |
| TASK-144    | Dependency seam; Tailwind build; semantic theme; shadcn configuration; class composition; native Oxfmt sorting; dialog; opener migration; aesthetic guide              |

Two modules intentionally have serial owners:

- TASK-144.02 establishes `src/ui/theme`; TASK-144.03 adds the semantic map.
- TASK-143.03.10 establishes `src/ui/workbench-frame`; TASK-143.04.06 adds
  voice after the text frame is accepted.

Their dependencies encode the order. No two active workers edit either module
at the same time.

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
