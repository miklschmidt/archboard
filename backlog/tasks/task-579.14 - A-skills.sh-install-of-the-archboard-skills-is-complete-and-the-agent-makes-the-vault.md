---
id: TASK-579.14
title: >-
  A skills.sh install of the archboard skills is complete, and the agent makes
  the vault
status: To Do
assignee: []
created_date: '2026-11-06T03:10:00Z'
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
