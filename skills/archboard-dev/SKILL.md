---
name: archboard-dev
description: >-
  Keep Archboard's canonical architecture model and consumer guidance aligned
  with product changes. Use when planning, implementing, or closing work in
  this repository.
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
