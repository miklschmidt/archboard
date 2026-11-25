# Retain, recover, publish, correct, and export history

Use this reference for checkpoints, interrupted-operation recovery, private non-Git archives, remote history publication or fetch, historical state corrections, and portable bundle export/import.

## Retain an exact local reading

A checkpoint preserves a reading and its exact architecture inputs.
A baseline is the retained starting point for changes.
Use a vault in a source Git repository, or [initialize private history](#initialize-private-history).
`model retain` captures Current.
For a draft, use the checkpoint returned by its proposal edit. For an empty planning model, use the `model init` checkpoint.
For Current retention, read the model and keep `revision.digest`.

```bash
archboard model retain -C <directory> \
  --operation-id capture-1 --writer <agent-name> \
  --expect-revision <revision.digest> \
  --doing "retaining the reviewed architecture"
archboard model checkpoints -C <directory>
archboard model read -C <directory> --checkpoint <checkpoint.id>
archboard model read 'Shop#Gateway' -C <directory> --checkpoint <checkpoint.id>
```

Supply the writer, doing line, operation identity, and expected revision.
For each required baseline, add `--dependency <checkpoint.id>` with its complete immutable identity.
A missing dependency refuses retention before checkpoint creation.
Retention keeps required baselines with the checkpoint.

Retention preserves the source index, HEAD, checkout, and architecture files.
It saves recognized architecture inputs and metadata, not source-code bytes.

The result includes `checkpoint.id`, `model`, `state`, `revision`, `createdAt`, `request`, `sources`, and `publication` evidence.
Linked worktrees share the archive but keep separate current architecture.
Before sharing history, follow [publication](#publish-and-fetch-history).

## Retry and recover operations

Use a new operation identity for each new intent or changed request.
If a response is lost, repeat the exact request and identity.
A completed retry returns the same receipt, allocated identities, checkpoint, and lifecycle event, even after current files change.
Reusing an identity with different input returns `OPERATION_REUSED`.

For writes, `applied:true` means that installation completed durably.
`cleanup:pending` still means applied. Repeat the exact request to finish cleanup.
Completed retries work even with invalid current files or another write in progress.
If another process finishes cleanup after completion, the original request still succeeds with `cleanup:"pending"`.
A refusal reports `applied:false` before installation or `applied:"unknown"` when the outcome remains uncertain.

During installation, leave the vault files and checkout unchanged.
Invalid or changing inputs block new writes.
Unrelated authored files keep their exact bytes.

If a write returns `RECOVERY_REQUIRED`, run `archboard model recover -C <directory>` in the original checkout.
Recovery resumes the original operation and checkpoint.
If recovery finds foreign content, preserve it before restoring a logged image.
If the branch or HEAD differs, restore the recorded context before retrying.
Leave recovery files intact when recovery refuses.

The failure's `recovery` names the operation, checkpoint, progress, fingerprints, branch, and HEAD.
While current reads remain blocked, inspect the candidate with `model read --checkpoint <recovery.checkpoint>`.
If application remains uncertain, recover or retry the original request.

## Initialize private history

For a vault outside a source repository, initialize its archive before retention or edits:

```bash
archboard model archive-init -C <directory>
```

The result's `archive` names the local history directory.

Initialization creates no `.git` in the vault or enclosing directory.
It refuses source repositories and machine storage inside a source repository.
Repeating it returns the same archive without replacing content.

Retain, read, claim, edit, and recover use the archive automatically.
Private checkpoints invent no source association.
Current architecture and recovery records stay specific to the vault.

Include the archive in backups.
Moving the vault does not move its archive or recovery records.
For pending recovery, preserve the original location.
For portable transfer, use [export](#export-and-restore-a-model) or [migration](legacy-migration.md).

History stays local until explicit publication.
For publication, add the intended named remote with `git -C <archive> remote add`.
Initialization, remote creation, and destination configuration send no history.

If a source repository appears around private history, archive operations refuse the ownership change.
Restore the vault outside that repository before further archive work or recovery.
If storage is damaged, preserve it and restore a complete backup.
Initialization never overwrites damaged storage.

## Publish and fetch history

A source-code push or artifact upload does not publish the independent architecture archive.
Configure an existing named remote and a complete independent archive branch ref:

```bash
archboard model publication-configure -C <directory> \
  --remote <remote-name> --ref refs/heads/archboard-history
archboard model publication <checkpoint.id> -C <directory>
archboard model publish <checkpoint.id> -C <directory> \
  --remote <remote-name> --ref refs/heads/archboard-history
```

Configuration stays private, applies across linked worktrees, and changes no architecture inputs.
Use the configured destination for every publication and recovery request.
If its remote URL changes, configure it again.
`PUBLICATION_DESTINATION_CHANGED` rejects former authorization and publication evidence but leaves local retention and exact reads available.

Publication reports these states:

- `saved-locally`: Local architecture has no publication evidence for the selected destination.
- `publication-pending`: A durable intent awaits a successful exchange, including every retained dependency.
- `published`: An explicit push or fetch established availability for that checkpoint.
- `unavailable`: The operation cannot open or restore the requested history.

Evidence survives restarts and describes the last successful exchange, not future remote availability.
`retention.protected:false` states that limit.
For durable shared history, the remote owner must prohibit ref rewrites and deletion and keep a backup.

If the remote has newer history, publication preserves both histories without merging model content.
Publication preserves checkpoint identities and never force-pushes.

If the network fails, local history remains retained.
Read saved status without network access through `model publication`.
After access returns, repeat `model publish` with the same checkpoint and destination.
An interrupted exchange stays pending until explicit publication succeeds.

To restore missing history, configure the owner's destination, then fetch it:

```bash
archboard model fetch <checkpoint.id> -C <directory> \
  --remote <remote-name> --ref refs/heads/archboard-history
archboard model read -C <directory> --checkpoint <checkpoint.id>
```

Fetch restores complete ancestry, deepens shallow history, and retains a named local reference.
It preserves current files, the index, source HEAD, and source fetch mappings.
Fetched checkpoints appear in `model checkpoints`.
Archive order never selects current architecture or proposal ancestry.

`ARCHIVE_NOT_PORTABLE` rejects checkpoints that contain machine-local source repository paths.
Publication and `model export` cannot redact immutable metadata.
Keep those checkpoints local. Because each new checkpoint keeps the existing archive tip as its parent, a portable repository identity on a later checkpoint does not make that archive publishable or exportable; use portable repository identities from the start for future archives.

## Reopen and recover

Exact reads require a complete `checkpoint.id`, not a branch or abbreviated hash.
Selectors resolve only against that retained reading.
Current files never supply missing historical content.
`model checkpoints` lists metadata without reading current architecture and omits synchronization records.
Select the intended checkpoint explicitly.

An exact read adds `checkpoint` and `sourceEvidence` to the model result.
Each evidence entry names its repository, commit, uncommitted status, and availability:

- `available`: The committed source revision is local.
- `uncommitted`: The base exists, but exact uncommitted code needs separate recovery.
- `unavailable`: The source checkout or commit is unavailable, or no source commit existed.

The latter two include recovery instructions.
Architecture remains readable without source evidence, even when current model files are missing or invalid.
`ARCHITECTURE_UNAVAILABLE` means that retained architecture or a required baseline is missing.
Restore the archive from its owner or backup, using [fetch](#publish-and-fetch-history) when the owner publishes it.
Exact reads never contact the network automatically.

If `ARCHIVE_IN_USE` says a worktree has `archboard-history` checked out, switch that worktree to another branch before retrying.
If it names a private archive location inside a source repository, follow the diagnostic to use source-backed history or restore the private vault or state directory outside Git.
`ARCHIVE_UNREADABLE` means damaged storage or an unrelated branch using the reserved name.
Preserve that branch and resolve its ownership before retrying.
`ARCHIVE_NEWER` means a newer Archboard wrote the history.
Update Archboard; never restore, fetch or roll back `archboard-history` for it.

## Correct a recorded state

Use correction for factual errors in historical or shelved states, and a new proposal for a new design.
Read the logical state and keep `checkpoint.id`.
Read the current catalogue again for its complete `revision`.
Claim the model, completed state, affected subjects, and following drafts affected by the correction.

Inspect supporting source commits.
Supply an available full Git commit ID for each repository named by the corrected state's bindings, anchors, or documents, including unchanged subjects. Uncommitted files cannot support historical corrections.

Submit `model edit` with ordinary module or flow changes and a correction intent:

```json
{
	"target": { "model": "Shop", "state": "Parked" },
	"expectedRevision": { "digest": "<current catalogue digest>", "files": [] },
	"operationId": "correct-routing-1",
	"writer": "agent",
	"claim": "<claim id>",
	"correction": {
		"previous": "<latest logical checkpoint id>",
		"reason": "The recorded source already routed these requests.",
		"revisions": [{ "repo": "github.com/acme/shop", "commit": "<full source commit id>" }]
	},
	"changes": [
		{
			"type": "edit-module",
			"subject": "Shop#Gateway",
			"set": { "description": "Routes authenticated requests." }
		}
	]
}
```

Replace example state and claim values with stable IDs and copy the actual complete revision, including files.
Pass the doing line through `--doing`.
POST `/api/architecture/module` accepts the same request with explicit vault and doing line.

The writer refuses current or draft targets, unavailable source, empty factual changes, and stale `correction.previous`.
Correction changes no current designation, state name, ancestry, or adoption decision.
The new checkpoint retains its predecessor. Current files hold no completed correction history.

Logical reads expose the latest correction and `selectedState.corrections`.
Each audit entry names checkpoint, previous checkpoint, time, reason, and source revisions.
Exact original checkpoints keep original facts.
`comparison.corrections` includes both audit trails beside semantic differences.
Divergent corrections require an exact checkpoint, never archive order.

Following local drafts reconcile with standing for conflicts and blocked descendants.
Adopted successors and unrelated Current keep their content.
[Retry and recovery](#retry-and-recover-operations) return the same correction.
Publication and fetch keep its complete dependency chain. Source history stays separate and can become unavailable.

## Export and restore a model

A portable bundle holds authored inputs and their complete archive.
It preserves identities, proposals, decisions, corrections, standing, and walkthrough targets.
Source files remain separate. Foreign references keep exact pins and need their separately available models.
Export from the available vault:

```bash
archboard model export --out architecture.json -C <source-directory>
```

Create an empty `.archboard/vault` at the destination.
Outside a source repository, initialize [private history](#initialize-private-history) before import.
The empty destination revision is:

```json
{
	"digest": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
	"files": []
}
```

Prepare `bundle`, `expectedRevision`, `operationId`, `writer`, and `doing`.
Put the exported JSON object in `bundle` and the complete destination revision in `expectedRevision`.
Submit it:

```bash
archboard model import --input import-request.json -C <destination-directory>
```

Import accepts empty inputs or byte-identical inputs with history to restore.
It refuses different authored content, malformed paths, changed fingerprints, corrupt objects, and missing dependencies before installation.
A planning-only import keeps no Current and records `state:null`.
Use [retry and recovery](#retry-and-recover-operations) in the same destination after interruption.

To restore deleted history behind unchanged inputs, use their current complete revision.
Keep the bundle as a backup because local archives can be deleted.
Import excludes publication destinations, receipts, claims, and private recovery files.
Configure and publish destination history explicitly when needed.
