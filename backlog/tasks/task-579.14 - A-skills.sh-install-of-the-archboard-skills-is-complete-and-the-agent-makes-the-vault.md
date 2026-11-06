---
id: TASK-579.14
title: >-
  A skills.sh install of the archboard skills is complete, and the agent makes
  the vault
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T03:10:00Z'
updated_date: '2026-11-06T03:32:00Z'
labels: []
dependencies: []
references:
  - INSTALL.md
  - README.md
  - site/src/components/QuickStart.astro
  - packages/skills/src/runtime/operations/distribution/prepare.ts
  - apps/cli/src/cli/operations/install-skill/repo-setup.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
ordinal: 1035000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided on 2026-11-06 that the README, the site and INSTALL.md install the archboard skills with the skills CLI (`npx skills add miklschmidt/archboard -g`, listed on skills.sh) instead of `archboard install-skill`. The skills CLI copies the skills from GitHub. Git ignores skills/archboard/references/generated/, so such a copy lacks the JSON schemas and the INSTALL.md copy that the skill links to. The skill must instead get its schemas from the installed archboard CLI, which also keeps them at the version of the installed program. `install-skill` also made the vault; without it, the agent makes the vault with `archboard model init` the first time it works in a repository. `install-skill` stays as the offline path for a clone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The archboard CLI prints each schema that the skill names (model manifest, module, flows, model initialize, model edit, model import, model migrate, vault config) without a server or a vault, and lists their names
- [ ] #2 skills/archboard links no file outside its tracked files: no references/generated/ directory exists or is generated, and a copy of the tracked skill directory is complete
- [ ] #3 `archboard model init` in a Git checkout that holds no `.archboard/vault` makes the vault at the checkout root with the default config.yaml and the empty planning model, as install-skill does, and registers the checkout; install-skill uses the same operation
- [ ] #4 The archboard skill tells the agent to run `archboard model init` when the repository has no vault, and to read schemas through the CLI
- [ ] #5 README, site QuickStart and FAQ, and INSTALL.md show `npx skills add miklschmidt/archboard -g` for the skills; INSTALL.md keeps install-skill for a clone or offline use
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add archboard model schema [name] in apps/cli/src/cli/operations/model/schema.ts. It reads no shared option, so it needs no vault and no server. It lists the 8 names or prints one JSON Schema from the Zod authorities that generatedSchemas() used. model config --schema renders through the same table.

2. Delete the generated-references machinery: scripts/generate-skill-artifacts.ts, the generate:skill-artifacts script and its postinstall step, the .gitignore block, the ./distribution export of packages/skills (prepare.ts, projections/schemas.ts), the citations and leakage exclusions, the eval install preparation and the release compile step. Lower the skills interface ceiling to 2.

3. One operation makes vaults: makeVault in apps/cli/src/cli/operations/model/initialize.ts. model init gets runsWithoutVault and calls it in a checkout without a vault, with no server. setUpRepository of install-skill calls it too.

4. Skill text: SKILL.md tells the agent to run model init when the checkout has no vault. references/schemas.md points at model schema. INSTALL.md links go to GitHub main. skill-links.test.ts checks links against tracked files only.

5. Docs: README, site QuickStart and FAQ, INSTALL.md section 3, ADR 0075, boundaries.md, TESTING.md.

6. Verify: targeted tests, a git archive copy with a link check and the schema command, skills add --list, model init and model read on a scratch server, then the bun run check lanes.
<!-- SECTION:PLAN:END -->
