---
name: archboard-dev
description: >-
  Keep archboard's architecture boards and consumer skill aligned with product changes.
  Use when planning, implementing, or closing work in this repository.
---

# Work on archboard

The boards in `.archboard/vault` describe this repository's architecture.
A proposal is a draft of an architectural change.

Use the [archboard skill](../archboard/SKILL.md) for board commands.
Use the [vault guide](../../.archboard/README.md) to find the relevant boards.

## Plan the change

Identify the boards whose meaning the change affects.
Changes that leave those boards accurate need no proposal.
Record the affected boards, or explain why none need changes, in the task notes.

Before implementation, create a proposal on each affected board.
Name each proposal after the task ID.
Draw the planned architecture on each proposal.
Record its `<board>@<task-id>` address in the task plan.

If the architecture needs a new board, create it as a draft.
Link it from the board that introduces its subject.

## Finish the change

Make each proposal describe what the code does.
Include affected boards that the original plan missed.

Compare each proposal with its parent.
Run the code check against the proposals.
Read the source for claims that the check cannot assess.
Fix findings caused by the task.
Record any limits of the evidence in the task notes.

Adopt the proposals when the work is complete.
Commit the board files with the work.
If the task is canceled, shelve its proposals with a reason.

Edit a current variant directly only to correct an existing factual error.

## Maintain the consumer skill

`skills/archboard` teaches agents in other repositories how to use Archboard.

When a change affects how agents use Archboard, update the consumer skill in the same change.
Update the affected instructions, recipes, examples, and references.

Keep shared guidance usable across repositories and programming languages.
Put Archboard-specific details in worked examples.

When a change adds or alters an evaluated behavior, update its scenarios and coverage under `evals/`.
Keep evaluation inputs outside the distributed skill.
For evaluation procedures, read [evals/README.md](../../evals/README.md).
Run model evaluations only when a person requests them.

Measure success by correct workflow completion and total tokens spent, including discovery and recovery.
Claims of improvement need comparable runs under the same product contract.
If that contract changes, establish a new baseline before claiming token savings.
