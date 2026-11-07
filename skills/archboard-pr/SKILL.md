---
name: archboard-pr
description: >-
  Help agents and humans understand architectural changes and choose meaningful
  PR boundaries. Use when creating PRs, updating PRs, or writing PR bodies, and
  load it together with any other PR skill, such as pr.
---

# Explain a pull request

Write one body with these sections:

- Summary: The problem and resulting behavior, with a picture for changed architectural meaning.
- Evidence: The behavior or source facts that demonstrate the result.
- Merge Danger: Reversibility, affected consumers, and the first source location to inspect.

This structure follows Matt Pocock's MIT-licensed [pr skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md).
Use it when another PR skill applies too.
Before architecture operations, load the `archboard` consumer skill.
It owns discovery, authoring, schemas, claims, comparison, retention, publication, and recovery recipes.

## Select the evidence

Read `git diff --find-renames <base>...HEAD` from the merge base.
For a dependent PR, use its actual base branch.
Honor the requested delivery structure, including one integration PR across several modules.
Read [splitting](references/split.md) only when independent delivery helps and the user permits it.

Address the owning vault explicitly, including one in another repository.
Discover modules and states through `model read` and `model proposals`.
Use `model footprint --base <base> --head <head>` for bound source changes.
Read skipped or unavailable source directly from the diff.

Choose the evidence that fits:

- Durable architecture changes: Use the existing model and a compact proposal.
- Incidental flows or processes: Use a [temporary model](references/ephemeral.md).
- Design-only changes: Follow [design evidence](references/design.md).
- Unchanged architectural meaning: Use concise text or a code example.

For legacy authority, follow the consumer migration reference for inventory and preview.
Never rewrite originals just to obtain a PR picture.
Finish when every architectural change has an explanation tied to an identified model state or source evidence.

## Prepare the proposal

Read the existing PR state comment before creating a proposal.
Locate its stable ID through the catalogue.
For a proposal that predates code, follow [reconciliation](references/reconcile.md).
Documentation of implemented architecture needs no additional proposal.
Use consumer authoring and comparison recipes, preserving source evidence, documents, and order.

Compare with the actual review base:

```bash
archboard model compare --state <proposal-id> --against <base-state-or-checkpoint> -C <checkout>
archboard model footprint --base <base-ref> --head <head-ref> --state <proposal-id> --against <base-state-or-checkpoint> -C <checkout>
archboard check code --state <proposal-id> -C <checkout>
```

For a planning root, use its empty baseline and omit absent selectors.
Fix findings caused by the change and record unavailable evidence.
Commit tracked authored inputs with implementation.
Finish when proposal meaning matches implementation and comparison accounts for every changed subject.

## Prepare artifacts

Follow [renders](references/renders.md) to choose and inspect exact pictures.
For requested narration or interactions that need ordered explanation, follow [walkthroughs](references/walkthrough.md).
Before sharing checkpoint-dependent evidence, follow the consumer publication recipe.
Use existing setup and sign-in authorization.
If setup or publication is unavailable, provide completed artifacts and state the limit.
Finish when each artifact's reading, inspection, and history availability are known.

## Write the body

Keep visible prose brief and use repository domain terms.
Use proposal and state names as the consumer authoring reference requires.
Lead Summary with the concrete problem and resulting behavior.
For videos and transcripts, follow the walkthrough reference.
For upload, replacement, and posted-body inspection, follow [posting](references/posting.md).

Keep this comment and marked section for future updates:

```markdown
<!-- archboard-pr:begin -->
<!-- archboard-pr model="<model-id>" state="<proposal-id>" checkpoint="<exact-checkpoint>" against="<base-state-or-checkpoint>" -->

## Summary

Requests now enter the queue before workers process them.

![The gateway sends accepted requests to the queue](uploaded-image-url)

## Evidence

The request integration case passes with a queued request and a worker result.

## Merge Danger

A revert restores direct dispatch, but it drops any request still in the queue. Workers read the queued message through `QueuedRequest` in `src/queue/message.ts`, so a change to that format breaks them first.
<!-- archboard-pr:end -->
```

Omit unavailable optional comment fields.
For an external vault, add its portable repository identity as `vault`.
For temporary evidence, use `<!-- archboard-pr temporary -->` so later editors regenerate it from source.

Evidence states before and after when both exist.
For new behavior, name the focused test or observed result.
Visible changes require inspected visual evidence.
Documentation requires source-contract and formatting evidence, without new prose tests.
Merge Danger states whether reverting restores behavior and names irreversible external effects.
Keep generation details and temporary limits in the handoff unless they affect review or reproduction.

## Adopt in the implementing PR

Follow the consumer proposal completion recipe for authorization and adoption.
After implementation, adopt on the PR branch before review so code and architecture merge together.
Commit adopted inputs and update the state comment.
If the vault lives in another repository, the adoption cannot merge with the code. Prepare it in a PR of the vault's repository, link each PR from the other's body, and ask the owner which merges first.
For a temporary model, leave the repository's lifecycle unchanged.

If another proposal reached Current first, `PROPOSAL_SUPERSEDED` refuses adoption.
Do not force it: full replacement undoes the other adoption.
Create a new proposal on Current with the same name, summary, documents, and changes.
Before adoption, compare Current and the original each with the original's predecessor through `model compare --state <id> --against <predecessor-id>`.
A subject that both comparisons change is a conflict. Tell the owner, and adopt only after the owner decides.
Adopt that proposal, then shelve the original with a reason naming its replacement.
If default-branch code already implements the draft, tell the owner before adoption and obtain agreement.
For stopped work, follow the consumer shelving authorization rule and retain its reason and exact baseline.
