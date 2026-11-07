---
name: archboard
description: >-
  Read, author, and visualize local architecture with the archboard CLI.
  Always use in repositories with an .archboard/vault directory: when planning,
  implementing, explaining, visualizing, refactoring, or improving the
  codebase. Load this skill when loading, reading, or using
  improve-codebase-architecture. Also use for architecture questions, request
  flows, proposals, and explicit migration of existing architecture vaults.
---

# Archboard

Use the CLI to read architecture, author changes, and produce diagrams.
A vault is the directory that holds one model.
A reading selects what you see without copying architecture.

## Choose the work

Before the first architecture operation, read [canonical models](references/canonical-models.md) for discovery, reads, writes, and history.
For `LEGACY_AUTHORITY` or requested migration, follow [legacy migration](references/legacy-migration.md).
Before describing implemented architecture or authoring changes, read [authoring](references/authoring.md) for evidence and modeling rules.
Before preparing a request, read [schemas](references/schemas.md).

For design decisions or refactors, read [the design lens](references/design-lens.md).
For `improve-codebase-architecture`, follow [the integration workflow](references/design-lens.md#integrate-with-improve-codebase-architecture).
For narrative authoring, playback, or recording, read [canonical walkthroughs](references/canonical-walkthroughs.md).
For installation or updates, read [the installation guide](https://github.com/miklschmidt/archboard/blob/main/INSTALL.md).
For missing language servers or more precise source evidence, read [setup](references/setup.md).

## Make the vault

If the Git checkout has no `.archboard/vault`, a command refuses with `VAULT_NOT_FOUND`.
If the refusal names another vault that holds the models of this repository, pass that vault with `-C`.
Otherwise, make the vault with `model init` in the checkout before any other operation:

```bash
archboard model init --name <name> --operation-id initialize-<name> --writer agent --doing 'Initialize architecture'
```

Use the name of the repository directory as the model name, unless the user names the model.
The command makes `<root>/.archboard/vault` with the default vocabulary and an empty planning model.
It registers the checkout, so that a browser lists it. It needs no server.
Tell the user that you made the vault, and where.

## Complete the intent

Read the resulting architecture.
Compare its stable subjects with the intended change.
Make sure that the requested scope, flow, and every narrative beat remain available.
Run affected semantic, code, and embed inspection through `archboard check`.
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
