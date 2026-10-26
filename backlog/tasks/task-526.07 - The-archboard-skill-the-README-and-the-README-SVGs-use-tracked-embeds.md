---
id: TASK-526.07
title: The archboard skill, the README and the README SVGs use tracked embeds
status: Done
assignee:
  - '@claude'
created_date: '2026-10-24T15:36:00Z'
updated_date: '2026-10-25T00:01:00Z'
labels:
  - skill
  - docs
dependencies:
  - TASK-526.04
  - TASK-526.05
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents embed diagrams in documentation, and they need to know to use --track and to run archboard check after a change. The owner asked for a README section that markets tracked embeds. The render-based README SVGs are kept current by the README kit today, and as tracked embeds they show the feature on the README itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The archboard skill tells agents to embed a picture in documentation with render --out and --track, and to run archboard check after a change
- [x] #2 The README has a section on tracked embeds with the render command, what archboard check says after a code change, and check --fix
- [x] #3 The architecture SVGs in docs/readme are tracked embeds, and archboard check reports them current
- [x] #4 The documentation says to keep the metadata element when a pipeline runs SVGO
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Skill: references/sequences-views-walkthroughs.md gains a section on keeping an embedded picture current: render --out --track --doing (SVG preferred, rasterize for PNG), keep the metadata element through SVGO, the flow check code -> correct the board -> check names the embeds -> check --fix draws them, a docs repository without a vault, and a vault of another repository that the check fetches. SKILL.md runbook step 16 and the When to read more list point at it. edit.md names semantic delete in place of discarding a copy by hand. evals/coverage.json rows for the changed guidance. bun run generate:skill-artifacts.
2. README: a section "Diagrams that stay current in your docs" after "Pictures for docs, ADRs and pull requests", with the --track command, the warning that check prints after a board correction, and check --fix. The Pictures section names the new defaults (theme auto, a key unless --no-legend).
3. README kit: the architecture asset draws Archboard from the real .archboard/vault with --track straight into docs/readme, then cuts the faces in place. Its manifest sources shrink to the kit code, because the embeds check owns board and renderer staleness. sequence and web-shop: examples/web-shop is no vault in place (inside a Git checkout only <root>/.archboard/vault is a vault, and a recipe names a vault only by repository identity), so they stay drawn from a copy (decision in the notes). docs/agents/readme-assets.md says so, and that check --fix replaces a cut file with the full render and readme:assets <asset> cuts it again.
4. Regenerate architecture, sequence, web-shop. Run code-evidence if it needs no Codex sign-in, and list the clip to attach.
5. Board proposal: no board is affected. No board draws the README kit or the skills. The Archboard board gains only tracked-embed entries, which are no architecture.
6. Gate: bun run check, then test:system, test:repository, test:serial-browser if it stops early.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in commits 472f71dc8 (README kit, assets, vault), bf49b4a36 (code-evidence still and hash), 61d2bd88d (archboard skill and evals/coverage.json), 9fe350202 (README section), 2880b203c (archboard-dev note), 94c1babe9 (INSTALL.md).

Decision, web-shop and sequence are not tracked embeds (AC #3 holds for architecture only): examples/web-shop is no vault in place. Inside a Git checkout only <root>/.archboard/vault is a vault (vault-finder), the server serves only the <dir>/.archboard/vault layout (isVaultLayout), and a recipe names its vault only by repository identity. A recipe drawn from it can name no vault that the check can find: from a scratch copy it names repo null, and from this checkout it would name the dogfood vault, which has no Web shop board. Making them tracked embeds needs the example in a repository of its own (for example github.com/miklschmidt/archboard-example), which check embeds then fetches (TASK-526.05), or a product change; the owner decides. Until then the kit draws them from a copy, as before, and leaves their recipe out, so archboard check here does not list them as embeds whose vault is unavailable; the manifest's source hash keeps owning their staleness.

Decision, the architecture asset: the kit serves .archboard/vault in place on a take server of its own (own registry, own state directory, free port; startCheckoutServer in scripts/readme-assets/server.ts) and draws Archboard with semantic render --track straight into docs/readme, then cuts the faces in place. Cutting keeps the recipe, and the recipe's picture digest is of the drawing before the recipe and the cut, so archboard check embeds reports both files current. Its manifest sources shrink to scripts/readme-assets/svg.ts and server.ts: the embeds check now owns board and renderer staleness of these files. The first run raised Archboard from version 72 to 74 (two tracked embeds); a second run writes nothing.

Decision, README pictures keep --no-legend and draw light and dark separately: GitHub's <picture> with prefers-color-scheme follows the GitHub theme, and the legend would change every README picture. The recipes record legend null, so check --fix keeps it.

Decision, the web-shop picture draws the Everything view: the overview now closes every container, so the overview picture lost Place order, Basket route and the timeout guard that the README text and alt describe. The README command says --view Everything.

Decision, the skill section lives in references/sequences-views-walkthroughs.md beside the render recipe paragraph (A picture in documentation that stays current), reached from SKILL.md's Verification bullet, runbook step 16 and the When to read more list. evals/coverage.json gains three runtime-owner rows: the render recipe, --track, and check embeds with --fix. bun run eval:skill check passes; no eval was run.

edit.md names archboard semantic delete for the unwanted copy of a stopped move. TASK-526.06 adds the command in parallel; this branch's CLI does not have it yet.

A person must attach the code-evidence clip: bun run readme:assets code-evidence wrote /tmp/nix-shell.SqUKhs/archboard-readme-assets/attachments/code-evidence.webp (626 KB), which types archboard check code; run gh attach on it and put the address in README.md in place of the current clip's. The kit committed only the index still and the hash.

No board proposal: no board draws the README kit or the skills. The Archboard board gains only its tracked-embed list, which is no architecture.

Gate on worktree-agent-a79292b0539f5c66b (main merged with feat/check-export-artifacts): bun run check stopped at test:modules with 4924 pass and 2 fail, both the known timing case in packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts (first layout 3119 ms and 3113 ms against 3000 ms, Agent workbench and Archboard server routes; TASK-527 repairs it). Lint, fmt:check, type-check and build:frontend passed before it. The remaining lanes run on their own: test:system 281 pass 0 fail, test:repository 136 pass 0 fail, test:serial-browser 19 of 19 files, exit 0. archboard check embeds in this checkout lists docs/readme/architecture-light.svg and -dark.svg as embeds and as tracked embeds of Archboard, with no finding; archboard check semantics exit 0; readme:check lists architecture, sequence and web-shop as current.

Review (2026-10-24): a reviewer fixed six findings in 82173775d (README caption showed a refused command; a rename is not current for a titled picture), f8a2dcd4b (--track only lists the file; when not to track), 2d3efd2cb (coverage row owners), f87fc3980 (edit.md line left to TASK-526.06, which names semantic delete; the earlier note that this task names it is superseded), cf4797374 (renderer changes now show as EMBED_RENDERER_CHANGED). Criterion 3 holds for the architecture SVGs only: sequence and web-shop come from examples/web-shop, which is no servable vault in this checkout, so the kit strips their recipe and its manifest hash owns their staleness. Moving the example into a repository of its own makes them tracked embeds; that is the owner decision. A person must attach the refreshed code-evidence clip (it types check code). readme:check lists 12 clips, banner and videos stale because the TASK-526 branch changed their sources; they need filming and attaching by a person.

Criterion 3 is met for docs/readme/architecture-{dark,light}.svg: they carry recipes, the Archboard board lists them, and archboard check embeds reports no finding (exit 0, 2026-10-25). The sequence and web-shop SVGs come from examples/web-shop, which is no servable vault (the server serves only <dir>/.archboard/vault of a checkout), so the README kit strips their recipe. They become tracked embeds only if the example moves into a repository of its own, which is the owner's decision. The task stays open on that decision.

2026-10-25: the owner narrowed criterion 3 to the architecture SVGs. archboard check embeds in this checkout: exit 0, embeds docs/readme/architecture-{dark,light}.svg, both tracked on Archboard (vKEsyHFk), no findings. ADR 0057's consequence now says that the sequence and web-shop SVGs carry no recipe.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The archboard skill tells agents to draw an embedded picture into its Git checkout with render --out and --track and to run archboard check after a change, and says to keep <metadata> when a pipeline runs SVGO (also in INSTALL.md). The README gained 'Diagrams that stay current in your docs' with the render command, the EMBED_OUTDATED warning and check --fix. The README kit draws the architecture SVGs from .archboard/vault in place with --track, so the Archboard board lists them and archboard check reports them current. The sequence and web-shop SVGs come from examples/web-shop, which is no vault in place, so the kit strips their recipe and the manifest hash says when they are stale.
<!-- SECTION:FINAL_SUMMARY:END -->
