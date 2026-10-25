---
id: TASK-530.04
title: Codex tool namespaces and record prefixes are host identity
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T02:24:00Z'
updated_date: '2026-10-25T04:11:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 950000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-530.01 made the service name and thread source host options, but the coordinator tool namespaces (archboard_workhorse, archboard_voice, archboard_coordinator), the coordinator tool description that says users talk with Archboard by voice, the spoken-approval classifier prompt naming archboard_voice, and the archboard: record prefix (WIRE_PREFIX in codex-app-server) and the app-server client name are still hard-coded. Manifests and digests are module-level constants registered by installDynamicRegistrations, and about ten call sites compare literal names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An outside host's Codex threads, prompts and stored records carry no Archboard name unless the host supplies it
- [x] #2 Archboard passes its existing names and its thread profiles, manifest digests and stored records stay byte-identical
- [x] #3 Incoming tool calls are matched by role, not by a literal Archboard name
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Branch voice/host-namespaces (9897f14d9, merge 284ab95c1 of feat/reusable-codex-workbench, 057c6650f).

Done: VoiceAgentIdentity is { serviceName, threadSource, productName, toolNamespaces: { workhorse, voice, coordinator } }; a host passes a Partial and each value it leaves out is DEFAULT_VOICE_AGENT_IDENTITY's (codex-realtime-voice, codex-realtime-voice, Codex, voice_workhorse / voice_channel / voice_coordinator). The three manifests are role-keyed templates (workhorse.json, voice.json, coordinator.json) pinned by template digest; createVoiceToolset (runtime/rules/host/toolset.ts) fills them with the host's names and hashes the bytes Codex is given. Profiles, transport registrations (coordinatorDynamicDispatchers), coordinator review hashes, the callback description and the spoken-approval classifier prompt (<product-name>, <voice-namespace>) read the host's names. Incoming calls are matched by role via toolRoleOf (name and manifest digest): dispatcher validation, call-identity, call-execution, resolver-validation, workhorse-operations validation, delegatedCheckout. Validated calls carry role; input fingerprints still hash the wire namespace, so Archboard's replay evidence is unchanged.

Archboard passes its names: profile digests unchanged; catalogue.test.ts pins 22124bd3/04531fce/dc259407 for its filled manifests; classifier.test.ts pins its prompt digest 1873dd20 (restored after TASK-530.01 had dropped 'for Archboard. The Archboard server'); archboard-profiles.test.ts pins the names. The browser dynamic-approval schema keeps a namespace pattern: the namespace is part of the approval identity a decision must match.

Checks: type-check 0, lint 0, pack:voice 0; bun test --isolate packages/codex-realtime-voice packages/workbench/tests apps/server/tests tests/system/repository-policy tests/system/server-state/workbench-example.test.ts tests/system/server-state/standalone-codex-workbench.test.ts: 1738 pass 0 fail; voice-package.test.ts 1 pass. Interface widths unchanged (voice 132, app-server 121).

Left (AC 1 not met): the record prefix. WIRE_PREFIX = 'archboard' in packages/codex-app-server/src/shared/schemas/identity-values.ts still spells every <prefix>:<domain>:<token> identity, copied as ^archboard: regexes in voice record-shape.ts, manifest-scalars.ts and epoch-identity.ts. Planned shape: createIdentityLedger(prefix) mints the child with the host's prefix, every other server-minted value takes the ledger child's prefix, parsing accepts a prefix-shaped first segment, and VoiceAgentIdentity gains recordPrefix (default voice, Archboard archboard) passed through the generation bindings to createIdentityLedger. Also left for TASK-530: about 60 browser copy strings in packages/codex-realtime-voice/src/ui say 'The Archboard server'.

Second part, branch voice/host-record-prefix (3eede5bca record prefix, 682713dd0 wording). createIdentityLedger(recordPrefix) mints the child with the host's prefix; every identity the ledger spells copies the child's prefix; parsing accepts any first segment of the shape [a-z][a-z0-9-]{0,15}, and an epoch belongs to its child only under the same prefix. The limit is 16, not 32: the longest operation id must stay within OPERATION_ID_MAX_BYTES 128 (workbench-identity.test proves it at 16). VoiceAgentIdentity.recordPrefix (default voice, Archboard archboard) reaches the ledger through ProductionCodexWorkbenchBindings.recordPrefix. createIdentityAuthorities() with no ledger uses the unnamed prefix codex (tests only). Archboard: archboard-profiles.test pins recordPrefix archboard beside its unchanged profile digests. Wording: UI copy says the server, the workbench or this page; the default decline reason is Declined at the workbench.; comments that meant this client or workbench are reworded. Remaining hits: 256 @archboard/ imports, 2 first-host comments (server.ts:19, storage.ts:125). AC1 evidence: packages/codex-realtime-voice/tests/runtime/rules/host/unnamed-host.test.ts, which fails when the default prefix is archboard. Nine voice UI tests still pin copy by exact text; their literals were updated, not rewritten. Checks: type-check 0, lint 0, pack:voice 0, named test list 2407 pass 0 fail.
<!-- SECTION:NOTES:END -->
