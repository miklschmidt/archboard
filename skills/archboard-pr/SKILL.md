---
name: archboard-pr
description: >-
  Explain a pull request with Summary, Evidence, and Merge Danger sections.
  Use canonical model proposals for architecture changes, temporary canonical
  models for incidental flows, and retained readings for renders and narrated
  walkthroughs. Use when creating, updating, or explaining a pull request in
  a repository with an .archboard/vault, including architecture kept in another
  repository.
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

Read the predecessor and keep its complete revision.
Claim affected subjects, state, and structure scopes through `model claim`.
Create or edit the draft through `model edit` using the consumer compact-proposal recipe.
One proposal can span modules, outgoing relationships, independent flows, and walkthroughs.
Preserve continuing IDs, source evidence, document references, and authored order.
Use the draft's stable state ID for later edits.
Release its claim when the authoring intent ends.

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
Retain the selected architecture before recording or sharing a pinned reading.
Use `model render` for SVG and `model rasterize` for PNG.
Use captions and alt text that name the scope, selected state, and change.
The render command exposes no comparison-base flag.
Keep semantic change evidence in `model compare` rather than claiming unprovided comparison marks.

Record a [walkthrough](references/walkthrough.md) when the user requests it or when order across several parts needs explanation.
Each beat states a complete reading and stable subjects.
Recording requires an exact retained checkpoint and uses local voice and rendering.
If a prerequisite is unavailable, report that limit and provide the completed picture and evidence.
Use existing authorization for setup actions and user-owned sign-in.

Before sharing checkpoint-dependent evidence, inspect publication status.
Local retention alone does not establish availability to collaborators.
Publish only to an owner-authorized remote and archive ref through the consumer history workflow.
Use explicit fetch for missing history.
Keep configured signing enabled.
If publication is unavailable, name that limitation and provide standalone artifacts without claiming reproducible shared history.

Done: artifacts name their exact reading, and their inspection and history availability are recorded accurately.

## Write and post

Keep the visible body brief and use the repository's domain terms.
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

## After the source merge

A source merge does not adopt the proposal.
Adopt only when the owner's instructions explicitly authorize implemented architecture.
Use the shared `model edit` adoption intent with a fresh complete revision and affected claims.
Settle blocked ancestry before adoption.
For superseded architecture, read the explicit comparison before any authorized forced adoption.

If the work stops, shelve only when the owner authorizes that disposition.
Retain the reason and exact baseline through the existing archive.
A temporary model needs no lifecycle change in the repository's architecture.
