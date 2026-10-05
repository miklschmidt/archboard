---
id: TASK-398
title: 'Archboard runs the latest Codex, and the generated protocol types match it'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-05 18:02'
updated_date: '2026-10-05 18:02'
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
- [ ] #1 The pin in package.json, expectedCodexVersion in scripts/generate-codex-app-server-contract.ts and CODEX_PROTOCOL_VERSION in src/runtime/codex-protocol/lib/version.ts name the same release, and `bun run ensure:codex-contract` passes with the contract generated for it.
- [ ] #2 Every change between the old and the new release that Archboard uses is named as adopted, ignored or a behaviour change: the app-server protocol shapes, the request processors for the methods it calls, the realtime code and the model list.
- [ ] #3 `bun run type-check` passes without a weakened schema check, and nothing states a version that nobody re-read.
- [ ] #4 A signed-in server answers one message, and the manifest holds the delivered thread start of the coordinator. The model gpt-6.1-sol is accepted with the new pin, or the reason it is not is recorded.
- [ ] #5 The gate passes: lint, format, type-check, build, module, system, repository and the serial browser lane.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pick the version (the latest stable release is 0.160.0) and read its source at the tag rust-v0.160.0 in a worktree of the owner clone. 2. Diff what Archboard uses between rust-v0.158.0 and rust-v0.160.0: the app-server protocol, the request processors for the methods in src/runtime/codex-protocol/lib/methods.ts, realtime and the model list, and name each change as adopted, ignored or a behaviour change. 3. Bump the three pins and let bun install generate the new contract beside the old one. 4. Adapt the handwritten schemas until type-check passes, never the checks, and add each new required field to the fixtures. 5. Re-read every claim that names a Codex version. 6. Run the whole gate, then smoke a signed-in server with one message and check the model gpt-6.1-sol. No board is affected unless the Codex integration boards state a version.
<!-- SECTION:PLAN:END -->
