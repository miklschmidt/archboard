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

## Choose the work

Before the first architecture operation, read [canonical models](references/canonical-models.md) for discovery, reads, writes, and history.
For `LEGACY_AUTHORITY` or requested migration, follow [legacy migration](references/legacy-migration.md).
Before describing implemented architecture or authoring changes, read [authoring](references/authoring.md) for evidence and modeling rules.
Before preparing a request, read [schemas](references/schemas.md).

For design decisions or refactors, read [the design lens](references/design-lens.md).
For narrative authoring, playback, or recording, read [canonical walkthroughs](references/canonical-walkthroughs.md).
For installation or updates, read [the installation guide](references/generated/INSTALL.md).
For missing language servers or more precise source evidence, read [setup](references/setup.md).

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
