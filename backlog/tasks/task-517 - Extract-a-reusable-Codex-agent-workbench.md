---
id: TASK-517
title: Extract a reusable Codex agent workbench
status: Done
assignee:
  - '@codex'
created_date: 2026-10-24 11:37
updated_date: '2026-10-25T00:10:00Z'
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
- [x] #1 Archboard and a second minimal application use one shared Codex workbench implementation through public server and browser interfaces.
- [x] #2 The second application starts without an Archboard server, board, or vault and supports voice, conversation, checkout workhorses, and approval handling.
- [x] #3 The reusable implementation owns lifecycle, queues, routing, transcript recovery, and approval authority. Its host supplies domain instructions, context events, tools, and allowed checkouts.
- [x] #4 Exact session identity, unknown delivery outcomes, spoken approval settlement, coordinator retirement, and independent voice and workhorse stop behavior retain meaningful behavior coverage.
- [x] #5 The complete bun run check gate passes, reviewers commit fixes, and the affected architecture boards describe the implementation.
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

The closing behind sweep also names Live panes. Its tab presence implementation moved to the shared owner while the retained file became a pane adapter. Draw and adopt Live panes@TASK-517 as an eighth affected proposal. The remaining parts on Live panes and Board rasterizer change only imports or exact host types, so their responsibilities remain true.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final footprints read against main at 71180e211, with every proposal still based on its current parent. No part-only namedNotChanged deviations remain. Codex workhorse names two unchanged domain tool parts only through changed relationships, which is expected. ChangedNotNamed internal changes: Archboard Workspace packages is its directory aggregate; renderer changes belong to TASK-519. Agent workbench Codex process forwards explicit host environment in 78c87705e without changing lifecycle responsibility; Thread tool calls changes imports in 7e5287f0f; Board-change delivery retains Archboard matching while generic delivery moves in dec053209/7e5287f0f. Browser application Application composition and Recording pace change type imports only in 816b6d79c; Agent setup, Walkthrough recording, Pane composition, and Recording voice source use canonical shared interfaces in 5b1b58472/751fdfedd. Their host responsibilities and diagram relationships stay true. Archboard server Semantic context input uses relocated local types and matching helpers in dec053209/b2c7508b9 without changing its board-to-host projection responsibility. New code warnings from the proposals are cleared. Remaining added EXPOSED_UNUSED information describes pre-existing private helper exports within moved runtime folders, rather than public package entry exports. Public entries were pruned to real outside callers.

The parent inspected all seven proposal captures and corrected their prose about independent host storage and application/package counts. Every added or changed relationship now carries a source anchor. The final draft code comparison introduces no warning. The removal sweep found no obsolete SDK semantic-context imports, required Archboard process fields, or moved runtime/browser paths outside historical specifications. The authored-contract reference now distinguishes recorded Archboard profiles from current core-plus-host composition. Controlled QA host and private Codex child were stopped. README refresh uses generated local artifacts only; attachments and four Codex assets remain owner actions because this task does not publish or spend model usage on README recordings.

After the final prose correction, the Archboard footprint adds Codex home to namedNotChanged. This is an intentional documentation correction: the existing storage owner already accepts host-owned roots and needs no code change. The new example supplies its own root through the shared factory. The unchanged storage binding remains correct. Workspace packages is now named by its corrected description, so only the independent TASK-519 renderer repair remains changedNotNamed on Archboard.

The .03 complete gate at 74751d397 passes lint, formatting, both type projects, both browser builds, and all 4,940 module tests (one skip). Ten system cases fail before exercising behavior because a controlled fixture insertion point changed. All remaining lanes ran: 149 repository cases and all 19 browser owners pass. TASK-525 owns the fixture repair, followed by another complete gate. The cause is fixture source matching, not old application wiring.

The complete repaired gate at 33aa81f0f passes all 13 stages in 534 seconds: 5,378 passes, one skip, no failures, lint zero warnings. The eight adopted boards pass archboard check with zero diagnostics. The first seven adoptions exposed two visual diagnostics, corrected before closure: Workbench interface now nests under Child ownership, and Shared instruction policy no longer draws a redundant line to its own part. The post-adoption sweep discovered Live panes tab ownership, now drawn as a pane adapter plus core tab sessions. Its footprint against main names both changed parts, has no namedNotChanged entries, and adds no code finding. Its other changedNotNamed parts change imports in b2c7508b9/dec053209, retaining their behavior. Board rasterizer Recording page and Recording pace change only shared type imports in 751fdfedd/816b6d79c. Their descriptions remain true. Remaining global code findings are pre-existing and outside this extraction; introduced warnings are zero.

Post-adoption document validation passes: architecture asset generation, 149 repository tests, and formatting. The final regular board check has zero diagnostics. All non-Codex README assets are current. Four owner-run assets remain stale because this task does not spend model usage on recordings: bun run readme:assets explainer pr-walkthrough newcomer ask. Refreshed animated clips remain under /tmp/nix-shell.SqUKhs/archboard-readme-assets/attachments; no attachment or package was published. Existing README attachment URLs remain. Live microphone capture, audible playback, and model speech still require account/hardware acceptance. Controlled SDP negotiation, browser permission failure/recovery, and independent stop behavior passed. Existing aggregate Vite chunk size and libavoid initialization messages remain outside the changed contract and did not fail any gate.

PR 2 now targets origin/main at 7488ab12, which precedes the local task base and includes the earlier Vite+ and overview-label work. The requested archboard-pr body accounts for that scope. A focused Workbench reuse view and branch-bound new package/example support the comparison with TASK-500.06. Seventeen footprints have no unread repository. The already-adopted TASK-517 variant refuses proposal footprint mode, so its normal footprint and explicit parent comparison provide the evidence. The picture passes native and half-size inspection. A private recording server at port 46549 uses an isolated registry and leaves the global chosen checkout unchanged. A temporary reviewer walkthrough is recording and will be removed after capture.

PR #2 body now follows archboard-pr: Summary, Evidence, and Merge Danger, with the uploaded auto-theme SVG, standalone browser screenshot, and 1:29 narrated walkthrough. Parent inspected all five chapter frames and the verbatim transcript. Posting and readback pass: one marker pair, two images, one video URL, no local paths. The recording uses the actual shared production runtime and keeps /tmp/task517-pr2/talk. The temporary reviewer walkthrough was removed. The durable Workbench reuse view remains. Architecture assets and formatting pass. No source code changed, and no branch commits were pushed. The isolated recording server and its claim are released; the global chosen checkout stays unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extracted packages/agent-workbench as the one Codex implementation for voice, coordinators, checkout workhorses, queues, recovery, browser command authority, and approvals. Archboard retains its domain instructions, boards, panes, tools, narration, and shell. apps/workbench-example runs the same public factory and browser owners with private state and no board, vault, or Archboard server. gpt-6.1-sol implementers and fixing reviewers worked in the dedicated feat/reusable-codex-workbench checkout. Exact identity, unknown outcomes, spoken settlement, retirement, and independent stops retain behavior coverage. The complete 13-stage gate passes with 5,378 tests and one skip. Eight affected boards are adopted and the vault check has zero diagnostics. Repairs TASK-518, TASK-519, TASK-521, TASK-522, TASK-523, TASK-524, and TASK-525 are closed. Live audio acceptance and four Codex README recordings remain owner actions. All work is committed locally. Nothing was pushed or published.
<!-- SECTION:FINAL_SUMMARY:END -->
