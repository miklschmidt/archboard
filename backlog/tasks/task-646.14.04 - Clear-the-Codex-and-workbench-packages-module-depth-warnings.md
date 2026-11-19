---
id: TASK-646.14.04
title: Clear the Codex and workbench packages' module-depth warnings
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T06:02:00Z'
updated_date: '2026-11-19T10:05:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646.14
type: task
ordinal: 1108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646.14, "archboard check passes on this repository again".

## What to build

The module-depth rules of TASK-646 flag this repository's own code, and the CI task `check:model` fails on any warning. This batch clears the warnings in: packages/codex-realtime-voice, packages/codex-app-server, packages/workbench. Count on feat/module-depth at a601dba760: 177 warnings: EXPOSED_UNUSED 99, EXPOSED_VALUE 77, REEXPORT_PASS_THROUGH 1.

Clear each finding with the seam the archboard skill names for it (skills/archboard/references/design-lens.md): move a value to its only reader, move the behavior that callers repeat into the module as a function, export a getter where a caller needs the value itself, stop exporting a name nothing outside uses (Rust: narrow `pub` to `pub(crate)` or private), and keep one door per name. The full check output: /tmp/nix-shell.KOyuFS/claude-1001/-home-msc-Projects-archboard/19a3ee13-20dc-4f34-ab5e-199cee6507ec/scratchpad/cc-final.json.

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: the modules bound under this batch's paths. The refactor changes code interfaces, not the model's relationships; a change that does alter a relationship, or a removed or renamed symbol that a vault anchor names, is reported to the orchestrator, who edits the vault.
- Gate: merge-time footprint as for every TASK-646 ticket; changes without architectural meaning are recorded exceptions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check code` reports no warning on a module bound under this batch's paths
- [x] #2 No lint, type, test or check rule, policy, waiver or exemption is weakened or added to pass
- [x] #3 Behavior is unchanged: the existing tests of the touched packages pass, and renderer output is identical where a crate draws
- [x] #4 Each removed or renamed symbol that a vault anchor names is reported with its replacement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. List the batch's warnings from the check (177 at a601dba760: EXPOSED_UNUSED 99, EXPOSED_VALUE 77, REEXPORT_PASS_THROUGH 1).
2. codex-app-server (56): stop exporting unused names; hide schemas and constants behind parse functions, predicates and getters; move single-reader values to their reader; update forced callers in codex-realtime-voice, workbench, apps/server, scripts/release and tests/system.
3. codex-realtime-voice (79) and workbench (42) in parallel by implementer sub-agents with disjoint scopes, same seams.
4. Run types, lint:all, format:check, test:modules, test:repository, test:system; merge the tip of refactor/module-depth-cleanup; rerun the check to show no warning left in the batch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
codex-app-server (798a8a6fa8): codexProtocolVersion() replaces CODEX_PROTOCOL_VERSION; the binary version moved into executable.ts; codexSessionThreadSource(), codexSessionControl(session), isQueuedSubmission(), parseCodexServerResponse(), parseSupportedLoginAccountParams(), codexFieldSchema(field), codexPendingReverseRequestLimit(), canonicalItemIdMaxLength() replace exported constants and schemas; jsonRpcErrorCode(kind), parseServerRequestParams(), isDynamicDispatcherOwner(), plainResponseOwner() keep the protocol and transport lists inside; createProcessOwner (process-owner.ts) replaces createCodexProcessForTesting; dead decodeClientNotification, decodeLoginAccountParams, isSupportedClientRequestMethod and CLIENT_NOTIFICATION_SCHEMAS removed. Tests outside the package type notification fixtures through the transport type and rebuild restored authorities in their own support. Calls that replaced value reads surface RELATIONSHIP_UNDRAWN (warning) on Codex protocol from Start and stop and Codex executable: the vault needs those relationships.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cleared all 177 module-depth warnings of the batch (EXPOSED_UNUSED 99, EXPOSED_VALUE 77, REEXPORT_PASS_THROUGH 1): codex-app-server (798a8a6fa8), codex-realtime-voice (994055e949..51f26f5446) and workbench (c0114fcb9d..906e88f332). Constants and schemas sit behind getters, parse functions and predicates; state such as the pane registry sits behind operations; names that only tests used are no longer exported. Interface ceilings lowered: codex-realtime-voice 83 -> 62, workbench 109 -> 98.

Verification: types, lint:all, format:check pass; test:modules 5223 pass, test:repository 174 pass, test:system 300 pass. archboard check code: no EXPOSED_*/REEXPORT warning on the batch's modules.

Open (vault work for the orchestrator, AC #1 unchecked until it lands): two RELATIONSHIP_UNDRAWN warnings appeared where calls replaced value reads: Codex protocol <- Start and stop and Codex executable (codexProtocolVersion), and Thread tools <- Thread tool calls, Thread tool settlements, Host wiring (archboardAppBinding, isReviewedCatalogue). Dead anchors: scripts/release/build.ts CODEX_PROTOCOL_VERSION -> codexProtocolVersion; resolver-turn.ts ResolveSpokenApprovalInputSchema -> parseResolveSpokenApprovalInput; voice-client.ts socketUrl -> open-voice-client.ts; archboard.ts ARCHBOARD_APP_DYNAMIC_TOOLS -> archboardAppDynamicTools; workbench context.ts ADDITIONAL_CONTEXT_POLICY -> additionalContextPolicy(); apps/server service-routes clients -> admittedClientCount; websocket-connection clients/noteTabSession -> admitSocket, handleBrowserMessage -> handleCodexBrowserMessage, placeOfVault/placeInstead -> vaultOfUpgrade (now in workbench); pane-routes panes -> registerPane; movePaneVault, arrivedOnModel and vaultOfUpgrade moved from apps/server into workbench (ANCHOR_MISMATCH).

Review points: the published codex-realtime-voice ./server still carries resolveCodexExecutable through a build-time addition in scripts/pack-codex-realtime-voice.ts, and workbench-example imports it from codex-app-server; some tests lost coverage (presentation-mode adapter checks, projection-mapping transition-table check, freeze assertions in dynamic-projection, strict schema in the codex-workbench system tests).
<!-- SECTION:FINAL_SUMMARY:END -->
