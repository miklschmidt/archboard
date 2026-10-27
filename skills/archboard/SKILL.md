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

Agents author architectural meaning. Archboard draws it, and people read it.
One vault holds one canonical model. A module keeps one identity across every reading.
Modules form a containment forest without fixed levels.
Each module owns its outgoing relationships. Flow collections hold independent exchanges across modules.
A reading selects a scope, focus, filters, diagram grammar, and optional flow.
It owns no architecture content.

Read [canonical models](references/canonical-models.md) before the first architecture operation.
Read [canonical walkthroughs](references/canonical-walkthroughs.md) before authoring or recording a narrative.
If a vault returns `LEGACY_AUTHORITY`, read [legacy migration](references/legacy-migration.md).
That refusal requires explicit identity choices and owner-authorized installation.
Do not rewrite original files or resume retired board commands.

## Discover the model

Run commands in the checkout that holds the vault, or pass `-C <directory>`.
Every result names its addressed vault.
The server stays local and serves only vaults that requests name explicitly.
Run `archboard model read` to discover the model, roots, relationships, flows, proposals, and exact input revision.
Use qualified identities when names are ambiguous.
Read source before describing implemented architecture.
Follow bound files, imports, callers, and the external contracts that establish each relationship.
A name, code binding, or similar responsibility never establishes shared identity.

If an empty vault has no manifest, initialize it through `model init`.
The existing `install-skill` setup initializes new vaults through that same operation.
An untracked vault needs explicit `model archive-init` before signed history and authoring operations.
Keep configured Git signing enabled.

## Author one intent

Read the complete current revision before preparing a write.
Claim every affected existing subject, state, and structure scope through `model claim`.
A claim records its writer and purpose. It leaves the short installation lease free between writes.
Submit one complete intent through `model edit` with its claim, writer, operation identity, revision, and doing line.
Use the existing operation identity only to retry that exact intent.

Create proposals through the edit operation.
A proposal stores stable identity changes against an immutable retained baseline.
Independent proposals stay separate even when their names match.
Read and compare each proposal through `model read`, `model proposals`, or `model compare`.
Settle reported standing before adoption.
Adopt or shelve only when the owner explicitly requests that outcome.
A source merge never adopts architecture.

Keep continuing subject identities unchanged.
Leave identity allocation to the public writer for new subjects.
Use names and same-intent references only where the request schema permits them.
Omitted fields preserve their values. Explicit clear lists remove optional values.
Release the claim when the intent ends.
If a claim is revoked, stop that intent and report the state that it left.

## Choose a reading

Architecture answers which parts exist and how they depend on one another.
A relationship states a continuing architectural dependency, rather than an ordered call.
Sequence answers what happens, in order, during one authored exchange.
Flowchart shows the decisions and loops within that same flow.
Behavioral rendering requires an explicit flow and preserves its complete participants and steps.
Do not invent execution order from structural relationships.

Use `model read --code` for a selected module's exact local code target.
Use `check code` for bindings, evidence anchors, relationships, and interfaces.
A finding names the canonical model and state.
A retained reading never substitutes present-day source for unavailable historical evidence.

Use `model render` for standalone SVG and `model rasterize` for PNG.
Both use the shared projection and existing local renderer.
Their recipes preserve canonical selectors and the exact input revision.
Use `check embeds` to compare tracked artifacts with their recipes.
Use `--fix` only when the request authorizes artifact replacement.
A diagram that misdraws correct saved meaning needs a renderer fix.
Do not add geometry or alter meaning to repair its placement.

## Work with a live pane

Run `browser panes` before answering a question about the screen.
Use its `panes[].architecture` capture and `tabSessionId` for `model explain`.
Keep the captured model, revision, subjects, reading intent, state, checkpoint, and comparison base together.
A later selection or navigation change never retargets an existing explanation.

Use `browser show [model] --pane <spec>` with canonical selectors to navigate an existing pane.
Use `--input <file>` for a complete reading object.
A walkthrough selector and zero-based beat request use the existing captured player.
An agent show preserves the browser's shown conversation.
The browser's own activation selects its workhorse conversation.
Local agents continue to execute in their addressed checkouts.

## Finish the intent

Read the resulting architecture and compare its stable subjects with the intended change.
Make sure that the requested scope, flow, and every narrative beat remain available.
Run affected semantic, code, and embed owners through `archboard check`.
Retain exact history before sharing a checkpoint or recording a walkthrough.
Report concrete changes, refusals, unavailable source, and recovery work.
Never claim frontend acceptance, adoption, publication, or migration without the corresponding successful operation.

## References

[Setup](references/setup.md) covers installation and local source tooling.
[Schema references](references/schemas.md) point to generated runtime contracts.
[Canonical models](references/canonical-models.md) describe authoring and history operations.
[Canonical walkthroughs](references/canonical-walkthroughs.md) describe captured narratives and recordings.
[Legacy migration](references/legacy-migration.md) preserves original identities, states, and exact bytes through explicit cutover.

## Source evidence catalogue

Use each feature when the source or requested design establishes it.
This catalogue also gives evaluations stable feature names across retained reports.

| Row | Canonical evidence |
| --- | --- |
| `external` | Mark a module outside the described ownership boundary. |
| `binding` | Bind a module to the source that implements its responsibility. |
| `containment` | State parent identities without a fixed level. |
| `relationship` | Author each relationship on its source module. |
| `traffic` | State meaningful effective traffic properties. |
| `emphasis` | Mark the main exchange when it helps the reading. |
| `repeat` | Record repeated exchanges on authored steps. |
| `note` | Attach relevant evidence or constraints to a step. |
| `groups` | Apply configured group identities. |
| `flow` | Author an independent collection and complete exchange. |
| `view` | Select a content-free reading or imported bookmark. |
| `walkthrough` | Author ordered beats with exact reading targets. |
| `drillDown` | Follow an explicit model reference or recursive module scope. |
| `description` | Explain responsibilities and significant architectural decisions. |
