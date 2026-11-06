---
name: archboard-pr
description: >-
  Write or update a PR body in a repository with an .archboard/vault, or one
  whose architecture lives in another repository's vault. Load it together
  with any other PR-body skill: it adds the proposal, the rendered architecture
  pictures and the evidence that Summary, Evidence and Merge Danger need.
---

# Explain a pull request

A reviewer needs the problem, resulting behavior, evidence, and merge risk.
Write one body with these sections in order:

- Summary explains the change with a picture when architectural meaning changes.
- Evidence names the behavior that demonstrates the result.
- Merge Danger names reversibility, affected callers, and the first place to inspect.

This structure follows the [pr skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md) by Matt Pocock, under MIT.
Use these same sections when another PR skill also applies.
Read the `archboard` consumer skill before the first architecture operation.
It owns command recipes, schemas, claims, retention, and recovery.

## Select the evidence

Read the diff from the merge base through `git diff --find-renames <base>...HEAD`.
For an existing dependent PR, use its actual base branch.
Honor the user's requested PR structure.
A request for one integration PR keeps one PR, even when the work crosses several modules.
Read [splitting](references/split.md) only when independent delivery provides a concrete benefit and the user permits splitting.

Run model commands in the checkout that holds its vault, or pass `-C <checkout>`.
If architecture lives elsewhere, use that repository's vault explicitly.
Discover canonical modules and proposals through `model read` and `model proposals`.
Use `model footprint --base <base> --head <head>` for bound source changes.
Read the diff for skipped or unavailable source.

Choose the smallest useful explanation:

- For durable architecture changes, use the existing canonical model and a compact proposal.
- For an incidental flow or process, use a [temporary canonical model](references/ephemeral.md).
- For a design-only change, follow [design evidence](references/design.md).
- For a change that leaves architectural meaning accurate, use concise text or a code example.

If discovery returns `LEGACY_AUTHORITY`, follow the consumer migration reference.
Inventory and preview remain available without cutover.
Only owner-authorized migration creates live canonical authority.
Never rewrite original inputs to obtain a PR picture.

Done: every architectural change in the diff has an explanation and an identified model state or source evidence.

## Prepare the proposal

Read the PR's existing state comment before creating a draft.
Find the actual proposal by stable identity, not just its name.
Keep independent proposals separate when their names match.
If a proposal predates the code, follow [reconciliation](references/reconcile.md).
Documentation of an already-implemented proposal needs no additional architectural proposal.

Follow the consumer proposal recipe in the loaded `archboard` skill to create or edit the draft.
Preserve source evidence, document references, and authored order.

Compare against the actual review base:

```bash
archboard model compare --state <proposal-id> --against <base-state-or-checkpoint> -C <checkout>
archboard model footprint --base <base-ref> --head <head-ref> --state <proposal-id> --against <base-state-or-checkpoint> -C <checkout>
archboard check code --state <proposal-id> -C <checkout>
```

For a planning root, use its empty baseline and leave absent selectors omitted.
Read comparison metadata before assuming a default base.
Make sure that the comparison's separate base revision matches any separately read base definitions.
Resolve standing through explicit reconciliation and settlement.
Fix findings introduced by the change and record unavailable evidence.
Commit tracked authored inputs with the implementation.

Done: the proposal describes the implemented change, and comparison evidence accounts for its changed subjects.

## Render and narrate

Follow [renders](references/renders.md) for exact canonical selectors and visual inspection.
Record a [walkthrough](references/walkthrough.md) when the user requests it or when order across several parts needs explanation.
Follow the consumer history workflow in the loaded `archboard` skill before sharing checkpoint-dependent evidence.
If setup or publication is unavailable, report the limit and provide the completed artifacts.
Use existing authorization for setup and sign-in.

Done: artifacts name their exact reading, and their inspection and history availability are recorded accurately.

## Write and post

Keep the visible body brief and use the repository's domain terms.
Name each proposal and state in the visible body by its name, as the consumer skill says. The state comment carries the IDs.
Lead Summary with the concrete problem and resulting behavior.
Show pictures with descriptive alt text.
Put a narrated video and collapsed transcript below its picture when one exists.
Use [posting](references/posting.md) to upload artifacts through supported tooling.
Keep local paths out of the published body.

Preserve this state comment for future updates:

```markdown
<!-- archboard-pr:begin -->
<!-- archboard-pr model="<model-id>" state="<proposal-id>" checkpoint="<exact-checkpoint>" against="<base-state-or-checkpoint>" -->

## Summary

Requests now enter the queue before workers process them.

![The gateway sends accepted requests to the queue](uploaded-image-url)

## Evidence

The request integration case passes with a queued request and a worker result.

## Merge Danger

The change is reversible. Queue callers depend on the message format in the gateway adapter.
<!-- archboard-pr:end -->
```

Omit unavailable optional comment fields instead of inventing values.
For an external vault, add its portable repository identity as `vault`.
For temporary evidence, write `<!-- archboard-pr temporary -->`.
A future update regenerates that evidence from code.

Evidence names a before and after when both exist.
For new behavior, name the focused test or observed result.
Visible changes need inspected visual evidence.
Documentation needs source-contract and formatting evidence, without new prose tests.

Merge Danger explains whether a revert restores behavior.
Name irreversible external effects, affected consumers, and the first relevant source location.
Keep artifact-generation details and temporary limitations in the handoff unless they affect review or reproducibility.

On update, replace the marked section and preserve author text outside it.
Read the body back after posting.
Make sure that each image uses an uploaded URL and each video URL occupies its own paragraph.

## Adopt in the implementing PR

A PR that implements a proposal adopts that proposal on its own branch.
Then the code and its architecture reach the default branch in one merge.
The owner's request to prepare the implementing PR authorizes the adoption.

After the branch implements the proposal, adopt it before review.
Follow the consumer adoption recipe in the loaded `archboard` skill.
Commit the adopted vault files with the implementation, and update the state comment.

If the vault lives in another repository, the adoption is a commit in that repository, so it cannot merge with the code.
Tell the owner. Prepare the adoption in a PR of the vault's repository, link each PR from the other's body, and ask the owner which merges first.

If the default branch adopted another proposal first, the proposal follows a former current state and the adoption refuses with `PROPOSAL_SUPERSEDED`.
Do not force the adoption, because a forced adoption installs the proposal's complete state and undoes the other adoption.
Create a new proposal on the current state with the same name, summary, documents and changes.
Before you adopt it, find what the other adoption changed: `model compare --state <current-id> --against <original-predecessor-id>`.
Then compare the original with that same predecessor. A subject that both comparisons change is a conflict.
If the copy would undo or conflict with a change of the other adoption, tell the owner, and adopt only after the owner decides.
After the adoption, shelve the original with a reason that names the copy.

If a draft describes code that the default branch already holds, tell the owner. If the owner agrees, adopt it in the PR that you prepare.

If the work stops, shelve only when the owner authorizes that disposition.
Retain the reason and exact baseline through the existing archive.
A temporary model needs no lifecycle change in the repository's architecture.
