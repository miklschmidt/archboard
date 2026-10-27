# Work with a canonical model

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
The current reading follows completed edits and stable external changes automatically.
Opening the reading, returning to the tab, and reconnecting obtain fresh content.
If updates fail, the last coherent current reading remains visible with an explicit stale notice.
Invalid input shows its source and recovery instructions.
Use Refresh to retry a failed read.

Drag from empty diagram space to select several subjects.
Use Ctrl/Cmd-click to toggle a subject, or focus its list button and press Ctrl/Cmd+Enter.
Press Escape to clear selection.
Hold Space while dragging, or drag with the middle mouse button, to pan.

Select Focus to show the selected subjects and their required containment paths.
The reading preserves selected ancestors and descendants together.
Select Clear focus to return to the underlying scope.
Use Filters to control relationship kinds and group regions.
These controls change the reading without changing architecture files.
The inspector keeps hidden selections and offers Reveal selection.
Missing subjects remain explicit until their architecture returns or the reader changes focus.
Focus and filters survive reload and browser history navigation.
Selection itself stays temporary and does not add history.

Use the diagram selector to choose Architecture, Sequence, or Flowchart.
For Sequence or Flowchart, choose an authored flow from the Flow selector.
The choices involve the selected subjects, focused subjects, or open module.
The diagram includes every participant and step that the selected flow requires.
The participant list keeps the order that the flow defines.
Structural filters do not remove flow messages.
Returning to Architecture restores the preceding scope, focus, and filters.
If the selected flow is unavailable, choose another flow or restore its definition.
A hidden selected step remains in the inspector with an action to open its exact flow.
These actions preserve selection and change no architecture files.

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
Use a canonical vault inside a source Git repository, or explicitly initialize private history as described below.
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

## Initialize private history

For a vault outside a source repository, explicitly initialize its private archive before retention or edits.

```bash
archboard model archive-init -C <directory>
```

The result returns `archive`, the local bare Git directory.
Use `git -C <archive> config` to configure its author identity and signer.
The archive also reads the owner's global Git configuration.
Keep required signing enabled.
The runtime never creates `.git` inside the vault or its enclosing directory.
Initialization refuses source repositories and machine state inside a source repository.
Repeated initialization returns the same archive without replacing its content.

The existing retain, read, claim, edit, and recover commands use this archive automatically after initialization.
Private checkpoint metadata contains no invented source association or generated machine directory.
Current architecture and private recovery records remain specific to the addressed vault.
The archive lives in Archboard's machine state, so keep it in your backups.
Moving a vault does not move its private archive or recovery records.
Preserve the original location for pending recovery.
Portable transfer belongs to the explicit export and migration workflows.

History remains local until the owner explicitly configures a publication destination.
For publication, add the intended named remote in the returned archive with `git -C <archive> remote add`.
Then use the publication workflow below with that remote and independent archive ref.
Initialization, remote creation, and destination configuration send no history.

If a source repository appears around a vault with private history, archive operations refuse the ownership change.
Restore the vault outside that source repository before recovery or further archive work.
If private storage is damaged, preserve it and restore a complete archive from backup.
Initialization never overwrites damaged storage.

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
Portable export remains a separate delivery slice.

The browser shows sharing status when the reader selects a retained checkpoint.
The reader can set its destination, publish history, retry a failed exchange, or fetch missing history.
Configuration sends no history.
Every network action uses the displayed checkpoint and destination.
The reader keeps that checkpoint selected while recovery restores its content.
The visible retention limitation states that a successful exchange does not establish remote protection.

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

This delivery supports module structure and relationship edits, retained checkpoints, private archives, and explicit archive publication.
Use existing board commands for legacy vaults.
For legacy inventory and identity choices, use [legacy migration](legacy-migration.md).
Compact proposals use the workflow below.
Reconciliation, adoption, and shelving use the shared model writer described below.
Explicit migration and historical correction remain later TASK-549 slices.

## Edit one module description

Use `model edit` for one current module description with source-backed or initialized private history.
Read the complete model before preparing the edit.
Keep the entire `revision` object, including its file fingerprints.
Use qualified subject IDs for claims and edits.
The explicit target contains the manifest's model ID and current state ID.

Write a claim request with `target`, `writer`, `reason`, and `subjects`.
Run `archboard model claim --input claim.json -C <directory>`.
Keep the returned `claim.id`.
Use `model claims` to inspect the writer, purpose, scope, and start time.
Claims leave the installation lease free between operations.

Write an edit request with these fields:

```typescript
{
  target: { model: reading.manifest.id, state: reading.manifest.current.id },
  subject: "Shop#Gateway",
  expectedRevision: reading.revision,
  operationId: "explain-gateway-1",
  writer: "architecture-agent",
  claim: claimResult.claim.id,
  description: "Authenticates callers before dispatching accepted requests."
}
```

Run the edit with its doing line:

```bash
archboard model edit --input edit.json -C <directory> \
  --doing "explaining gateway authentication"
```

The result names the before and after revisions, affected subjects, and retained checkpoint.
`applied: true` identifies durable completion.
`reconciliation: false` means that the affected family has no unresolved decisions.
A `cleanup: pending` result remains applied.
Repeat the exact request to finish its remaining cleanup.
If a response is lost, repeat the same request and operation identity.
Use a new identity for a different intent.
A completed retry remains available when current files are invalid or another operation holds the installation lease.

Signing preparation precedes every current-file installation.
If signing fails, repair the configured signer and retry the same request.
Keep the repository's signing policy enabled.
An operation with no completed installation changes no current inputs on that signing refusal.

If `RECOVERY_REQUIRED` appears, run `archboard model recover -C <directory>`.
The operation resumes its original journal and retained checkpoint.
If recovery reports foreign content, preserve those bytes before restoring a logged image.
If recovery reports another branch or HEAD, restore the recorded context before retrying.
The failure's `recovery` object names its operation, checkpoint, progress, fingerprints, and original branch and HEAD.
Use `model read --checkpoint <recovery.checkpoint>` to inspect the retained candidate while current reads remain blocked.
An edit refusal states `applied: false` before installation or `applied: "unknown"` when the durable outcome remains uncertain.
If application remains uncertain, recover the journal or retry the original request.
If another process finishes cleanup after durable completion, the original request returns success with `cleanup: "pending"`.
Keep external editors and Git checkout idle during installation.
Archboard detects interference but cannot provide atomic visibility to arbitrary filesystem readers.

A stable external correction changes observed current content without creating adoption metadata.
Invalid or changing inputs block new writes.
Keep any old browser scene explicitly stale until a coherent read succeeds.
Each event-stream connection starts with a fresh current reading and claim list.
A historical selection continues to use its exact checkpoint cache.

To release the scope, write `{ "claim": "<claim.id>", "writer": "architecture-agent" }` to `release.json`.
Run `archboard model release --input release.json -C <directory>`.
The current reading shows each agent claim with its writer, purpose, subjects, and start time.
A reader can select Take back control beside that claim.
This action ends ownership without changing architecture content.
Its former writer then receives `CLAIM_REVOKED` and must stop that intent.

The claim and edit commands accept JSON files or standard input.

## Author module structure and relationships

Use the existing `model edit` command for a structural batch.
A batch holds every change for one intent.
Keep its complete revision, explicit current target, operation identity, writer, doing line, and claim.
Replace the description request's `subject` and `description` with `changes`.
The earlier description request remains supported.

Use these change forms:

```json
[
	{ "type": "add-module", "module": { "name": "Cache", "kind": "service", "order": 40 } },
	{
		"type": "edit-module",
		"subject": "Shop#Gateway",
		"set": { "name": "API", "parent": "Shop#Worker" },
		"clear": ["description"]
	},
	{ "type": "remove-module", "subject": "Shop#Handler" },
	{
		"type": "add-relationship",
		"source": "Shop#Gateway",
		"relationship": { "to": "Shop#Worker", "kind": "call", "order": 20 }
	},
	{
		"type": "edit-relationship",
		"subject": "Shop#Dispatch",
		"source": "Shop#Worker",
		"set": { "to": "Shop#Gateway" },
		"clear": ["traffic"]
	},
	{ "type": "remove-relationship", "subject": "Shop#Dispatch" }
]
```

These forms are separate examples, rather than one valid combined intent.
State one edit per continuing subject.
Use `set` for assigned fields and `clear` for optional fields to remove.
Omitted fields remain unchanged, and null is invalid.
A rename retains the old name as a former name.
Use `set.parent` to reparent a module, or `clear:["parent"]` to make it a root.
Use `edit-relationship.source` to transfer a relationship without replacing its identity.
Keep its label, description, order, emphasis, traffic, and anchor unstated to preserve them.

New identities come from Archboard in the model namespace.
Do not supply an ID, schema version, former names, or outgoing array for an addition.
The result's subjects and the next model read expose the allocated identities.
New module files use those identities, rather than names.
Unique current or former module names remain accepted.
References to a module added in the same batch use its unique name.
Relationship edits and removals use qualified IDs.

Claim every affected existing subject before the operation.
A relationship change includes its identity and former and new source and target modules.
A containment change includes the moved descendants and former and new ancestor paths.
For additions and removals, also claim the model ID, such as `Shop`.
This structure scope protects identity allocation and retirement.
It leaves unrelated module scopes available.
For example, a transfer claim can name `["Shop#Gateway","Shop#Worker","Shop#Dispatch"]`.
Refusals identify affected scopes so that you can release a partial claim and obtain the complete scope.

Module removal also removes incident relationships unless the same batch explicitly repairs their endpoints.
Reparent or remove every surviving child of a removed container in the same batch.
Archboard never promotes an orphan automatically.
Removed module and relationship IDs remain reserved in `model.json`.
Existing proposal confirmation rules remain unchanged and apply when editing proposals.
A batch without a proposal intent authors only the explicitly selected current state.
The compact proposal workflow below uses the same batch for a selected draft.

The operation retains one checkpoint and announces one complete affected subject set.
A retry returns the same allocated identities and result.
A transfer or removal that stops during installation uses the existing `model recover` command.
The recovery path preserves foreign bytes and refuses changed checkout context.
Unrelated authored files remain byte-identical.

The browser refreshes current module names, root membership, and connections after the complete operation.
The selected module keeps its identity through a rename or reparent.
Its details identify its parent when it has one.
Removing that module leaves an explicit missing selection until the reader chooses another subject.
Exact historical readings keep their original names, containment, and relationships.

## Explore a module

Select a module, then choose Open module.
The reading shows its immediate children and directly connected outside modules.
Use the path above the diagram to return to a parent or the repository.
Browser Back and Forward restore earlier scopes and saved readings.
The address preserves each pane independently across reload.

Select a connection in the diagram or the Connections list.
Its details list every underlying relationship, original endpoint, identity, and distinct label.
Connections with different directions or kinds remain separate.
The open module shows entry points and callers from the complete architecture.
A connection to the module itself never names an invented child.

A missing scope or checkpoint stays unavailable until the reader changes the address or restores the missing history.
Navigation never copies modules, creates a board, or changes architecture files.

## Author independent flows

A collection groups flows for authoring.
Its filename gives no module ownership.
Each flow and step keeps a qualified subject identity.
The collection has a separate local identity.

Read the complete model with `archboard model read`.
Claim the model ID, participants, and every affected existing flow, step, and holder.
Use the existing `model edit` request with `changes` for one complete intent.
The Archboard source checkout contains `examples/canonical-model/independent-flow.changes.json`.
That complete example uses the modules in the canonical model example.
Supply the target, complete expectedRevision, operationId, writer, and claim from your current reading.
Supply the doing line through `--doing`.

`add-collection` takes a name.
`add-flow` takes a collection identity or unique name and a flow with ordered participants and nested steps.
Archboard allocates every new identity.
Messages, decisions, loops, notes, repeat counts, summaries, and anchors keep their existing semantic fields.
Returns remain messages and never create reverse structural relationships.
Use qualified module IDs or unique current or former module names for participant and message references.
A flow can reference a module that the same batch adds by its unique name.
Only qualified identities persist.

`edit-flow` takes its qualified identity or unique current or former name.
Its `set` assigns name, summary, or participants.
Its `clear:["summary"]` removes the summary.
Its optional `collection` transfers the continuing flow between collections.
`edit-collection` changes a collection name without changing its identity or file.
`remove-flow` and `remove-collection` remove their remaining subjects.
A flow transferred out of a removed collection survives in its destination.

`edit-step` takes a continuing step identity and uses `set` and `clear` for its fields.
Use `add-step` with a new nested step and its placement.
Use `remove-step` to remove a subtree.
Use `move-step` to preserve a subtree and every identity across holders or flows.
A placement names `holder` and an optional `before` sibling identity.
A flow or loop is a holder.
A decision holder also requires the exact `alternative` label.
Without `before`, the step appends to the destination.

```json
{
	"type": "move-step",
	"subject": "Shop#Response",
	"placement": {
		"holder": "Shop#Decision",
		"alternative": "accepted",
		"before": "Shop#Next"
	}
}
```

To rename alternatives, assign the complete label array through `edit-step.set.alternatives`.
Move every direct child of a renamed or removed alternative in the same batch.
Missing holders, orphaned children, conflicting moves, containment cycles, and incompatible relative order refuse the complete operation.
Archboard never promotes an orphaned step to a root.
The destination flow must explicitly include every message endpoint in its participants.

Module removal repairs participant lists and removes messages with removed endpoints in the same operation.
It also removes the empty loops, decisions, and flows that those repairs leave behind.
Explicit message repairs can preserve a message by assigning surviving endpoints.
Claim both former and new participants, affected flows, steps, and holders.
The refusal names any missing claim scope.
Retired flow and step IDs stay reserved in the manifest.
The existing signed transaction, exact retry, recovery, and publication contracts apply to these files.
Unrelated files keep their exact bytes.

## Follow code and foreign references

In the browser, select a module and use Open code beside its authored binding.
The action follows the selected current state, draft, or exact saved reading.
If source is unavailable, the architecture remains readable and the disabled action states the reason.
Use Open architecture beside a module reference to follow its explicit model, state, and subject.
The address preserves the repository and destination through reload and browser history.
Unavailable targets keep their authored reference and recovery instructions.
Saved readings follow captured foreign checkpoints even when current foreign files are unavailable.
A relationship reference selects that exact relationship within an aggregate.
A collection offers its authored flows, and flow or step references open their containing flow.

Canonical code activation names the model, subject, and optional selected state or exact checkpoint.
A draft activation uses that draft's binding. A missing state refuses the action without opening current code.

A module binding names source code, independently of its architecture owner.
Use `model read <module> --code` to resolve that binding through the existing checkout selection.
The vault uses its own checkout for its repository and the chosen checkout for each other repository.
The result reports `codeTarget` and the effective `codeBinding`.
Unavailable source includes a structured failure and recovery action without hiding readable architecture.

An explicit reference names another model, its subject, and its state.
The subject can be a module, relationship, collection, flow, or step.
Author `references` through the existing `edit-module.set` field.
Use `edit-module.clear:["references"]` to remove that list.
Omission preserves the list.

```json
{
	"type": "edit-module",
	"subject": "Shop#Gateway",
	"set": {
		"references": [
			{
				"repo": "github.com/acme/ledger",
				"model": "Ledger",
				"subject": "Ledger#Gateway",
				"state": "current"
			}
		]
	}
}
```

`current` explicitly follows the foreign current designation.
A stable state ID requires that exact state.
An active draft reference names its stable `state` ID.
For an exact retained state, include its complete `checkpoint` identity beside that ID.
Draft navigation preserves the selected lifecycle and reports reference changes in proposal comparisons.
A pinned reference cannot use `state:"current"`.
References create no containment, relationship, claim, or ownership transfer.

```bash
archboard model read 'Shop#Gateway' --references
archboard model read 'Shop#Gateway' --reference 0
archboard model read 'Shop#Gateway' --reference 0 --code
archboard model read 'Shop#Gateway' --model Shop --code
```

`--reference` selects a zero-based index in the module's authored list.
`resolvedReferences` reports each target address or its unavailable diagnostics.
Available entries include the authored subject, model, and state names from that exact reading.
The browser uses those names for reference actions and keeps unavailable destinations visible.
A successful follow returns the foreign reading and its `location` address.
`selectedSubject` preserves the exact subject identity.
A module also sets `selectedModule`.
A flow or step also sets its containing `selectedFlow`.
The address names the target vault, model, subject, state, and any exact checkpoint.
Unavailable models never resolve against another model with a similar name.
These commands change neither model.

Before a local edit or retention, retain each referenced foreign reading through its own separate operation.
Archboard requires an existing exact foreign checkpoint that matches the selected reading.
The local checkpoint records those pins without writing a foreign vault or archive.
Historical navigation uses those pins even when foreign current files change or disappear.
Missing pins or checkpoint objects remain unavailable and never select foreign current content.
Restore the foreign archive through its existing history recovery commands, then retry the exact reading.

For historical code, Archboard uses retained source associations and refuses changed working files or another source revision.
An uncommitted source association does not retain those source bytes.
Recover that source separately before opening it.

## Render a selected flow

Use `model read --flow <id>` to resolve an explicit flow selection.
Use the qualified flow identity from that reading when names are ambiguous.
A missing selection never invents an exchange from structural relationships.

```bash
archboard model render --flow 'Shop#Checkout' --grammar sequence --out request.svg
archboard model render --flow 'Shop#Checkout' --grammar flowchart --out logic.svg
archboard model render --flow 'Shop#Checkout' --grammar sequence --checkpoint <exact-checkpoint-id> --out retained.svg
```

Each command writes a self-contained SVG and returns its reading revision, dimensions, and placed identities.
The sequence draws ordered participants and messages.
The flowchart draws control steps and their branches.
Both readings use the existing renderer and include the complete selected flow.
Structural scope and relationship filters cannot remove its participants or messages.
These commands do not require a board or named view.
The browser grammar controls belong to a later delivery.

## Create and compare compact proposals

A proposal states unbuilt architecture across any modules and flows in the model.
Its active `.proposal.json` file stores only identity changes against an immutable retained baseline.
Current module and flow files remain unchanged.
Use `model proposals` to read the catalogue, including each proposal's identity, name, predecessor, baseline, and lifecycle.

```bash
archboard model proposals -C <directory>
archboard model read --state '<proposal-name>' -C <directory>
archboard model compare --state '<proposal-name>' -C <directory>
archboard model compare --state '<proposal-name>' --against '<other-state-or-checkpoint>' -C <directory>
```

State selectors resolve a stable identity before a unique current or former name.
`current` explicitly requests the current designation.
A planning model has no current designation until explicit adoption.
Missing or ambiguous state selectors refuse rather than choose another reading.
Exact checkpoint selectors use their complete immutable identities.

Read `selectedState` for the selected state's identity, name, summary, documents, and lifecycle.
A draft always reports lifecycle `draft`.
`manifest.current` describes the retained designation, rather than the selected proposal's lifecycle.
Never label a selected draft as implemented Current.
The revision remains the complete addressed vault token, including all active proposal files.
Keep that complete object for the next write.

Create a proposal through the existing `model edit` request.
Its target state names the chosen predecessor's stable state ID.
To choose a named predecessor, read that state first and use `selectedState.id`.
Claim the model identity and every affected existing subject in that predecessor.
Add the following fields to the common target, revision, operation, writer, and claim fields.

```json
{
	"proposal": {
		"type": "create",
		"name": "Queued dispatch",
		"summary": "Queue accepted requests",
		"documents": [{ "repo": "github.com/acme/shop", "path": "docs/queue.md" }]
	},
	"changes": [
		{
			"type": "edit-module",
			"subject": "Shop#Gateway",
			"set": { "description": "Queues accepted requests for the worker." }
		}
	]
}
```

The source example `examples/canonical-model/compact-proposal.changes.json` spans modules and a new independent flow.
Supply the common request fields from the selected predecessor and pass the doing line through `--doing`.
A lost response uses the same exact request and operation identity.
The receipt identifies the newly allocated draft through `target` and `selectedState`.

For a sibling, create another proposal against the same predecessor identity.
For a child, select the named draft and use its identity as the new target state.
For a planning root, start with an authored manifest whose `current` is null and no current modules or flows.
Use target state null, claim the model identity, and add every unbuilt subject through the proposal batch.
Archboard retains the empty baseline before installing the root proposal.

To edit a draft, select it and claim its state ID, model identity, and affected existing subjects.
Release a former predecessor claim before claiming a different target.
Use the draft's identity as `target.state` and add `proposal:{"type":"edit"}` to the existing module and flow batch.
Use `proposal.set` for its name, summary, or documents.
Use `proposal.clear:["summary","documents"]` for explicit metadata removal.
A rename preserves the previous name.
A metadata-only edit uses `changes:[]`.
An ordinary draft edit keeps its immutable baseline.
A settled reconciliation retains the updated predecessor as its new baseline.

Stored changes distinguish `add`, `remove`, `assign`, `clear`, and `place`.
Agents continue to submit the normal module and flow operations.
Archboard derives the compact representation and requires exact materialization before installation.
Bindings and other composite fields remain atomic.
A placement addresses its holder and following sibling by stable identity.
A decision placement also names the exact alternative label.
No active proposal stores unrelated module or flow snapshots.

A selected draft compares against current by default.
Without current, a dependent draft compares against its retained predecessor.
A planning root has no default comparison.
Use `--against` for an explicit coherent named state or complete checkpoint.
The result's `comparison.reason` identifies the chosen default or explicit base.
`comparison.revision` identifies the exact architecture inputs used for that base.
If you read base definitions separately, require their revision to match this value.
Require their model, state, and exact checkpoint identities to match the comparison metadata too.
A retained selected state can have a different revision from its live comparison base.
Its subject entries identify additions, removals, changes, unchanged subjects, and changed semantic fields.
Presentation order and emphasis retain the existing semantic comparison rules.

`PREDECESSOR_CHANGED` means that the proposal's starting state changed after baseline retention.
Preserve the baseline and proposal changes.
Ordinary reads and edits refuse until an explicit reconciliation follows that external edit.
An exact retained proposal checkpoint remains readable against its own inputs.
Neither a code merge nor an approval adopts a draft.
Adoption and shelving use the explicit lifecycle intents below.

An explicit comparison against an empty planning baseline returns `comparison.against:null` and the baseline's exact `comparison.checkpoint`.
Its subject changes still identify the planning additions.
This absence names no implemented state and does not suppress the requested comparison.

The browser state picker lists current architecture, active proposals, and saved readings.
Select a proposal to read its modules and flows without changing current architecture.
The header states whether the selected reading is implemented, draft, historical, or shelved.
The Compare control selects the default comparison, another active state, or an exact saved reading.
The address preserves both selections through reload and browser history.

The diagram marks added, removed, and changed subjects.
Select a subject to inspect its changed fields.
Removed subjects use the exact comparison base definitions.
If that base becomes unavailable, the browser explains the incomplete comparison and offers Refresh comparison.
It never substitutes current definitions for another requested base.

Active draft readings follow accepted edits through the architecture change feed.
Saved draft readings keep their original content and draft identity.
If an external file edit changes a predecessor, the browser preserves the requested state and shows the refusal.
Select an available saved reading to inspect the retained proposal.

## Temporary explanations

An explanation capture preserves the architecture reading that a local agent answers.
Reading intent names the scope, focus, relationship filters, group visibility, grammar, and optional flow.
`reading.groups` accepts exact visible group IDs, or `true` and `false` for all and no groups.
The capture includes stable subjects, the complete revision, and the selected state or exact checkpoint.
A proposal capture also preserves its actual comparison base and that base's separate revision.
Later navigation cannot change the capture.

Use `browser panes` to read the canonical `architecture` report and `tabSessionId` for the selected pane.
If the report is absent, ask the person to open the canonical reading before resolving a pointing request.
Use its actual `architecture.vault`, including after navigation to another repository.
Keep `reading.referenceSubject` separate from the temporary pointer selection.
Do not infer canonical architecture from the pane's legacy board field.

Pass the action to the existing local workhorse with `model explain`.
Use `-C` with the directory that holds the reported vault.
Read the model before an invocation and use its complete revision digest.
Use the report's state or checkpoint selector when reading it.

```json
{
	"type": "invoke",
	"tabSessionId": "<reported-tab-session>",
	"selection": { "state": "current" },
	"request": {
		"actionId": "<new-action-identity>",
		"action": "explain-selection",
		"model": "Shop",
		"expectedRevision": "<complete-observed-revision-digest>",
		"subjects": ["Shop#Gateway"],
		"reading": {
			"scope": "Shop#Gateway",
			"focus": [],
			"relationshipKinds": ["call"],
			"groups": true,
			"grammar": "architecture"
		}
	}
}
```

```bash
archboard model explain --input explanation.json -C <directory>
```

Use `explain-relationship`, `trace-flow`, or `explain-proposal` for the other actions.
A missing explicit flow lets `trace-flow` request investigation without authoring a flow.
An explicit unavailable flow refuses rather than selecting another flow.
A proposal explanation requires the selected draft and its comparison.
State and checkpoint selectors are exclusive.

Read progress with the same command and this input:

```json
{
	"type": "read",
	"tabSessionId": "<reported-tab-session>",
	"actionId": "<original-action-identity>"
}
```

The result reports captured, queued, running, completed, failed, cancelled, or unavailable.
The browser and voice consume the same `action.text` answer.
The toolbar, context menu, and keyboard invoke that same action.
The visible answer names its original model, state, subjects, and revision after navigation.
The coordinator speaks that answer without requesting a second explanation.
Normal workhorse news tells the coordinator when the turn finishes.
The existing pane socket announces answer changes to panes in the same tab.
The browser refreshes its answer query after that notice and after reconnecting.
No extra connection or polling loop owns explanation progress.

To discover the last invocation or retry in a tab, send `type:"latest"` with its `tabSessionId`.
The result includes `action.vault`, which names the original captured vault.
Use that vault for later reads, cancellation, and retries, even after navigation.
If this action queues on your own workhorse, end your turn so that its queue can start it.
If `action.retryable` is true, send `type:"retry"` with the original tab and action identity.
Retry preserves the captured request and content after navigation or source changes.
If delivery is uncertain, retry remains unavailable to prevent duplicate work.
Send `type:"cancel"` to remove the captured queue item or request interruption of its exact turn.
Read again until the provider reports the final outcome.

An explanation writes no architecture and takes no subject claim.
Answers remain temporary within the local agent generation and tab lifetime.
An explicit request to save an answer uses the ordinary claimed edit with a fresh complete revision.

## Reconcile dependent proposals

A standing is a durable record of unresolved issues.
Read `selectedState.standing` and each proposal catalogue entry before editing a family.
An absent standing means that the state is settled.
Each issue names its subject, kind, disputed field, both values, and repair action.
A blocked descendant names its unsettled ancestor through `standing.blockedBy`.
Its last coherent architecture remains readable.
A child created from an unsettled proposal starts blocked.

Claim the affected descendant state IDs beside the existing subjects and model structure scope.
Use the complete vault revision from the current read.
Submit the predecessor edit through `model edit`.
Archboard reconciles parents before children through the same durable installation.
Safe changes reach following proposals together.
Disputed subjects keep the proposal side, and unsettled ancestors block their descendants.
The baseline that established each conflict remains retained until settlement.

If external files change a predecessor, ordinary reads return `PREDECESSOR_CHANGED`.
Read the current catalogue and claim the affected family.
Target the changed predecessor and submit this intent through `model edit`:

```json
{ "proposal": { "type": "reconcile" }, "changes": [] }
```

Reconciliation changes following proposals without another predecessor edit.
It preserves the existing current designation.
A saved checkpoint remains an exact reading of its retained content and standing.
The browser identifies unresolved and blocked proposals in the state picker and selected reading.
Open the decision disclosure to read both values and the repair instructions.
A blocked reading links to its live ancestor. A saved reading keeps its original standing until the reader leaves it.
Agents settle decisions through the shared writer. The browser reflects the completed family result without authoring a settlement.

To settle a proposal, read its issues and claim its state and affected family subjects.
Use its stable identity as `target.state`.
Submit one choice for every issue in the same request:

```json
{
	"proposal": {
		"type": "settle",
		"resolutions": [{ "subject": "Shop#Gateway", "field": "description", "take": "mine" }]
	},
	"changes": []
}
```

`mine` explicitly accepts the proposal side.
`theirs` takes the predecessor side.
`edited` accepts the accompanying ordinary batch as a third answer.
A resolution without `field` covers every issue of that subject.
Give each issue exactly one choice.
For order issues under one holder, use the same choice throughout.
Use `edited` with an ordinary movement batch for a third order.
Incomplete or overlapping choices refuse with `MODEL_INVALID` and install nothing.
Ordinary edits preserve standing until an explicit settlement clears it.
A blocked draft refuses edits and settlement with `PROPOSAL_BLOCKED`.
Settle its named ancestor first.

A complete settlement reconciles following drafts in the same transaction.
A continuing subject that the predecessor deleted keeps its original qualified identity.
Archboard retains proof of that subject in the existing archive.
This proof never permits a fresh allocation from retired identities.
Agents author through operations and leave proof storage to Archboard.

The receipt reports `applied:true` and `reconciliation` as a boolean.
True means that affected family states still need settlement.
`reconciliations` identifies those changed states and their standing when present.
The selected proposal also exposes its standing through `selectedState`.
Retry an identical request with the same operation ID after a lost response.
If installation stops, use `model recover` in the original checkout.
Recovery completes the same family and returns its retained receipt.

## Complete a proposal

Adoption states that a settled proposal is implemented.
Shelving states that an agent stopped pursuing a proposal.
Neither a source commit, a merge, nor an approval performs either action.
Readers never author these actions through the browser.

Read the target draft and keep its complete revision object.
Claim its state ID, model identity, and affected existing subjects.
For adoption, include changed subjects from both current architecture and the complete draft.
Include affected descendant states and subjects in the same claim.
Use the existing `model edit` command with the common request fields and the doing line.

```json
{ "proposal": { "type": "adopt", "reason": "The queue is implemented." }, "changes": [] }
```

```json
{ "proposal": { "type": "shelve", "reason": "The team chose direct dispatch." }, "changes": [] }
```

Lifecycle intents accept no accompanying content edits.
Adoption requires a coherent draft with settled ancestry.
An agent can shelve an unresolved or blocked draft without settling its ancestor.
`PROPOSAL_BLOCKED` requires settlement before adoption.
`PROPOSAL_SUPERSEDED` means that the proposal follows a former current state.
Normal adoption refuses that replacement.

If complete replacement is intended, read an explicit comparison against current.

```bash
archboard model compare --state '<draft-id>' --against current -C <directory>
```

Copy the complete returned `comparison` into `proposal.comparison`.
Set `proposal.force` to true.
Use that reading's complete revision in the common request.
`COMPARISON_REQUIRED` means that the comparison is absent, incomplete, or stale.
Archboard installs the complete resolved proposal, including removals.
It never applies the proposal patch to another baseline.

Adoption preserves the proposal ID, name, former names, documents, and predecessor.
It records the prior current state, reason, and adoption time.
A planning model receives its first current designation without inventing a previous state.
Shelving preserves the final compact patch, immutable baseline, ancestry, documents, reason, and shelving time.
Completed states refuse ordinary content edits.
The existing transaction removes the active proposal file only after signed preparation.
Recovery and exact retries retain one lifecycle event.

An asynchronous current read without state or comparison selectors exposes `states` beside the active `proposals` catalogue.
The CLI `model proposals` command requests this catalogue.
`states` derives current, draft, historical, and shelved metadata from authored designations and retained lifecycle records.
Completed entries include an exact `checkpoint`.
Use a stable state ID or unique current or former name to reopen completed architecture.
Use an exact checkpoint when retained logical identities are ambiguous.
Exact checkpoints preserve their original reading after later adoption or shelving.
Non-current readings keep the existing comparison defaults.

The browser reading selector lists current, draft, historical, and shelved states.
The comparison selector includes the same logical states and exact checkpoints.
Current follows the explicit designation; a named historical state keeps its identity.
Open Decision and history to inspect dates, predecessor, prior implementation, baseline, and document evidence.
Use its state or baseline controls to open the referenced reading.
If retained history is unavailable, restore it through [Publish and fetch history](#publish-and-fetch-history).
Then use Refresh to reopen the selected reading.

The receipt's `selectedState` identifies the completed lifecycle.
Its checkpoint retains `lifecycle`, including the final proposal and the exact previous current reading.
New drafts record `createdAt`.
Completed metadata records `adoptedAt` or `shelvedAt`, plus `reason` and `previousCurrent`.
Current files hold only their current designation and its own lineage.
Completed history stays in the independent archive with actual Git ancestry for every required baseline.
Archive append order never selects current architecture.

## Correct a recorded state

Use an explicit correction for a factual error in a historical or shelved state.
Create a new proposal for a new design.
Ordinary edits to completed states still refuse.

Read the logical state and save its returned `checkpoint.id`.
Read the current catalogue again and save its complete `revision`.
Claim the model, completed state, affected existing subjects, and following drafts that the correction changes.
Inspect the source commits that support the corrected facts.
Supply one available full Git commit ID for every repository referenced by the corrected reading.
Uncommitted files cannot supply historical evidence.

Submit the existing `model edit` request with a `correction` intent and ordinary module or flow changes:

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

Copy the complete revision from the reader, including its actual files.
Replace the example state and claim with their stable IDs.
Supply the doing line through `--doing`.
POST `/api/architecture/module` accepts the same shared request with its explicit vault and doing line.

The writer refuses current or draft targets, unavailable source evidence, empty factual changes, and a stale `correction.previous`.
A correction changes no current designation, state name, ancestry, or adoption decision.
Its retained checkpoint links the previous reading through actual Git ancestry.
Current files contain no completed correction history.

Logical state reads expose the latest correction and `selectedState.corrections`.
Each audit entry identifies its checkpoint, previous checkpoint, time, reason, and source revisions.
An exact original checkpoint still returns its original facts.
Comparison results include both audit trails under `comparison.corrections` beside the existing semantic differences.
Divergent corrections require an exact checkpoint instead of selecting by archive order.

Following local drafts reconcile through the existing family operation.
Competing changes retain explicit standing and block descendants until settlement.
Adopted successors and unrelated current architecture keep their content.
Recovery and exact retries use the existing journal and return the same retained correction.
Publication and fetch retain the complete correction dependency chain.
Source history remains separate and can become unavailable.
