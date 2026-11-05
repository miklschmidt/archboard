---
id: TASK-578
title: Archboard runs Codex 0.166.0, and the generated protocol types match it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-05T14:54:00Z'
updated_date: '2026-11-05T15:34:00Z'
labels:
  - codex
  - tooling
dependencies: []
references:
  - docs/agents/codex-upgrades.md
priority: medium
ordinal: 1021000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard pins the exact @openai/codex that it runs, and every Codex fact in the code was read in that version source. The pin is 0.160.0 and the newest stable release is 0.166.0 (rust-v0.166.0, 2026-10-29). The owner asked for the upgrade as its own pull request, which must merge before the npm release work on fix/core-build-feedback, so the change stays limited to the Codex upgrade. docs/agents/codex-upgrades.md is the procedure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The pin in package.json, the expected version in scripts/generate-codex-app-server-contract.ts and the protocol version in packages/codex-app-server/src/runtime/protocol/protocol-version.ts name 0.166.0, and `bun run ensure:codex-contract` passes with the contract generated for it.
- [ ] #2 Every change between rust-v0.160.0 and rust-v0.166.0 in the areas that the upgrade guide lists is named as adopted, ignored or a behavior change.
- [ ] #3 Type-check passes without a weakened schema check, and fake servers and fixtures carry the new required fields and version literals.
- [ ] #4 A signed-in test server of this worktree on a scratch copy of examples/web-shop answers one message, with coordinator and workhorse started, and the server is stopped afterwards.
- [ ] #5 `bun run check` passes, or every lane after an early stop passes when run alone.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. bun install and bun run build inside nix develop at the 0.160.0 pin; keep the generated contract. 2. Review rust-v0.160.0..rust-v0.166.0 in the four areas of docs/agents/codex-upgrades.md and record adopt/ignore/behavior change per relevant change. 3. Bump the three pins and regenerate. 4. Adapt handwritten schemas, fake servers, fixtures and version literals; re-read every version claim. 5. bun run check, then the remaining lanes if it stops early. 6. Live trial on a scratch web-shop vault with this worktree's server, then stop it. 7. Review, push, PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Upstream review, rust-v0.160.0..rust-v0.166.0 (Codex clone at ~/Projects/codex). 0.166.0 is npm latest and the newest stable GitHub release (2026-10-29). Four read-only review agents read the four areas of docs/agents/codex-upgrades.md. I re-read at the source each change that moved code: the transcript tail, thread/readState/changed and its publish path, the opt-out filter, Account, CodexErrorInfo, GeneratedImageRef, MessagePhase::PartialAnswer, the models.json entries, and the unchanged realtime files.

Adopted (schema or behavior):
- New CodexErrorInfo codes modelNotFound and policyCapacityUnavailable. The generated Other variant now types any string or object, so the schema accepts those too (Codex still writes "other").
- New hook events preModelRequest and postModelRequest.
- PlanType sci and sci_plus. Account.chatgpt.workspaceName (always present, nullable). New account variant gcp, shown in the dock as Google Cloud Vertex AI.
- MessagePhase partial_answer. The explanation capture treats it as answer text, like final_answer.
- imageGeneration item: the result is inline data or an attachment file (fileId), plus generationId and inputImages.
- subAgentActivity item: model and reasoningEffort. Turn.rootTurnId.
- thread/list readStates and thread/read readState (experimental, always present for an experimental client).
- configRequirements/read: supportsIndependentSpeedModes, otel, application storage, browser-use extension, network reviewDomains, PreModelRequest and PostModelRequest hooks. MisalignmentErrorDetails.reviewTarget.
- ResponseItem additional_tools and encrypted_content/status fields. ContentItem output_text annotations and logprobs.
- thread/realtime/start voiceSessionId (optional, not sent). The realtime voice enum gains the new voices. cove remains.
- New notification thread/readState/changed. Codex publishes it before turn/completed on every finished turn of a user thread, and the decoder refuses unknown methods. Archboard keeps no read state, so initialize now opts out of it (optOutNotificationMethods).

Behavior changes, no code change:
- The realtime transcript tail at session end is now saved to history without a turn (transcript_tail.rs). Before, it started a coordinator turn. The unload comment now says so. The unload wait logic still holds.
- turn/start and turn/steer now report a core InvalidRequest as JSON-RPC invalid_request, not internal_error. thread/list now fails a repeated store cursor. thread/unsubscribe tears down only when no subscriber is left, and unload no longer gives up after 10 s.
- model/list reloads its catalog after login and logout. The coordinator reads model/list when it starts, so it gets the fresh list.
- Starting a realtime session over a live one now closes the old one with thread/realtime/closed. V3 transcript trimming drops the least recent speech first.
- A PartialAnswer message skips the BEM header and is spoken as it is (authored.ts comment).

Ignored (not used by Archboard):
- New client requests: thread/sample, thread/sample/cancel, thread/prediction/request, thread/attachmentOwner/list, thread/memory/read, thread/readState/update, thread/items/read, account/gcp/setup, account/bedrock/checkGovCloudRequirements, accountSession/list, accountSession/switch, feedback/save.
- New optional request params: turn/start parentTurnId, rootTurnId and responsesapiClientMetadataPatch; AdditionalContextEntry.name; TurnToolOutput.retain; thread/list excludedThreadIds and attachedToThreadId; thread/fork prediction and attachToSource; thread/goal origin; environment/add fields.
- thread/prediction/updated (declared, and the app-server has no emitter at 0.166.0).
- ThreadItem startedAtMs and completedAtMs on every item (optional in the generated type; Archboard reads them from ThreadItemEntry).
- process/exited outputDrainTimedOut, mcpServer oauth loginId, McpServerStatus.toolListMeta, ThreadUsage.nativeUsageUsdMicros, ModelProviderCapabilities namespaceTools removal, review/start detached delivery removal, fork permission-profile inheritance, config/read OTel header redaction, logout MCP credential cleanup.
- Models: gpt-6-sol (coordinator, low) and gpt-6-astra (workhorse, medium) keep the same efforts, defaults and visibility. gpt-6.1-terra is new. Catalog origins, originator partitions and fetch-failure changes do not reach Archboard's default-originator model/list.
- Realtime: sideband cancel and 404 retry, the voice-session-id header, the V3 voice list.

Found but outside the bump: ImageGenerationItem.transparentBackground has serde(default) without skip_serializing_if, so Codex writes null when it is unset, while the generated type says optional boolean. This was the same at 0.160.0. The schema keeps the generated type.

Re-read claims: every comment that cites Codex 0.160.0 behavior was re-read at 0.166.0 and now names 0.166.0 or the range 0.160.0 to 0.166.0. The voice package README pins 0.166.0. docs/design/codex-workbench-authored-contracts.md keeps 0.160.0 as its dated reviewed input.

Live trial, 2026-11-05: this worktree's own server on port 16038 (not 3000), started with ARCHBOARD_REPOS set to a scratch registry and the default state directory for the Codex sign-in, on a scratch copy of examples/web-shop at <scratchpad>/trial/.archboard/vault, imported with -C. The server's Codex child is node_modules/@openai/codex-linux-x64 and reports codex-cli 0.166.0. One message sent from the browser ('In one sentence, what does the Checkout API module do?') was answered ('The Checkout API handles orders by reserving stock, charging the shopper's card, and sending a receipt before returning a response.'). The epoch manifest of the run records the coordinator thread/start and the workhorse create_thread as committed and delivered. The server was stopped after the trial. Gate: bun run check passed every lane up to the serial browser lane. In that lane, canonical-model-corrections failed once and codex-text-workbench timed out once under the full lane. Both passed in three focused runs (run-browser-lane.ts --focus), and the full lane rerun failed only codex-text-workbench.
<!-- SECTION:NOTES:END -->
