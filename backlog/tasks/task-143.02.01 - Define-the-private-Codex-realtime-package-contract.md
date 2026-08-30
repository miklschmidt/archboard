---
id: TASK-143.02.01
title: Define the browser-native Codex realtime contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 19:12'
labels: []
dependencies: []
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/codex-realtime/lib/contract.ts
  - src/ui/codex-realtime/index.ts
  - src/ui/codex-realtime/tests/contract.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the framework-neutral host/browser types and frozen public state-machine contract in src/ui/codex-realtime/lib/contract.ts, exported only by src/ui/codex-realtime/index.ts. It contains no Codex wire types, Archboard identities, React, assistant-ui, Node, or implementation globals.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The sole public index exports the host interface for createOffer SDP, answer SDP, remote media attachment, semantic events, and stop/recovery commands through opaque session/correlation values rather than Codex-generated types.
- [ ] #2 Closed states cover idle, requesting_permission, negotiating, listening, muted, processing, speaking, stopping, recoverable_error, terminal_error, and closed with explicit allowed transitions and reasons.
- [ ] #3 The contract exposes canonical item-scoped transcript records and delivered/not_delivered/outcome_unknown append outcomes but owns no transcript reduction or retry policy.
- [ ] #4 Tests consume only the public index and reject illegal transitions, caller-selected remote identity, WebSocket/audio-chunk APIs, React/assistant-ui/Node imports, and mutable internal handles.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define browser-only opaque branded values for realtime sessions, correlations, item identities, and SDP envelopes; keep all request/response records readonly and free of Codex, Archboard, React, assistant-ui, Node, transport, and implementation-handle types.
2. Define the closed realtime phase union and a deeply frozen transition table whose entries name allowed destination phases and reasons; expose pure transition validation without retaining mutable session or transcript state.
3. Define the host port for correlated offer/answer exchange, remote-media attachment, semantic-event subscription, text/speech append outcomes, and stop/recovery commands. Model canonical item-scoped transcript records without reduction, deduplication, or retry policy.
4. Export the contract only through src/ui/codex-realtime/index.ts and write public-index-only tests covering the closed API, legal/illegal transitions, frozen data, opaque identities, remote identity rejection, and forbidden WebSocket/audio-chunk/framework/runtime imports.
5. Run focused tests, both strict TypeScript projects, lint/format and the relevant boundary checks; audit the fixed BASE..HEAD path set and commit the complete leaf.

Remediation: split append and command delivery outcomes into distinct discriminated unions with disjoint definite-failure versus uncertainty reason literals; make the lifecycle graph canonical by routing all disposal and terminal cleanup through stopping -> closed; replace the source regex sample with an AST-backed audit of the public index and private contract plus negative source fixtures for every forbidden dependency/API family. Keep all changes inside the three named module files and this task record, then rerun the focused and invalidated gates against the unchanged base.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research checkpoint: the target module was absent at reservation HEAD 8032ba687a133fd1fa84cf7e889f7d8bae086e71. The named UI-library research and realtime design keep Codex app-server reduction in src/runtime/codex-realtime and browser media/WebRTC in the next leaf, so this contract will expose only framework-neutral browser/host ports. The contract will use host/correlation/item opaque values and caller-independent remote media attachment, with a frozen phase transition table and no module state. No status, assignee, acceptance criteria, dependency, or sibling record will be changed.

Implementation checkpoint: added the browser-only contract under src/ui/codex-realtime/lib/contract.ts and re-exported it explicitly from src/ui/codex-realtime/index.ts. The public port covers correlated offer/answer SDP, capability-based remote media attachment without a remote identity field, semantic event subscription, text/speech append, stop, and recovery. The state vocabulary has 11 phases and a deeply frozen transition table with reason-specific checks; transcript records are immutable and item-scoped; append and command outcomes remain delivery facts only. Tests import product types only from the public index and source-scan for transport/framework/runtime leakage. Focused test, lint, fmt:check, both strict TypeScript projects, all module tests, and repository-policy tests are green.

Reviewer remediation requested from parent after aa79d66218f29b5a8575d7e54716b223e0bdb686: (1) impossible outcome tag/reason pairs must fail at compile time, with CommandOutcome distinct from AppendOutcome; (2) every declared phase/reason must be reachable from an explicit edge, with one stopping -> closed disposal path and exhaustive edge tests; (3) the dependency guard must parse AST imports and dynamic imports, identifiers, transport/API spellings, and caller-selected remote identity, and prove its own rejection behavior with negative fixtures. The fixed BASE remains 8032ba687a133fd1fa84cf7e889f7d8bae086e71.

Reviewer remediation completed on fixed BASE 8032ba687a133fd1fa84cf7e889f7d8bae086e71: outcome unions now separate definite non-delivery reasons from outcome-unknown reasons, and CommandOutcome is a distinct union; RealtimeTransitionReason is derived from RealtimeState and the transition table is destination-phase typed, with all disposal and terminal cleanup routed through stopping to closed and recovery_failed represented explicitly; contract tests now exhaustively exercise every declared edge/destination reason and AST-audit the public index/contract with 15 temporary negative fixtures covering React and assistant-ui static/dynamic package and subpath imports, node: and bare Node builtins, Buffer/process, WebSocket/audio-chunk/transport handles, Codex/Archboard wire imports, and caller-selected remote identity. Temporary fixtures are removed after each run. Validation all exited 0: focused contract suite 7 pass/312 expectations; bun run type-check; bun run lint; bun run fmt:check; focused boundaries/module-scope policy 17 pass/87 expectations; bun run test:modules 441 pass/3547 expectations; bun run test:repository 118 pass/363 expectations; test file remains 494 lines. No task status, acceptance criteria, assignee, or final summary changed.
<!-- SECTION:NOTES:END -->
