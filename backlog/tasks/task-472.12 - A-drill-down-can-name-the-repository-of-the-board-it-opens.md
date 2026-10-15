---
id: TASK-472.12
title: A drill-down can name the repository of the board it opens
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 00:55'
labels: []
dependencies:
  - TASK-472.02
  - TASK-472.04
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 832000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A drill-down names only a board and variant in its own vault, so a meta project's board cannot open a product repository's board. ADR 0049 lets a drill-down name a repository identity, never a path: without one it stays in its own vault, and with one it opens the vault of that identity's chosen checkout. This task covers the board model, the server and the CLI; the browser task after it makes the pane dive across repositories.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A drill-down accepts an optional repository identity, and a drill-down without one keeps its meaning
- [x] #2 Reading or rendering a board resolves a drill-down with an identity in the vault of that identity's chosen checkout, with former names and case-insensitive names as in its own vault
- [x] #3 `archboard check` reports a drill-down whose identity has no known checkout, and one whose target board is not in the chosen checkout's vault
- [x] #4 The generated board schema carries the field, and the evaluation inputs cover it as the archboard-dev skill requires
- [x] #5 The archboard skill's recipes and references teach a drill-down into another repository, and CONTEXT.md's Drill-down matches
- [x] #6 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Contract (src/shared/semantic-board/lib/content.ts): DrillDownSchema gains optional `repo`, derived from CodeBindingSchema.shape.repo and refused when it spells a path (absolute, ~, ./, ../, backslash, drive letter): a note holds an identity, never a path (ADR 0049). Without it nothing changes (strict schema, optional field). compare/reconcile/input already carry `drillDown` whole, so a changed `repo` is a changed drill-down; a test pins it. The generated board schema (generate:skill-artifacts) carries the field.
2. Resolution, one place (src/runtime/semantic-board-store/lib/drill-down.ts, exported): drillTargetVault(vault)(repo) returns here | elsewhere{vault} | unreachable{why}. It asks checkoutsReadFrom(vault) (TASK-472.03) for the checkout of the identity, so the vault's own identity stays in the vault's own checkout; a checkout whose `.archboard/vault` is the vault itself is `here`; a gone checkout, a checkout without a vault or an identity nobody registered is `unreachable`. An untracked vault has no identity, so no repo ever resolves to one. The lookup is lazy and once per check, so a vault with no cross-repository drill-down pays nothing.
3. Reading the target in the other vault: former names and case-insensitive names resolve as in the board's own vault (resolveSemanticBoard) and the board is decoded in memory (decodeSemanticBoardDocument), so a check never migrates or writes a board of another repository.
4. Diagnostics: DRILL_DOWN_UNKNOWN_REPOSITORY (new, warning) when the identity has no usable checkout, saying `repo add`/`repo use`; DRILL_DOWN_UNKNOWN_BOARD (existing code, repository in its message) when the chosen checkout's vault lacks the board; DRILL_DOWN_LEVEL_MISMATCH reads the level of the target in the other vault; DRILL_DOWN_ONLY_NODE unchanged. Decision: both new reports are warnings like every DRILL_DOWN_*; the repair of the first is a machine action and the message says which.
5. Listing (shared/semantic-board/lib/listing.ts): BoardLink gains optional `repo`; a link that names a repository is not a link to a board of this vault, so it is neither renamed through this vault's former names nor dropped as "back to its own board"; the navigator outline (src/ui/board-catalog/lib/outline.ts) places no board under a link that names a repository.
6. Browser (types and request only, TASK-472.13 owns the dive): the drill-down type carries `repo` by derivation; resolveDrillDown/drillTargetName and use-drill-open never read a same-named board of the pane's own vault for a link that names a repository (resolution kind `other-repository`, worded in the inspector).
7. Readers checked with no change: the renderer's drill mark reads kind and level only; code check reads no drill-down; history lens skips a drill-down part either way (the board it opens carries its history).
8. Docs/skill: CONTEXT.md Drill-down; skills/archboard (authoring.md drill-down section, create-architecture/edit if they teach drill-downs, SKILL.md); evals/coverage.json row (+ scenario only if expectedFeatures change); generate:skill-artifacts; archboard-dev skill sentence on `drill-down` skipped parts.
9. Tests: store module test (own vault, other identity's chosen checkout, the vault's own identity staying local, unknown identity, missing target, former and cased name in the target vault, no write to the target vault); shared tests for the schema, compare and listing; one CLI-and-server system test over two temporary git checkouts with an isolated registry, `archboard check` reporting both problems and nothing for a good link.
10. Board: Board persistence@TASK-472.12 (Drill-down checks: now reads the vault of the identity's chosen checkout; relationships to Vault checkouts, Former names and Decode board bytes, each anchored). No other board is affected: no board binds src/shared/semantic-board, the renderer and the code check are unchanged, and the pane dive is TASK-472.13.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (commits 266f5a7ec feat(drill-down), 9046e17f4 and badafd025 docs(skill), plus the board proposal). Decisions:
- Contract: DrillDownSchema gains optional `repo`, derived from CodeBindingSchema.shape.repo and refused when it spells a path (absolute, ~, ./, ../, backslash, drive letter). compare, reconcile and the edit input carry `drillDown` whole, so a changed repo is a changed drill-down (pinned by comparison.test.ts). The generated create/edit/board schemas carry it (bun run generate:skill-artifacts).
- Resolution lives in src/runtime/semantic-board-store/lib/drill-down.ts (createDrillLookup, used by checkSemanticVault): repo undefined = this vault; otherwise checkoutsReadFrom(vault) finds the checkout (the vault's own checkout for its own identity, so a link naming the vault's own repository stays in the vault; the chosen checkout for any other) and the target vault is <root>/.archboard/vault. The target is found with resolveSemanticBoard (own name, then a former name, case-insensitive) and decoded in memory with decodeSemanticBoardDocument, so a check never migrates or writes another repository's board. The registry is asked lazily and once per check.
- Diagnostics (decision recorded): a new code DRILL_DOWN_UNKNOWN_REPOSITORY (warning) when the identity has no checkout, its chosen checkout is gone, or the checkout has no vault, saying `repo add` / `repo use` / `repo forget`. A target missing from the chosen checkout's vault stays DRILL_DOWN_UNKNOWN_BOARD with the repository in its message (same repair as a local one). DRILL_DOWN_LEVEL_MISMATCH reads the level declared in the other vault. All warnings, like every DRILL_DOWN_*: unlike a binding into an unregistered repository, a link that opens nothing is the story the task asks the check to tell.
- Listing: BoardLink gains optional `repo`; such a link keeps the name as spelled (only the other vault knows what the board goes by now), is not dropped as "back to its own board", and the navigator outline places no board under it. Not done, on purpose: a link that names the vault's own identity is reported with its repo and so is not placed by the navigator (the listing is pure shared code with no registry; the route would need the vault's identity, and src/server routes was another agent's area). Pane dive resolves it as local in TASK-472.13 via the same rule.
- Browser (types and request only): the type carries repo by derivation; resolveDrillDown returns `other-repository` and never reads the same-named board of the pane's own vault; GoDeeper words it and does not query for it. The dive across repositories is TASK-472.13. The subject tip still says "Double-click to open <board>" for such a card.
- Readers read and left alone: the renderer's drill mark reads kind and level only; src/runtime/code-check reads no drill-down; the history lens skips a drill-down part either way (the board it opens carries its history, now possibly in another repository; the archboard-dev closing step says so).
- Skill: authoring.md (field list, a new "A board of another repository" paragraph, DRILL_DOWN_UNKNOWN_REPOSITORY), SKILL.md drillDown row; CONTEXT.md Drill-down; archboard-dev closing step; evals/coverage.json row `node.drillDown.repo` (runtime-owner). No scenario's expectedFeatures change, so evals/evals.json is untouched. `archboard check --help` (src/cli/commands/vault.ts) names none of the DRILL_DOWN_* codes and was left alone (outside my fence).
- Owners: src/runtime/semantic-board-store/tests/drill-down-repository.test.ts (module), tests/system/cli/drill-down-repository.test.ts (CLI and owned server over two git checkouts with an isolated registry), src/shared/semantic-board/tests/listing.test.ts and comparison.test.ts, src/ui/board-catalog/tests/outline.test.ts.
- Board: Board persistence@TASK-472.12 (version 41). Drill-down checks restated (it reads the vault of the repository a link names), new part Vault checkouts (checkoutsReadFrom), four anchored relationships (Drill-down checks to Vault checkouts, Former names and Decode board bytes; Binding checks to Vault checkouts, the reach TASK-472.03 left undrawn). check --code --variant TASK-472.12 introduces no finding and clears two RELATIONSHIP_UNDRAWN (Former names, Decode board bytes). No other board is affected: none binds src/shared/semantic-board or the renderer's drill mark. Not adopted: closing is the parent's.

Closing the board proposals (after reviews d6764e682, 4c1159442, 47388b8d6, 299fde5a8, 41b44e798).
Adopted: Board persistence@TASK-472.12 at version 44; Archboard server routes@TASK-472.12 (new, branched from its current variant at version 18) at version 22. ./bin/dogfood check reports no diagnostics.
Restated on Board persistence (corrected to what the reviews built, nodes keep their ids): summary is now the board's scope, not the task title. Drill-down checks: the description now says the check asks two questions of a link into another repository (no chosen checkout, a target board that cannot be read, d6764e682) and that a link naming the vault's own repository stays in the vault (299fde5a8). Vault checkouts: now bound to the whole vault-checkout.ts instead of the symbol checkoutsReadFrom, because 47388b8d6 added vaultIdentity beside it; the description says it also tells which identity the vault's own checkout holds. New relationship Archboard server -> Vault checkouts (the listing route passes vaultIdentity to listedBoard, anchored at semantic-board-routes.ts vaultIdentity). The path-wide binding made the check read this reach as RELATIONSHIP_UNDRAWN, which the edge answers.
New proposal on Archboard server routes: Vault checkouts (module, src/runtime/code-target/lib/vault-checkout.ts); Board routes -> Vault checkouts (the vault's own repository identity, for the listing; anchor semantic-board-routes.ts vaultIdentity); Semantic board store -> Vault checkouts (anchor drill-down.ts checkoutsReadFrom; the store module reaches the checkouts, which the check read as RELATIONSHIP_UNDRAWN once the part was drawn). I drew it because the routes board is about what each route reaches and the listing route now reaches the machine's checkout of the vault; no other board binds src/runtime/code-target or src/shared/semantic-board.
Findings comparison (check --code with and without --variant TASK-472.12, on the final proposals): no > line; two < lines, the RELATIONSHIP_UNDRAWN of Former names and Decode board bytes, which the drawn relationships clear. The 4 remaining warnings (ANCHOR_SYMBOL_MISSING on Board rasterizer and Browser application, RELATIONSHIP_UNDRAWN on Browser application and Live panes) are in both runs and not about these boards.
Footprint read against base 9046e17f4 (the parent of the first code commit 266f5a7ec), proposal parent equals current on both boards. Board persistence: namedAndChanged Drill-down checks (4 commits) and Vault checkouts (vault-checkout.ts, 47388b8d6). changedNotNamed: Vault diagnostics (diagnostics.ts, 266f5a7ec) only passes createDrillLookup(root, targets) in place of the targets map to semanticDrillDownDiagnostics, so the relationship Vault diagnostics -> Drill-down checks is the same and the board stays true; Discard (discard.ts) was changed by aeb48c8c0, TASK-473 (a comment), not this task; Board store (the container directory) reads as changed because of the two parts above and the module test drill-down-repository.test.ts, a test. namedNotChanged: Former names, Binding checks and Decode board bytes are named only by a relationship (the new caller does not change the file of what it calls; the new Binding checks -> Vault checkouts edge draws the reach TASK-472.03 left undrawn). Archboard server routes: Board routes (47388b8d6) and Vault checkouts are namedAndChanged; Semantic board store is named only by its new relationship; nothing else changed. Skipped drill-down parts hold no proposal of this task.
Step 7 (behind): Board persistence and Archboard server routes read clean after adoption. Board viewer and Browser application read 0 commits behind, because TASK-472.04 adopted them (1fa993226) after the UI commit 266f5a7ec. Board viewer part Follow drill-downs (drill-target.ts) gained the resolution other-repository in 266f5a7ec; its description (resolves a link against the target board's document, reports a named variant that is gone) is still true for a link without a repo, and the dive across repositories is TASK-472.13, which restates that part. No board binds src/shared/semantic-board, the renderer's drill mark or src/runtime/code-target other than the two above. Command interface and Live panes are behind only for commits of other tasks.

Correction to the step 7 line above: Archboard server (service board) is also behind by 47388b8d6 (and 4307a826c of TASK-472.05), on the container Archboard server (src/server/archboard) and HTTP application. It stays right: it draws the server's modules and its Route handlers part is unbound, so the listing route's one read of the vault's identity is drawn in the Archboard server routes proposal above, and the board has no finding. Board viewer/Browser application, Command interface and Live panes are behind only for other tasks' commits or not at all.

Closing evidence: the complete gate (bun run check) passed in a clean worktree at 299fde5a8, every lane, exit 0. It holds src/runtime/semantic-board-store/tests/drill-down-repository.test.ts (chosen checkout, level, former and recased names, own identity, unreadable target, checkout without a vault, no write to the other vault), src/shared/semantic-board/tests/listing.test.ts, comparison.test.ts and tests/system/cli/drill-down-repository.test.ts. The generated schemas under skills/archboard/references/generated carry repo, and evals/coverage.json has node.drillDown.repo. Reviews: d6764e682, 4c1159442, 41b44e798 (change review), 47388b8d6 and 299fde5a8 (boundary review: the check and the listing treat the vault's own identity as local). Proposals adopted in 3ff98faeb. The pane dive across repositories, and the browser's own-identity case, are TASK-472.13.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A drill-down can now name the repository identity of the board it opens. The check resolves it in the vault of that identity's chosen checkout, with former and recased names, and reports DRILL_DOWN_UNKNOWN_REPOSITORY or DRILL_DOWN_UNKNOWN_BOARD with what to do. A drill-down naming the vault's own identity stays in the vault, in the check and in the listing alike. The schema, the generated references, the eval coverage, the archboard skill and CONTEXT.md carry the field. Verified by the module and system tests in the complete gate at 299fde5a8. Board persistence and Archboard server routes proposals are adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
