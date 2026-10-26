# Read, retain, and publish a canonical model

Use this path when the addressed vault contains an authored `model.json` manifest.
Existing `.semantic.json` boards retain authority until explicit migration.
The canonical reader refuses a mixed vault.

Run `archboard model read -C <directory>` to inspect root modules and relationships.
The directory follows the same vault discovery rules as board commands.
The result names the addressed vault.
Read `roots` in order, then find each identity in `modules`.

Run `archboard model read '<qualified-id>' -C <directory>` to select one module.
A qualified identity uses `model[/original-board]#local-id`.
The optional original board records imported provenance.
Each segment follows the existing one-to-eight-character ID authority.
Current and former names work only when exactly one module matches.
If a name is ambiguous, use one of the returned matching identities.

The result includes the manifest, policy, modules, derived relationships, and input revision.
Each module owns `outgoing` relationships.
The derived `relationships` list adds each source as `from`.
Find incoming relationships by their `to` identity.
Module and relationship order comes from authored `order` values.
Qualified IDs resolve equal positions deterministically.

The reader preserves responsibilities, descriptions, groups, bindings, evidence anchors, traffic, and document references.
It validates all discovered definitions before returning any part of the model.
Failures return structured codes, source paths, affected identities, and recovery actions.
An unsuccessful CLI read exits with status 2 and keeps its structured JSON result.

When a pane opens an authored model vault, the browser lists its root modules.
Select a module to read its responsibility, description, evidence, and connections.
The browser keeps selection as presentation state and writes no architecture content.
Use Refresh to read repaired or externally edited files.
Opening the reading, returning to the tab, and reconnecting also refresh its content.
Invalid input shows its source and recovery instructions instead of a partial model.

Open the Current menu in the model header to select a saved reading.
The menu lists the state, retention time, agent intent, and abbreviated identity.
The selected reading shows its complete checkpoint identity and source evidence.
Select Current to return to the working files.
Each selection reads its own inputs again.

Saved readings remain available when current model files are missing or invalid.
Missing source evidence includes a recovery instruction and leaves retained architecture readable.
Missing architecture shows its refusal and recovery instructions instead of current content.
After you restore the archive, use Refresh to reopen the selected checkpoint.
The browser never creates checkpoints or changes architecture inputs.

The revision covers recognized input paths and exact bytes, including policy.
A file rename changes the revision and preserves identity.
A whitespace edit changes the revision and preserves meaning.
An unrelated documentation file does not change the revision.

## Retain an exact local reading

A checkpoint preserves one reading and its exact architecture inputs.
Use a canonical vault inside a source Git repository.
Run `model read` and keep its `revision.digest` before retention.

```bash
archboard model retain -C <directory> \
  --operation-id capture-1 --writer <agent-name> \
  --expect-revision <revision.digest> \
  --doing "retaining the reviewed architecture"
archboard model checkpoints -C <directory>
archboard model read -C <directory> --checkpoint <checkpoint.id>
archboard model read 'Shop#Gateway' -C <directory> --checkpoint <checkpoint.id>
```

The writer, doing line, operation identity, and expected revision are required.
Use a new operation identity for a new retention intent.
If a response is lost, repeat the same identity and request.
The retry returns the same checkpoint, even after current files change.
A reused identity with different input returns `OPERATION_REUSED`.

If the reading requires an earlier baseline, add `--dependency <checkpoint.id>`.
Repeat the flag for several required checkpoints.
Dependencies use complete immutable checkpoint identities.
Retention refuses a missing dependency before creating its new checkpoint.
Actual Git parents preserve dependencies, including after garbage collection.

Retention honors configured Git identity and signing.
It preserves the index, HEAD, checkout, and current architecture files.
If signing fails, repair the configured identity, key, or signer before retrying.
Keep signing enabled when the repository requires it.
The operation retains only recognized architecture inputs and checkpoint metadata.
It creates no source-code snapshot and publishes nothing.

The result carries `checkpoint.id`, `model`, `state`, `revision`, `createdAt`, `request`, and `sources`.
Its `publication` reports explicit archive publication evidence.
Read [Publish and fetch history](#publish-and-fetch-history) before sharing a retained reading.
A normal source-code push does not publish this archive.
Linked worktrees share the archive through Git's common repository directory.
Their current architecture remains separate.

## Publish and fetch history

A source-code push does not establish archive publication.
Configure an existing named Git remote and a complete independent archive branch ref.
Configuration stays private beside shared Git objects.
It applies to the portable vault address across linked worktrees.
It changes no architecture inputs and sends no history.

```bash
archboard model publication-configure -C <directory> \
  --remote <remote-name> --ref refs/heads/archboard-history
archboard model publication <checkpoint.id> -C <directory>
archboard model publish <checkpoint.id> -C <directory> \
  --remote <remote-name> --ref refs/heads/archboard-history
```

Use the configured destination on every publication and recovery request.
If the remote URL changes, explicitly configure that destination again.
`PUBLICATION_DESTINATION_CHANGED` refuses use of the former authorization and publication evidence.
Local retention and exact reads remain available.

`saved-locally` means that the architecture exists locally without publication evidence for the selected destination.
`publication-pending` means that a durable publication intent awaits a successful exchange.
That intent includes the retained dependency closure.
`published` means that an explicit push or fetch established remote availability for that checkpoint.
`unavailable` means that the requested history cannot be opened or restored by that operation.

Publication evidence persists across server restarts.
It describes availability at the last successful explicit exchange.
It does not promise that the remote still exists or keeps its retention policy.
The result reports `retention.protected: false` and explains the enforceability limitation.
The remote owner must deny ref rewrites and deletion through server policy and keep a backup.
Generic Git transport cannot install or inspect those host controls.

A stale push fetches complete named history and joins archive ancestry through a signed synchronization record.
The record preserves both tips without merging model content.
Publication preserves checkpoint identities and never force-pushes.
Configured identity and signing apply to the join.
If signing fails, repair the signer and retry the same explicit publication request.

If the network fails, local architecture remains retained.
Use `model publication` to read the saved status without contacting the remote.
After access returns, repeat `model publish` with the same checkpoint and destination.
An interrupted request remains pending until an explicit exchange proves publication.

To recover a missing reading, configure the owner's named archive destination first.
Then fetch that complete archive explicitly.

```bash
archboard model fetch <checkpoint.id> -C <directory> \
  --remote <remote-name> --ref refs/heads/archboard-history
archboard model read -C <directory> --checkpoint <checkpoint.id>
```

The fetch retains a named local reference and restores the referenced ancestry.
An existing shallow archive triggers a deeper fetch of that archive ref.
Current files, the index, source HEAD, and stored source fetch mappings remain unchanged.
Fetched checkpoints appear in `model checkpoints`.
Archive order never selects the checkout's current state.

`ARCHIVE_NOT_PORTABLE` refuses publication of retained machine-local source repository paths.
Immutable checkpoint metadata cannot be redacted during publication.
Keep such checkpoints local and use portable source repository identities for future archives.
Private archive initialization and portable export remain separate delivery slices.

## Reopen and recover

Exact reads require the complete `checkpoint.id`, rather than a branch name or abbreviated hash.
Module selectors resolve against that retained reading alone.
Its modules, relationships, manifest, policy, and revision come from retained objects.
Changed, missing, or malformed current files never supply historical content.

`model checkpoints` lists saved checkpoint metadata without reading current architecture.
Synchronization records are omitted.
Archive traversal order establishes neither current architecture nor proposal ancestry.
Select the intended checkpoint explicitly.

An exact read adds `checkpoint` and `sourceEvidence` to the common model result.
Each source evidence entry carries its repository, commit, uncommitted status, and current availability.
`available` means that the committed source revision remains local.
`uncommitted` means that the recorded base exists but exact uncommitted code needs separate recovery.
`unavailable` means that the recorded source revision is absent or no source commit existed.
Evidence recovery instructions accompany the latter two states.
Architecture remains readable when source evidence is unavailable.

`ARCHITECTURE_UNAVAILABLE` means that architecture inputs or a required baseline are missing.
Restore the archive from its owner or backup.
If the owner publishes history, use `model fetch` with the configured remote, archive ref, and exact checkpoint.
The fetch restores complete archive ancestry, including required baselines in shallow clones.
Exact reads perform no automatic network operation.
Never substitute current content for missing history.

`ARCHIVE_IN_USE` means that a worktree has `archboard-history` checked out.
Switch that worktree to another branch before retrying retention.
`ARCHIVE_UNREADABLE` identifies a damaged archive or an unrelated branch using the reserved name.
Preserve that branch and resolve its ownership before retrying.
An unsuccessful operation keeps its structured JSON and exits with status 2.

This delivery supports manifest and module inputs plus local checkpoints.
Use existing board commands for legacy vaults.
For legacy inventory and identity choices, use [legacy migration](legacy-migration.md).
Canonical composition, authoring, proposal changes, private archives, and cutover arrive through later TASK-549 slices.
