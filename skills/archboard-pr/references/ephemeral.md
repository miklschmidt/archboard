# Use a temporary model

Use a temporary model for an incidental flow or process that the repository does not need to retain.
Follow the consumer skill's ordinary authoring, claims, private history, and proposal recipes.
Keep output artifacts outside its vault and use `-C` on every model command.
The existing server serves this vault. Leave it running throughout this workflow.

Create the directory outside every source checkout:

```bash
pr_evidence_root=$(mktemp -d)
mkdir -p "$pr_evidence_root/.archboard/vault"
archboard model archive-init -C "$pr_evidence_root"
```

Configure the returned archive's identity and signer through the consumer private-history recipe, then initialize:

```bash
archboard model init --name 'Review evidence' --operation-id initialize-review --writer agent --doing 'Initialize review evidence' -C "$pr_evidence_root"
archboard model read -C "$pr_evidence_root"
```

Follow the consumer planning-root recipe. Even a single agent needs claims.
Read base code with `git show <base>:<path>` and head code from its actual source.

Bind modules to implementing repository identities and paths.
Describe base and proposed behavior through explicit independent or dependent states.
Preserve continuing IDs. Source implemented elsewhere does not turn a planning proposal into Current.
Do not adopt just to obtain comparison marks.

Use `model compare`, plus `model footprint` and `check code --state` where bindings support them.
Inspect skipped source directly.
Foreign bindings use registered chosen checkouts. Follow consumer setup rules before changing checkout selection.
For [renders](renders.md) and [walkthroughs](walkthrough.md), use their exact checkpoint recipes.

Keep SVG, PNG, video, talk files, and receipts until posting completes.
If the model needs a portable backup, use `model export`.
Standalone pictures and videos can be shared without publishing the archive.
For reproducible history, follow the parent skill's publication step and temporary state comment.

After preserving evidence, release claims and remove its temporary registration through `repo forget`.
Remove only inputs created by this workflow that no longer serve the task.
Keep private history and recovery files while pending operations or retained evidence need them.
Leave the repository's vault unchanged.
