---
id: TASK-653.11
title: >-
  Codex app-server opens a connection, reads a failure and decodes a frame
  through one operation each
status: Done
assignee: []
created_date: '2026-11-19T17:33:00Z'
updated_date: '2026-11-19T23:17:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.10
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 8 of the archboard-deepen run. packages/codex-app-server is wide (25 names, seven of them failure classes callers test with instanceof), and its protocol folder is wide (34 names used outside it): callers assemble a connection from a process, an epoch and a transport, and decode frames with throwing helpers. The package hands out one connection operation, one failure reader and a few result-returning frame decoders. The settled design, every decision and its reason: the "Candidate 8, Codex app-server: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-08-codex-app-server.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: codex-app-server (packages/codex-app-server), Codex protocol (packages/codex-app-server/src/runtime/protocol), and their callers in packages/codex-realtime-voice (server/generation/services/factories.ts and the voice kernel) and packages/workbench.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on codex-app-server and Codex protocol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 codex-app-server has width 16 and the protocol folder 8 (decodeFrame, decodeFrameBody, encodeFrame, decodeClientRequestParams, decodeResponse, ProtocolDecodeError, isClientRequestMethodWithoutParams, codexProtocolVersion); INTERFACE_WIDE clears on both
- [x] #2 openCodexConnection({ child, recordPrefix }) returns a plain-data CodexConnection (child, epoch, identity, transport) with no function-valued member, openCodexSession(connection, options) returns { session, control }, and dynamic dispatchers are registered after open, so a child that already exited throws no namespace TypeError
- [x] #3 readCodexFailure(error) reads only the supplied value and walks no cause (startup keeps its own walk); createCodexFailure(spec) builds the mutation, process, refused-write and remote kinds with the message in the spec; a round-trip test holds; the seven exported classes are gone and their name and message strings are unchanged
- [x] #4 Workbench keeps its own duck-typed outcome fallback, defaulting to not_delivered, and voice defaults to outcome_unknown
- [x] #5 decodeFrameBody returns a result and runs after the router's capacity check, encodeFrame returns a result with its refusal reason, the router keeps its state and every issue text, and one transport test sends a frame that breaks several rules and asserts which wins
- [x] #6 The packed codex-realtime-voice declaration diff is recorded per entry as removed, added and changed public names for the release notes (owner decision 22), not required empty; replaceIdentity is removed from CodexTransport with its dead call and the ?? fallbacks; there is no npm release in this ticket
- [x] #7 A short ADR records that failures are read, not class-tested, that the reader walks no causes and that the process stays apart from the connection; CONTEXT.md defines Codex connection
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Branch deepen/653-11-codex-app-server. Commit e4195f1f39 (protocol): decodeFrame/decodeFrameBody/encodeFrame; the protocol folder is used outside through exactly the eight settled names; precedence test in transport-malformed-routing.test.ts. Commit 9d7a2a2b94 (connection, checkpoint): openCodexConnection/openCodexSession, voice kernel is the CodexConnection, replaceIdentity and the ?? fallbacks gone (owner update), createCodexProcess absorbs createProcessOwner; test:modules 5372 pass, types clean.
BLOCKED on D10: 16 ui-area test files (voice tests/ui 8, workbench tests/ui 7, workbench-example tests/ui 1) minted identities through createIdentityAuthorities on the shared ./identity entry. The connection is a runtime entry, and the import-boundaries lint (ui imports shared only) refuses it from tests/ui. Options: (A) keep createIdentityAuthorities() on ./identity for ui tests: width 17 and a test-only export; (B) ui tests stop minting through an authority: voice ui tests use the browser's own wire identity context (src/ui/wire/clients/wire-identity.ts, the production browser seam), workbench and example ui tests brand fixture strings; (C) another design. Awaiting the advisors. Commit 3 (failures) not started.

Resumed after the advisors settled the stop (decisions.md, TASK-653.11 stop: SETTLED). A: wire-identity.ts moved to codex-realtime-voice src/shared/browser/schemas; createCodexBrowserModel() without a context is the browser's model; ui and shared tests in voice, workbench and the example brand ids through it (browserIdentities helpers); ledger refusals of foreign and stale identities moved to tests/server/dynamic-approval/schemas/identity-refusals.test.ts on a connection-backed model; session-support replaceIdentity deleted. B: encodeFrame validates, then calls a transport-supplied allocateId that checks the cap before minting; order closed, method, params, cap, mint; new adversarial test. C: criterion 6 rewritten (owner decision 22). Failures: readCodexFailure/createCodexFailure in ./failure, the seven classes off the interface with names and messages unchanged; isCodexThreadStatusType folded into its two callers; ADR 0089; CONTEXT.md Codex connection. Width ceiling 108 -> 81.
Code check: codex-app-server 16 functions (logic 7719, was 25 names / 7622); Codex protocol 8 names used outside (logic 2074, was 34 / 1965); no finding on either. Two anchors in the vault now name symbols the code no longer uses: Generation composition -> Frame transport (createCodexTransport in voice workbench.ts; now openCodexConnection) and Inbound protocol router -> Codex protocol (decodeServerNotification in inbound-router.ts; now decodeFrame/decodeFrameBody). The vault is left unchanged for the proposal.
Packed voice declarations, per entry, base -> branch: schemas: changed createCodexBrowserModel (context is optional); server: changed VoiceAgent, VoiceAgentBrowserPort, VoiceAgentExtensions, VoiceAgentOptions, liveWorkhorseCheckouts (CodexTransport lost replaceIdentity; SessionResponsePayloads is spelled through the response schema map). No public name removed or added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
codex-app-server is used through 16 names and its protocol folder through 8. Callers open a Codex connection (openCodexConnection, openCodexSession) instead of assembling a ledger, authorities, a transport and a session; read failures with readCodexFailure and make them with createCodexFailure instead of testing seven classes; and the transport decodes and encodes frames through decodeFrame, decodeFrameBody and encodeFrame with the router's state, precedence and issue texts unchanged and a refused request minting no id. The voice owner's kernel is the connection, replaceIdentity and the dead fallbacks are gone, browser-side tests brand ids through the browser's own model, and ADR 0089 records the decisions. Verified: build, types, lint:all, format:check, test:modules (5381 pass), test:repository (182), test:system (228), test:solo (15), browser owners codex-text-workbench, codex-live-voice, voice-box, voice-box-presented, canonical-model-agent-navigation, the startup-sentence tests, the per-entry pack diff and the code check. Follow-ups: two vault anchors to retarget in the proposal; one realtime process test timed out once under parallel load and passes alone.
<!-- SECTION:FINAL_SUMMARY:END -->
