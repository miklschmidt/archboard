---
name: archboard-dev
description: >-
  Keep Archboard's canonical architecture model and consumer guidance aligned
  with product changes. Use when planning, implementing, or closing work in
  this repository.
---

# Work on Archboard

The authored inputs in `.archboard/vault` describe this repository.
A proposal is a draft architectural state across modules, flows, and walkthroughs.
Use [the consumer skill](../archboard/SKILL.md) for commands and schemas.
Use [the vault guide](../../.archboard/README.md) for repository context.
Discover actual authority through `archboard model read` before authoring.

## Plan the change

Identify the modules, relationships, flows, and walkthroughs whose meaning the change affects.
Record those identities in the task notes.
If the existing architecture stays accurate, record why no proposal is needed.
Documentation of an already-implemented proposal needs no second proposal.

Before implementation, create one compact proposal for each independent architectural intent.
Use the task ID as its discoverable name.
Record its stable state ID, predecessor, model, and vault in the task plan.
One proposal can span several modules and flow collections.
Matching names never combine independent proposals.

If a model has no current architecture, create a planning-root proposal against its empty baseline.
Keep unbuilt subjects proposed until explicit adoption.
Claim the affected subjects, state, and structure scopes through the shared model writer.
Release claims when the authoring intent ends.

If `model read` returns `LEGACY_AUTHORITY`, follow [explicit migration](../archboard/references/legacy-migration.md).
Preserve original bytes and independent drafts until the owner authorizes complete mappings and installation.
Use retained originals for exact historical evidence.
Retired board commands provide no live authoring route.

## Finish the change

Make the proposal describe the implemented architecture.
Include affected subjects that the original plan missed.
Compare the selected state through `model compare` against its intended base.
Make sure that proposal standing and affected descendants are settled.

Run focused semantic and code inspection for the affected model state.
Inspect source for claims that the automated evidence cannot assess.
Fix findings caused by the task.
Record unavailable source and other evidence limits in the task notes.
Use the narrow validation owners required by the changed behavior.
Reserve the complete repository gate for integration acceptance or an explicit request.

Adopt only when the owner's instructions authorize that outcome.
A code merge, approval, or retained checkpoint never adopts architecture.
Shelve an abandoned proposal with its reason through the same model edit operation.
Commit the affected authored inputs with the work.

Retain exact history before sharing a reading or recording a walkthrough.
Publish the independent archive explicitly when collaborators need those checkpoints.
A source push alone does not share it.
Keep configured Git signing enabled.
Use `model recover` in the original checkout when interrupted installation requires recovery.

## Maintain consumer guidance

`skills/archboard` teaches agents in other repositories how to use Archboard.
When a product change alters agent behavior, update the affected consumer guidance in the same change.
Derive commands from shipped CLI contracts and schemas.
Keep general guidance usable across repositories and languages.
Put repository-specific detail in worked examples.

When a change alters evaluated behavior, update the affected scenarios and coverage under `evals/`.
Keep evaluation inputs outside the distributed skill.
Use [evaluation procedures](../../evals/README.md) for deterministic validation.
Run model evaluations only when a person requests them.

Measure workflow completion and total tokens, including discovery and recovery.
Compare runs only under the same product contract.
If that contract changes, establish a new baseline before claiming token savings.
