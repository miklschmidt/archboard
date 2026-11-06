---
name: archboard-dev
description: >-
  Keep Archboard's canonical architecture model and consumer guidance aligned
  with product changes. Use when planning, implementing, or closing work in
  this repository.
---

# Work on Archboard

The authored inputs in `.archboard/vault` describe this repository.
Use [the consumer skill](../archboard/SKILL.md) for commands and schemas.
Use [the vault guide](../../.archboard/README.md) for repository context.
Discover actual authority through `archboard model read` before authoring.

## Plan the change

Identify the modules, relationships, flows, and walkthroughs whose meaning the change affects.
Record those identities in the task notes.
Read each affected module through `model inspect`, and read `model locality` for what changes with it.
If the existing architecture stays accurate, record why no proposal is needed.
Documentation of an already-implemented proposal needs no second proposal.

Before implementation, create one compact proposal for each independent architectural intent.
Name it for what it changes and give it a summary, as the consumer skill says.
Record its stable state ID, predecessor, model, and vault in the task plan.
One proposal can span several modules and flow collections.
Matching names never combine independent proposals.

For planning roots, claims, and legacy refusals, follow the consumer skill.
Release claims when the authoring intent ends.

## Finish the change

Make the proposal describe the implemented architecture.
Include affected subjects that the original plan missed.
Compare the selected state through `model compare` against its intended base.
Set the branch against the proposal through `model footprint`.
Make sure that proposal standing and affected descendants are settled.

Run focused semantic and code inspection for the affected model state.
Inspect source for claims that the automated evidence cannot assess.
Fix findings caused by the task, including `RELATIONSHIP_ON_CONTAINER`, `CONTAINER_PASS_THROUGH`, `CONTAINER_UNBOUND`, `CONTAINER_PARTS_OUTSIDE`, `ROOT_UNCONNECTED`, and `CONTAINER_LINE_TO_OWN_PART` on subjects that it touched.
Record unavailable source and other evidence limits in the task notes.
Use the narrow validation owners required by the changed behavior.
Reserve the complete repository gate for integration acceptance or an explicit request.

Adopt only when the owner's instructions authorize that outcome.
A code merge, approval, or retained checkpoint never adopts architecture.
Shelve an abandoned proposal with its reason through the same model edit operation.
Commit the affected authored inputs with the work.

Before sharing evidence, follow the consumer history, publication, and recovery recipes.

## Maintain consumer guidance

`skills/archboard` teaches agents in other repositories how to use Archboard.
When a product change alters agent behavior, update the affected consumer guidance in the same change.
Derive commands from shipped CLI contracts and schemas.
Keep general guidance usable across repositories and languages.
Put repository-specific detail in worked examples.

When a change alters evaluated behavior, update the affected scenarios and coverage under `evals/`.
Keep evaluation inputs outside the distributed skill.
Use [evaluation procedures](../../evals/README.md) for deterministic validation.
Leave model evaluations to the person who runs them.

Measure workflow completion and total tokens, including discovery and recovery.
Compare runs only under the same product contract.
If that contract changes, establish a new baseline before claiming token savings.
