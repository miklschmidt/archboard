---
id: TASK-517.02
title: Extract the shared workbench server and browser interfaces
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 11:38'
updated_date: '2026-10-24 13:55'
labels: []
dependencies:
  - TASK-517.01
parent_task_id: TASK-517
priority: high
type: task
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A second application needs a small public entry that owns the agent machinery and media lifecycle. The existing exports expose internal composition and Archboard transport requirements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One reusable workspace package exposes public server and browser interfaces without importing Archboard domain modules.
- [ ] #2 Archboard uses the shared implementation and retains its visual shell and domain integration.
- [ ] #3 Moved implementations and tests have one owner, and package direction and browser safety remain enforced.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This delivery contributes package and browser separation to the parent proposals: Archboard@TASK-517; Agent workbench@TASK-517; Voice coordinator@TASK-517; Codex workhorse@TASK-517; Codex session@TASK-517; Browser application@TASK-517; Archboard server@TASK-517.
1. Move reusable runtime, server composition, shared contracts, and their tests into packages/agent-workbench.
2. Expose one server factory that owns startup, shutdown, sessions, browser connections, conversation activation, and snapshots.
3. Move browser media and output metering into the same package behind a browser-safe entry.
4. Keep the Archboard shell, board projections, domain context, narration, pane services, and application wiring in packages/workbench.
5. Update callers through explicit package exports. Delete moved implementations and avoid compatibility or duplicate execution paths.
6. Update package layers and documentation without weakening dependency direction, browser safety, lint, or type rules.
7. Run the relevant behavior and package-contract owners, simplify the interface, and commit with Refs: TASK-517.02.
The parent owns board adoption, the complete gate, review, and final acceptance evidence.

Implementation split: the backend implementer owns reusable runtime and server code, the mixed generation/session contracts, and Archboard backend wiring. The parent owns all shared browser contracts, media clients, UI callers, package manifests, dependency policies, and ownership docs. The exact source map is /tmp/task517.01-host-separation-handoff.json. Shared realtime contracts move once to the new canonical owner.

Move the existing domain-free browser transport, wire parsing, and targeting rules into the shared browser entry. Preserve the lease, stale recovery, and unknown-outcome owners so the second app does not duplicate authority logic.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent moved 18 shared implementation files, 14 browser media and output files, and 23 test or support files into agent-workbench. The integration now imports those declarations through public entries. The core voice presentation payload is JSON; Archboard retains its strict walkthrough and recording schema. All 666 isolated UI and shared cases passed. Browser types and scoped UI/shared lint passed. The new package sits at layer 6, with an explicit foundation dependency contract. The final integration pass will remove public exports without an outside caller after backend imports converge.

Moved the domain-free browser transport, wire parser, lease and target logic, plus the transport-to-media owner, into agent-workbench. Archboard imports the factories directly. The host voice adapter now serializes its narration payload before starting shared media. All 666 isolated browser/shared cases passed after these canonical moves. The shared implementation retains stream recovery, exact start leases, unknown outcomes, and media cleanup.

Removed temporary public names without outside callers. The shared entries now expose 29 contract names, 13 realtime names, and 18 browser names. Browser types pass after pruning. Package graph/API owners passed all 79 cases. The updated Browser application proposal shows the shared media owner in the agent workflow view; its PNG was rendered and inspected at /tmp/task517-browser-agent-updated.png.

Removed generic snapshot/model/realtime reexports from the Archboard browser-contract entry. Browser callers now use the shared package directly; the host entry retains only Archboard conversation routes and narration contracts. The backend public-factory smoke passed with root-only storage, normal host inputs, separate coordinator/workhorse directories, and no server, board, or vault. Backend final focused validation remains active.

Independent scoped reviews fixed queue source provenance, voice subscription cleanup, core instruction and reserved-tool capture, semantic output type duplication, and canonical private-path ownership. Boundary identity and default-context reviews found no behavior defects. Parent updated the retained integration catalogue snapshot and exact reviewed workhorse digest after the generic tool description change. The catalogue owner passes. Server lifecycle and core/host boundary reviews remain active; complete gate follows their commits.

All seven final backend scopes and interface reviews completed. Fixes: fb7125cfe aligns queue provenance; 374cade2d releases voice subscriptions once; b9f1e265f preserves core role and reserved-tool contracts; 11ffc424c clarifies admitted checkout guidance; 100a43b65 derives realtime correlation; b510fc361 derives semantic output types; bad2c29ec centralizes storage paths; a062c3c4d guards startup during shutdown; cc10e7c75 captures mutable process inputs once and rejects replaced sockets. Focused regressions passed in each scope. Identity/voice and runtime/server reviewers found no additional behavior defects. The parent reviewed shared/browser changes and repaired malformed-presentation admission through the backend implementer. Complete bun run check now runs in /tmp/task517.02-check.log with system Chromium. No public interface or behavior acceptance is closed before that gate passes.

The first complete gate failed formatting in routing.ts. Remaining normal lanes exposed the removed README asset source and a startup preload importing the removed application module. Modules passed 4937 cases with one skip, browser passed all 19 owners, source types and frontend build passed. TASK-521 fixes metadata/formatting; TASK-522 fixes the preload. Both repairs preserve normal owners and assertions. The full gate will run again after their commits.
<!-- SECTION:NOTES:END -->
