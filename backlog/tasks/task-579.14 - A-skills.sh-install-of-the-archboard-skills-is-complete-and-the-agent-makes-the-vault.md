---
id: TASK-579.14
title: >-
  A skills.sh install of the archboard skills is complete, and the agent makes
  the vault
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T03:10:00Z'
updated_date: '2026-11-07T04:28:00Z'
labels: []
dependencies: []
references:
  - INSTALL.md
  - README.md
  - site/src/components/QuickStart.astro
  - packages/skills/src/runtime/operations/distribution/prepare.ts
  - apps/cli/src/cli/operations/install-skill/repo-setup.ts
documentation:
  - docs/adr/0076-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
ordinal: 1035000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided on 2026-11-06 that the README, the site and INSTALL.md install the archboard skills with the skills CLI (`npx skills add miklschmidt/archboard -g`, listed on skills.sh) instead of `archboard install-skill`. The skills CLI copies the skills from GitHub. Git ignores skills/archboard/references/generated/, so such a copy lacks the JSON schemas and the INSTALL.md copy that the skill links to. The skill must instead get its schemas from the installed archboard CLI, which also keeps them at the version of the installed program. `install-skill` also made the vault; without it, the agent makes the vault with `archboard model init` the first time it works in a repository. `install-skill` stays as the offline path for a clone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The archboard CLI prints each schema that the skill names (model manifest, module, flows, model initialize, model edit, model import, model migrate, vault config) without a server or a vault, and lists their names
- [x] #2 skills/archboard links no file outside its tracked files: no references/generated/ directory exists or is generated, and a copy of the tracked skill directory is complete
- [x] #3 `archboard model init` in a Git checkout that holds no `.archboard/vault` makes the vault at the checkout root with the default config.yaml and the empty planning model, as install-skill does, and registers the checkout; install-skill uses the same operation
- [x] #4 The archboard skill tells the agent to run `archboard model init` when the repository has no vault, and to read schemas through the CLI
- [x] #5 README, site QuickStart and FAQ, and INSTALL.md show `npx skills add miklschmidt/archboard -g` for the skills; INSTALL.md keeps install-skill for a clone or offline use
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add archboard model schema [name] in apps/cli/src/cli/operations/model/schema.ts. It reads no shared option, so it needs no vault and no server. It lists the 8 names or prints one JSON Schema from the Zod authorities that generatedSchemas() used. model config --schema renders through the same table.

2. Delete the generated-references machinery: scripts/generate-skill-artifacts.ts, the generate:skill-artifacts script and its postinstall step, the .gitignore block, the ./distribution export of packages/skills (prepare.ts, projections/schemas.ts), the citations and leakage exclusions, the eval install preparation and the release compile step. Lower the skills interface ceiling to 2.

3. One operation makes vaults: makeVault in apps/cli/src/cli/operations/model/initialize.ts. model init gets runsWithoutVault and calls it in a checkout without a vault, with no server. setUpRepository of install-skill calls it too.

4. Skill text: SKILL.md tells the agent to run model init when the checkout has no vault. references/schemas.md points at model schema. INSTALL.md links go to GitHub main. skill-links.test.ts checks links against tracked files only.

5. Docs: README, site QuickStart and FAQ, INSTALL.md section 3, ADR 0076, boundaries.md, TESTING.md.

6. Verify: targeted tests, a git archive copy with a link check and the schema command, skills add --list, model init and model read on a scratch server, then the bun run check lanes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Command shape: archboard model schema [name], a child of the model namespace beside model config. It declares no shared option, so the session neither finds a vault nor reaches a server (the same mechanism that lets model config --schema run without one). Without a name it answers {schemas:[{name,title}]}; with a name it prints that JSON Schema. The ingress is a z.enum of the names, so an unknown name is a usage error that lists them. model config --schema now renders through the same table (jsonSchema("vault-config")), so both entry points print the same schema.

Deleted: scripts/generate-skill-artifacts.ts; the generate:skill-artifacts script and its postinstall step; the .gitignore block; packages/skills ./distribution with runtime/api/distribution.ts, runtime/operations/distribution/prepare.ts (PreparationSource.release, recordedRevision, checkoutRevision, the INSTALL.md copy) and runtime/projections/schemas.ts; tests/runtime/operations/distribution/release-links.test.ts; the references/generated exclusions in services/citations.ts and services/leakage.ts; the preparation in operations/runs/install.ts; the release step in scripts/release/compile.ts; prepareConsumerSkill and CONSUMER_SKILL in install-skill; the generated-file checks of the install fixture and the install-targets describe for generated files. Preparation had no other job: it only wrote the schemas, the INSTALL.md copy and removed stale files in references/generated. The schema semantics test moved to apps/cli/tests/cli/operations/model/schema.test.ts. The skills interface ceiling is now 2.

Vault making: makeVault in apps/cli/src/cli/operations/model/initialize.ts makes <repo>/.archboard/vault, runs archive-init outside Git, initializes the model locally through initializeArchitectureModel, and registers the holder through findVaultOf. model init now has runsWithoutVault; in a checkout without a vault it calls makeVault and needs no server, otherwise it goes through the server as before. setUpRepository of install-skill calls makeVault when the vault is missing or empty. A retry with the same operation id after the vault exists goes through the server path and returns the same checkpoint (checked by hand). The VAULT_NOT_FOUND text now names archboard model init instead of install-skill. Decision: the answer of model init in a checkout without a vault carries no vault field, as the runsWithoutVault contract says; the stderr registration line and "Made the architecture" line name it, and the next command names it. Decision: --name stays required; the skill tells the agent to use the repository directory name.

skill-links.test.ts now resolves the links of each shipped skill against git ls-files of that skill, so an ignored or untracked file no longer satisfies a link. It failed on the two references/generated/INSTALL.md links before the skill text changed. runs-without-vault.test.ts: a runsWithoutVault command with a required option is run bare and must fail in its parser (Usage) after the vault search, with nothing made or registered.

Evidence. AC1: apps/cli/tests/cli/operations/model/schema.test.ts, test "the CLI lists the schemas the skill names and prints each one, with no server and no vault" (exactly the 8 names, each compiles in Ajv, the stand-in server is asked nothing, the working directory is outside any checkout), and test "the printed input schemas accept and refuse the same expressible input as the runtime". By hand from an archived copy of skills/archboard: model schema and each of the 8 names exit 0, an unknown name exits 2.

AC2: tests/system/repository-policy/skill-links.test.ts resolves links against the tracked files of each skill. It failed on the two references/generated/INSTALL.md links before the text change. By hand: an archive of HEAD in a scratch tree, and a separate link script over skills/archboard (7 documents, 20 relative links, 0 dead) and skills/archboard-pr (8, 12, 0). The same script over the archive of 7c991f551 finds the 2 dead links. skills 1.7.4 add of the tree with --list finds archboard and archboard-pr. A project-level skills add --copy into a scratch directory gives a copy identical to the tracked tree, with 0 dead links.

AC3: tests/system/cli/install-targets.test.ts, test "model init in a checkout without a vault makes the vault that install-skill makes, and registers the checkout" (same vault files and config.yaml bytes as install-skill, model.json name, one signed checkpoint, repo list names the checkout). By hand in a scratch repository on a scratch server (port 18765, scratch ARCHBOARD_REPOS and XDG_STATE_HOME): model read refused with VAULT_NOT_FOUND that names model init; model init from src/ exited 0, made .archboard/vault/model.json and .archboard/config.yaml, and registered the checkout; model read then exited 0 with the manifest and vault origin working-directory; a retry returned the same checkpoint through the server. The server was stopped. AC4: skills/archboard/SKILL.md section Discover the model, references/setup.md step 4, references/schemas.md. AC5: README.md, site QuickStart.astro and Faq.astro, INSTALL.md section 3 with its install-skill subsection and options table, ADR 0076.

Gate: bun run check stopped at format:core, because cargo in a nested worktree finds the parent workspace. No Rust file changed. Lanes run one by one inside nix develop: lint:all 0, format:check 0, test:first 0 (types, frontend, workbench-example, test:core, test:repository 163 pass), test:modules 0 (4924 pass), test:system 0 (238 pass), test:solo 0 (15 pass), test:serial-browser 0. bun scripts/evaluate-skill.ts check: suite ok.
<!-- SECTION:NOTES:END -->
