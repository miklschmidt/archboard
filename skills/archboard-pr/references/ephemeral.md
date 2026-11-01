# Use a temporary canonical model

A temporary model explains an incidental flow or process that the repository's architecture does not need to keep.
It uses the same manifest, subject claims, compact proposals, archive, and writer as any canonical model.
It creates no temporary board format or alternate authoring path.

## Initialize the vault

Create a directory outside every source checkout.
Keep output artifacts outside its vault.
Use `-C` on every model command so that discovery cannot address the repository's vault accidentally.
The existing local server can serve this explicitly addressed vault.
A second server is unnecessary.

```bash
pr_evidence_root=$(mktemp -d)
mkdir -p "$pr_evidence_root/.archboard/vault"
archboard model archive-init -C "$pr_evidence_root"
```

Configure the returned private archive's Git identity and signer through the consumer private-history recipe.
Keep required signing enabled.
Initialize the canonical planning model through the shared installer:

```bash
archboard model init --name 'Review evidence' --operation-id initialize-review --writer agent --doing 'Initialize review evidence' -C "$pr_evidence_root"
archboard model read -C "$pr_evidence_root"
```

The new model has no implemented current state.
Follow the consumer planning-root proposal recipe for the explanation.
Claims remain required even when no other agent uses the temporary model.

## Describe the source

Read the base branch through `git show <base>:<path>` and the head branch through its actual source.
Bind modules to their implementing repository identity and paths.
Describe the base and proposed behavior through explicit independent or dependent states in this model.
Keep continuing subject IDs unchanged.
A planning proposal remains proposed even when its source evidence comes from implemented code elsewhere.
Do not adopt temporary architecture merely to obtain comparison marks.

Use `model compare` for exact semantic differences.
Use the selected proposal with `model footprint` and `check code --state` when source bindings support that evidence.
Inspect skipped source directly.
An untracked vault resolves foreign bindings through the registered chosen checkouts.
Changing the chosen checkout requires the existing explicit repository workflow.

## Keep the evidence

Use the proposal edit's exact checkpoint for [renders](renders.md) and [walkthroughs](walkthrough.md).
Read that checkpoint before recording.
A temporary planning model cannot use current-only retention without implemented current architecture.
Keep SVG, PNG, video, talk files, and receipts until posting completes.
Use `model export` when the temporary model itself needs a portable backup.

A standalone picture or video remains shareable without publishing the private archive.
State that reproducible history is local-only unless an authorized publication operation succeeds.
The temporary state comment tells the next PR editor to regenerate evidence from source.

After preserving the requested evidence, release claims and forget the temporary registry entry through `repo forget`.
Remove only the temporary inputs that this workflow created and no longer needs.
Keep private archive and recovery records until no pending operation or retained evidence depends on them.
Leave any shared server running.
The repository's vault remains unchanged throughout this workflow.
