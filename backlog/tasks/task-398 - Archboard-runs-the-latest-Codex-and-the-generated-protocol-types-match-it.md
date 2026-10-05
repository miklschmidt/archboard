---
id: TASK-398
title: 'Archboard runs the latest Codex, and the generated protocol types match it'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-05 18:02'
updated_date: '2026-10-05 18:21'
labels:
  - codex
  - tooling
dependencies: []
references:
  - skills/archboard-dev/SKILL.md
  - .claude/rules/agent-work.md
priority: medium
type: chore
ordinal: 687000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard pins the exact @openai/codex that it runs, and every Codex fact in the code was read in that version source. The pin is 0.158.0 and the latest release is 0.160.0. With the pinned version, the ChatGPT account of the owner is refused the model gpt-6.1-sol, so the image tool and the other work that .claude/rules/agent-work.md routes through that model could not run. The owner asked for the latest Codex and refreshed generated types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pin in package.json, expectedCodexVersion in scripts/generate-codex-app-server-contract.ts and CODEX_PROTOCOL_VERSION in src/runtime/codex-protocol/lib/version.ts name the same release, and `bun run ensure:codex-contract` passes with the contract generated for it.
- [x] #2 Every change between the old and the new release that Archboard uses is named as adopted, ignored or a behaviour change: the app-server protocol shapes, the request processors for the methods it calls, the realtime code and the model list.
- [x] #3 `bun run type-check` passes without a weakened schema check, and nothing states a version that nobody re-read.
- [x] #4 A signed-in server answers one message, and the manifest holds the delivered thread start of the coordinator. The model gpt-6.1-sol is accepted with the new pin, or the reason it is not is recorded.
- [x] #5 The gate passes: lint, format, type-check, build, module, system, repository and the serial browser lane.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pick the version (the latest stable release is 0.160.0) and read its source at the tag rust-v0.160.0 in a worktree of the owner clone. 2. Diff what Archboard uses between rust-v0.158.0 and rust-v0.160.0: the app-server protocol, the request processors for the methods in src/runtime/codex-protocol/lib/methods.ts, realtime and the model list, and name each change as adopted, ignored or a behaviour change. 3. Bump the three pins and let bun install generate the new contract beside the old one. 4. Adapt the handwritten schemas until type-check passes, never the checks, and add each new required field to the fixtures. 5. Re-read every claim that names a Codex version. 6. Run the whole gate, then smoke a signed-in server with one message and check the model gpt-6.1-sol. No board is affected unless the Codex integration boards state a version.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence, 2026-10-05. 0.160.0 is npm latest and the newest stable release (published 2026-10-01). The tag rust-v0.160.1 is a Windows MCP backport that is not on npm. Pins: package.json, expectedCodexVersion in scripts/generate-codex-app-server-contract.ts, and CODEX_PROTOCOL_VERSION with CODEX_PROTOCOL_BINARY_VERSION in src/runtime/codex-protocol/lib/version.ts. I checked after bun install: the pinned binary reports codex-cli 0.160.0, `bun run ensure:codex-contract` and `bun run type-check` exit 0, lint and fmt:check exit 0, 693 Codex module tests and 19 repository tests pass, and `codex exec -m gpt-6.1-sol` with the pinned binary printed model gpt-6.1-sol and answered, so the account accepts the model now. Changes between rust-v0.158.0 and rust-v0.160.0, as the implementing agent read them in the source (I did not diff the Codex source myself): the error code tooManyDenials (adopted in core-schemas.ts); the thread/items/list cursor may be an opaque string or an item anchor (adopted in client-request-schemas.ts, Archboard sends null); an interrupted turn can carry an error when the auto-review circuit breaker runs in strict mode, which Archboard does not set (behaviour change, one comment corrected); mcpServerStatus/list serverName and the archive change (ignored, not called); other app-server changes (ignored); realtime unchanged except an internal refactor; the model list keeps gpt-6-sol with low effort and gains gpt-6.1-sol as the default model (ignored, Archboard names its models). Only the fake Codex production fixture needed new literals. Every re-read claim now names 0.160.0, and the remaining 0.158.0 hits are history or a measurement. The agent ran every gate lane (lint, fmt:check, type-check, build:frontend, test:modules 3924, test:system 189, test:repository 19, serial browser 19 owners) and a signed-in server on a scratch copy of web-shop answered one message, with the coordinator thread start recorded delivered in the epoch manifest. I repeated only the lint, format, type-check, Codex module, repository and model checks. Side effect: the bump edits comments under src/ui, and the README asset hash covers src/ui, so readme:check lists the clips and the narrated assets as stale until they are made again.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned Codex 0.160.0, the latest stable release, in the three places, regenerated the protocol contract for it and adapted the two schemas that its changes touch, without changing a type-proof check. Moved every re-read Codex claim to 0.160.0. The whole gate passes, a signed-in server answered a message, and the account now accepts gpt-6.1-sol with the pinned binary.
<!-- SECTION:FINAL_SUMMARY:END -->
