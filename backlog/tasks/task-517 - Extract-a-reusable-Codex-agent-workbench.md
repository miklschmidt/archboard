---
id: TASK-517
title: Extract a reusable Codex agent workbench
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 11:37'
updated_date: '2026-10-24 14:38'
labels: []
dependencies: []
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0055-packages-own-behavior-and-apps-compose-it.md
priority: high
type: feature
ordinal: 925000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants a second application to use the same live voice, coordinator, and checkout workhorse design. The current workbench package requires Archboard boards, vaults, panes, and prompts. A reusable workbench lets both applications share the lifecycle and authority rules. This work keeps Codex explicit and keeps the Archboard visual shell in its host integration. Package publication and support for other model providers are outside this work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Archboard and a second minimal application use one shared Codex workbench implementation through public server and browser interfaces.
- [ ] #2 The second application starts without an Archboard server, board, or vault and supports voice, conversation, checkout workhorses, and approval handling.
- [ ] #3 The reusable implementation owns lifecycle, queues, routing, transcript recovery, and approval authority. Its host supplies domain instructions, context events, tools, and allowed checkouts.
- [ ] #4 Exact session identity, unknown delivery outcomes, spoken approval settlement, coordinator retirement, and independent voice and workhorse stop behavior retain meaningful behavior coverage.
- [ ] #5 The complete bun run check gate passes, reviewers commit fixes, and the affected architecture boards describe the implementation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
The owner approved this architecture and its implementation in the conversation.
Material value: application developers can reuse the working agent design without implementing Archboard concepts or duplicating authority rules.
The dedicated branch is feat/reusable-codex-workbench.

Affected board proposals: Archboard@TASK-517; Agent workbench@TASK-517; Voice coordinator@TASK-517; Codex workhorse@TASK-517; Codex session@TASK-517; Browser application@TASK-517; Archboard server@TASK-517.
The parent owns these proposals for the single end-to-end extraction. Each delivery task records its contribution and deviations.

1. Complete TASK-517.01. Separate domain policy from execution authority, and supply host instructions, context events, tools, and admitted checkouts.
2. Complete TASK-517.02. Move reusable behavior into packages/agent-workbench and retain packages/workbench as the Archboard integration.
3. Complete TASK-517.03. Add apps/workbench-example as a minimal second host through the same public interfaces.
4. Keep Codex explicit. Preserve one coordinator per session and one workhorse per checkout within that session.
5. Preserve exact generation checks, unknown outcomes, queue behavior, spoken approval authority, transcript recovery, and coordinator retirement.
6. Keep core coordination instructions separate from host domain instructions and voice persona.
7. Keep application context distinct from user authorization and preserve speakable results versus quiet context.
8. Delegate backend implementation to gpt-6.1-sol agents with disjoint scopes in this dedicated worktree. The parent owns browser changes.
9. Run focused behavior owners during implementation. Pause after each delivery to simplify the result.
10. Run the complete bun run check gate. Expose all remaining lanes after an early failure and track reproducible repairs separately.
11. Review independent scopes and their contracts through parallel gpt-6.1-sol reviewers. Reviewers commit their fixes.
12. Inspect board proposals against source, compare code findings and commit footprints, and adopt the proposals after the passing gate.
13. Record evidence, close the delivery tasks and parent, and commit the final state. Do not push or publish a package.

The public server factory owns the internal generation graph. Hosts do not assemble its factories.
The host contract supplies domain instructions, context sources and events, domain tools, and checkout admission.
Private storage and the Codex executable are explicit installation inputs.
Browser media uses a separate browser-safe entry. The existing Archboard visual shell stays in the integration.
The independent app uses its own private storage and a permitted checkout without a vault.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final footprints read against main at 71180e211, with every proposal still based on its current parent. No part-only namedNotChanged deviations remain. Codex workhorse names two unchanged domain tool parts only through changed relationships, which is expected. ChangedNotNamed internal changes: Archboard Workspace packages is its directory aggregate; renderer changes belong to TASK-519. Agent workbench Codex process forwards explicit host environment in 78c87705e without changing lifecycle responsibility; Thread tool calls changes imports in 7e5287f0f; Board-change delivery retains Archboard matching while generic delivery moves in dec053209/7e5287f0f. Browser application Application composition and Recording pace change type imports only in 816b6d79c; Agent setup, Walkthrough recording, Pane composition, and Recording voice source use canonical shared interfaces in 5b1b58472/751fdfedd. Their host responsibilities and diagram relationships stay true. Archboard server Semantic context input uses relocated local types and matching helpers in dec053209/b2c7508b9 without changing its board-to-host projection responsibility. New code warnings from the proposals are cleared. Remaining added EXPOSED_UNUSED information describes pre-existing private helper exports within moved runtime folders, rather than public package entry exports. Public entries were pruned to real outside callers.

The parent inspected all seven proposal captures and corrected their prose about independent host storage and application/package counts. Every added or changed relationship now carries a source anchor. The final draft code comparison introduces no warning. The removal sweep found no obsolete SDK semantic-context imports, required Archboard process fields, or moved runtime/browser paths outside historical specifications. The authored-contract reference now distinguishes recorded Archboard profiles from current core-plus-host composition. Controlled QA host and private Codex child were stopped. README refresh uses generated local artifacts only; attachments and four Codex assets remain owner actions because this task does not publish or spend model usage on README recordings.

After the final prose correction, the Archboard footprint adds Codex home to namedNotChanged. This is an intentional documentation correction: the existing storage owner already accepts host-owned roots and needs no code change. The new example supplies its own root through the shared factory. The unchanged storage binding remains correct. Workspace packages is now named by its corrected description, so only the independent TASK-519 renderer repair remains changedNotNamed on Archboard.
<!-- SECTION:NOTES:END -->
