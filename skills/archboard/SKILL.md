---
name: archboard
description: >-
  Read and author local canonical architecture models with the archboard CLI.
  Create module structure, source-owned relationships, independent flows, compact
  proposals, exact history, and walkthroughs. Render diagrams and reproducible
  embeds. Use for architecture questions, request flows, proposals, and explicit
  migration of existing architecture vaults.
---

# Archboard

Use the CLI to read architecture, author changes, and produce diagrams.
A vault is the directory that holds one model.
A reading selects what you see without copying architecture.

## Read before acting

Read [canonical models](references/canonical-models.md) before your first architecture operation.
It defines discovery, identities, writes, proposals, history, recovery, rendering, and browser commands.
Run commands in the checkout that holds the vault, or pass `-C <directory>`.

Run `archboard model read` to discover the model and its complete revision.
Before describing implemented architecture, read the bound source, imports, callers, and external contracts.
If the read returns `LEGACY_AUTHORITY`, follow [legacy migration](references/legacy-migration.md).
Preserve the original files until the owner authorizes installation.

## Choose the work

Before authoring modules, relationships, flows, or proposals, read [authoring](references/authoring.md).
It explains source evidence, containment, flow summaries, and proposal names.
Before judging a design or planning a refactor, read [the design lens](references/design-lens.md).
Report its facts with source evidence and leave the judgment to the user.

Before authoring or recording a narrative, read [canonical walkthroughs](references/canonical-walkthroughs.md).
Before preparing a write, read [schemas](references/schemas.md).
For installation or updates, read [the installation guide](references/generated/INSTALL.md).
For missing language servers or more precise source evidence, read [setup](references/setup.md).

## Complete the intent

Read the resulting architecture.
Compare its stable subjects with the intended change.
Make sure that the requested scope, flow, and every narrative beat remain available.
Run affected semantic, code, and embed checks through `archboard check`.
Retain exact history before sharing a checkpoint or recording a walkthrough.
Report concrete changes, refusals, unavailable source, and recovery work.
Claim frontend acceptance, adoption, publication, or migration only after its operation succeeds.

## Source evidence catalogue

Use each feature when the source or requested design establishes it.

| Row            | Canonical evidence                                                |
| -------------- | ----------------------------------------------------------------- |
| `external`     | Mark a module outside the described ownership boundary.           |
| `binding`      | Bind a module to the source that implements its responsibility.   |
| `containment`  | State parent identities without a fixed level.                    |
| `relationship` | Author each relationship on its source module.                    |
| `traffic`      | State meaningful effective traffic properties.                    |
| `emphasis`     | Mark the main exchange when it helps the reading.                 |
| `repeat`       | Record repeated exchanges on authored steps.                      |
| `note`         | Attach relevant evidence or constraints to a step.                |
| `groups`       | Apply configured group identities.                                |
| `flow`         | Author a complete, described exchange in a collection.            |
| `view`         | Select a content-free reading or imported bookmark.               |
| `walkthrough`  | Author ordered beats with exact reading targets.                  |
| `drillDown`    | Follow an explicit model reference or recursive module scope.     |
| `description`  | Explain responsibilities and significant architectural decisions. |
