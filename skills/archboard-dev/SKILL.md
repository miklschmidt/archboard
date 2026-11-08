---
name: archboard-dev
description: >-
  Keep Archboard's canonical architecture model, consumer guidance and docs
  site aligned with product changes. Use when planning, implementing, or
  closing work in this repository.
metadata:
  internal: true
---

# Work on Archboard

Use [the consumer skill](../archboard/SKILL.md) for all architecture operations and authoring rules.
Use [the vault guide](../../.archboard/README.md) for this repository's context.
Discover authority through `archboard model read` in `.archboard/vault`.

## Plan the change

Identify affected modules, relationships, flows, and walkthroughs, then record their IDs in task notes.
Read affected modules through `model inspect` and their change patterns through `model locality`.
If the architecture stays accurate, record why no proposal is needed.
Documentation of implemented architecture needs no second proposal.

Before implementation, create a compact proposal for each independent architectural intent through the consumer proposal recipe.
Record stable state ID, predecessor, model, and vault in the task plan.

## Finish the change

Update the proposal to describe implementation, including affected subjects absent from the plan.
Compare its state with the intended base through `model compare`.
Compare the branch with the proposal through `model footprint`.
Settle affected proposal and descendant standing through the consumer reconciliation recipe.

Run focused semantic and code inspection for the affected state.
Inspect source for claims that automated evidence cannot assess.
Fix findings caused by the task, including containment findings on touched subjects from the consumer authoring reference.
Record unavailable source and evidence limits in task notes.
Use the narrow validation owners required by the behavior.
Reserve the complete repository gate for integration acceptance or an explicit request.

Follow consumer completion, retention, publication, and recovery recipes for adoption, shelving, and shared evidence.
Commit affected authored inputs with the work.

## Keep the docs in sync

The docs site in `site/` describes the shipped CLI and the GitHub Actions.
Sync it in the same change when the change alters one of these:

- A command, option, example, output, exit code or refusal of the CLI.
- A finding or skip reason of a check, or a model schema.
- An input or the behavior of a GitHub Action.
- The install or release steps.

Generated pages come from the program: `site/scripts/reference.ts` reads the CLI contracts, the help of each check, the JSON Schemas and each `actions/*/action.yml`.
To change what a generated page says, edit its source in the CLI or the Action. The page only lays out that data.
The site's `prebuild` and `predev` run the script. The script throws when an example runs another command, when the embeds help misses a code or the code help misses a skip reason, or when a description has a paragraph over 120 words or 6 sentences.
Write a description in the format that `CommandContract.description` documents: paragraphs, colon heads over lists, and code in backticks.

Hand-written pages quote behavior: `site/src/content/docs/*.mdx`, the prose of the pages in `site/src/pages/docs/`, `actions/README.md`, `INSTALL.md` and `README.md`.
A new top-level command needs a page in `cliGroups` of `site/src/lib/docs-nav.ts`. The build refuses a command that no page names.
Search them for each changed command, flag, code and exit status, and correct every statement and example that the change makes false.

The build guards the guides with two more scripts:

- `site/scripts/guides.ts` refuses an `archboard` command or flag in code that the CLI lacks, and a `with:` key that an Action lacks. It also refuses a code span that names an Action input or output, or a finding code, without a link to its row in the reference. It refuses an exit code written by hand, which `<Exit>` reads from the contract, an Action value or default that the `action.yml` does not give, a workflow whose Node.js differs from the check Action's default, and an `ARCHBOARD_…` variable that the CLI does not read.
- `site/scripts/links.ts` refuses a dead internal link or anchor in `dist`, and a guide's `{reference.…}` expression that shows as text. So a renamed input or code breaks the build at each guide that links it.

A guide reads a number of the program from `reference.facts`, which `reference.ts` imports from the source, such as the release port. Add a fact there when a guide states a new one.
Follow `site/DESIGN.md` for anything a reader sees.

Run `nix develop -c bun run build` in `site/`, then read each changed page in the running site with `bunx agent-browser`.
Finish when the build passes and no page describes behavior that the change replaced.

## Maintain consumer guidance

`skills/archboard` serves agents in other repositories.
When product behavior changes agent actions, update affected guidance in the same change.
Derive commands from shipped CLI contracts and schemas.
Keep general guidance independent of repository and language. Put repository-specific detail in worked examples.

When evaluated behavior changes, update affected scenarios and coverage under `evals/`, outside the distributed skill.
Use [evaluation procedures](../../evals/README.md) for deterministic validation.
Leave model evaluations to the person who runs them.

Measure workflow completion and total tokens, including discovery and recovery.
Compare runs only under the same product contract.
If that contract changes, establish a new baseline before claiming token savings.
