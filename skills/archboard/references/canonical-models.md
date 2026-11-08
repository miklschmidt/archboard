# Work with a canonical model

The canonical model is the vault's authoritative architecture.
Its manifest, `model.json`, identifies that model.
Legacy `.semantic.json` files retain authority until [explicit migration](legacy-migration.md).
Ordinary reads and writes return `LEGACY_AUTHORITY` for unmigrated vaults and refuse mixed formats.

## Read the model

Run `archboard model read` in the vault's checkout, or pass `-C <directory>` for discovery.
Other relative paths still resolve from the working directory.
Every server request must name its vault explicitly. The server stays local.

The result names the discovered vault.
Read `roots` in order, then find their identities in `modules`.
Select a module with `archboard model read '<qualified-id>' -C <directory>`.

A qualified identity is `model[/original-board]#local-id`.
Each segment has one to eight characters.
The optional original board records imported origin, not ownership.
A unique current or former module name also selects a module.
If a name is ambiguous, use a returned matching identity.
Names and bindings never establish shared identity.

The result includes the manifest, policy, modules, relationships, flows, proposals, and complete input revision.
A module keeps its identity across readings.
A relationship describes a continuing dependency, not execution order.
Each module owns its `outgoing` relationships.
The assembled `relationships` list adds the source as `from`.
Find incoming relationships through `to`.

Authored `order` values determine order, with qualified IDs breaking ties.
The reader preserves responsibilities, descriptions, groups, bindings, anchors, traffic, and document references.
It reads every discovered definition before returning any part.

A revision identifies the exact authored inputs.
It covers recognized input paths and exact bytes, including policy.
Renames and whitespace edits change the revision but preserve identity and meaning, respectively.
Unrelated documentation does not change it.
Keep the entire `revision`, including file fingerprints, for writes.
Failures return codes, source paths, affected identities, and recovery actions as JSON, with CLI exit status 2.

## Explore in the browser

A model opens at its roots.
Select a module for its responsibility, description, evidence, and connections.
Open module shows its immediate parts and directly connected outside modules.
The path above the picture returns to a parent or the repository.
Back, Forward, and reload preserve each pane's scope and saved reading independently.

Select a connection to read its underlying relationships, endpoints, identities, and distinct labels.
Different directions and kinds stay separate.
The open module shows entry points and callers from the complete model.
A connection to a container never invents a child endpoint.

Use these controls:

- Drag from empty space to select several subjects.
- Use Ctrl/Cmd-click or Ctrl/Cmd+Enter on a focused list button to toggle a subject.
- Press Escape to clear selection.
- Hold Space while dragging, or use the middle mouse button, to pan.
- Select Focus to show selected subjects with their containment paths, including selected ancestors and descendants.
- Select Clear focus to restore the underlying scope.
- Use Filter in the Legend to hide relationship kinds.
- Use Reveal selection in the right panel to reveal hidden selections.

Focus and filters survive reload and history navigation.
Selection is temporary and adds no history.
Missing selections remain explicit until their subjects return or you change focus.
A missing scope or checkpoint requires a different address or restored history.
These controls write no architecture.

Choose Architecture, Sequence, or Flowchart in the diagram selector.
For behavioral diagrams, choose an authored flow in the Flow selector.
Choices involve selected subjects, focused subjects, or the open module.
The chosen flow opens in the pane's larger reading.
It includes every required participant and step, in authored participant order.
Structural filters cannot remove messages.

Returning to Architecture restores the prior scope, focus, and filters.
If a flow is unavailable, choose another or restore its definition.
A hidden selected step keeps an inspector action that opens its exact flow without clearing selection.

Current readings refresh after completed edits, stable external changes, opening, returning to a tab, and reconnecting.
Failed updates leave the last coherent reading visible with a stale notice.
Invalid input names its source and recovery action.
Use Refresh after recovery.

A renamed or moved module keeps its selection through its stable identity.
Its details name its parent.
A removed module leaves an explicit missing selection.
Historical readings keep their original content.

Open History to choose a saved reading.
Consecutive readings of one state fold into a row with their count and latest time.
Expand it for retention times and agent intents.

The selected reading shows its save time and source evidence.
Tooltips give the complete checkpoint and source commit.
Use `model checkpoints` to copy an identity, or Current to return to working files.
Each selection reads its own inputs again.
The browser creates no checkpoints.

## Retain an exact local reading

A checkpoint preserves a reading and its exact architecture inputs.
A baseline is the retained starting point for changes.
Use a vault in a source Git repository, or [initialize private history](#initialize-private-history).
`model retain` captures Current.
For drafts or planning models without Current, use the completed proposal edit checkpoint.
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
Publication cannot redact immutable metadata.
Keep those checkpoints local and use portable repository identities for future history.
Use [export](#export-and-restore-a-model) for a complete portable backup.

A retained browser reading shows sharing status and actions to configure, publish, retry, or fetch.
Configuration sends no history.
Each network action uses the displayed checkpoint and destination and keeps that checkpoint selected during recovery.
The browser states the remote protection limit.

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
- `unavailable`: The source revision is absent or no source commit existed.

The latter two include recovery instructions.
Architecture remains readable without source evidence, even when current model files are missing or invalid.
`ARCHITECTURE_UNAVAILABLE` means that retained architecture or a required baseline is missing.
Restore the archive from its owner or backup, using [fetch](#publish-and-fetch-history) when the owner publishes it.
Exact reads never contact the network automatically.
After restoration, Refresh reopens the browser checkpoint.

`ARCHIVE_IN_USE` means that a worktree has `archboard-history` checked out.
Switch that worktree to another branch before retrying retention.
`ARCHIVE_UNREADABLE` means damaged storage or an unrelated branch using the reserved name.
Preserve that branch and resolve its ownership before retrying.

## Edit one module description

Read the complete model with source-backed or initialized private history.
Use the manifest's model ID and current state ID as the explicit target.
Use qualified subject IDs for claims and edits.
A claim reserves an authoring scope while leaving it readable.

Write `claim.json` with `target`, `writer`, `reason`, and `subjects`.
Run `archboard model claim --input claim.json -C <directory>`.
Keep `claim.id`.
Use `model claims` to inspect writer, purpose, scope, and start time.

Prepare the request from that read and claim:

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

Run it with a doing line that describes the intent:

```bash
archboard model edit --input edit.json -C <directory> \
  --doing "explaining gateway authentication"
```

Claim and edit accept JSON files or standard input.
The result names before and after revisions, affected subjects, and the retained checkpoint.
`reconciliation:false` means that the affected family has no unresolved decisions.
Follow [retry and recovery](#retry-and-recover-operations) for failures or lost responses.
A complete operation announces its full affected subject set once.
Stable external corrections change current content without adoption metadata.

To release a claim, write `{"claim":"<claim.id>","writer":"architecture-agent"}` to `release.json`.
Run `archboard model release --input release.json -C <directory>` when the intent ends.

The browser shows claims and offers Take back control.
That action changes ownership, not architecture.
If your next write returns `CLAIM_REVOKED`, stop the intent and report the state it left.

## Author module structure and relationships

Use the same `model edit` request for one complete batch.
Replace `subject` and `description` with `changes`.
Keep the target, complete revision, operation identity, writer, doing line, and claim.
The single-description form remains supported.
These are separate examples, not one valid combined intent:

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

State one edit per continuing subject.
`set` assigns fields, `clear` removes optional fields, and omission preserves them. Null is invalid.
A rename preserves the former name.
`set.parent` moves a module. `clear:["parent"]` makes it a root.

`edit-relationship.source` transfers a relationship without changing its identity.
Omit label, description, order, emphasis, traffic, and anchor to preserve them.

To replace a relationship, remove it and add another in the same batch.
That pair allocates a new identity and compares as one removal and one addition.
Matching endpoints or labels never imply replacement.

Archboard allocates new IDs in the model namespace and uses them for module filenames.
Additions accept no supplied ID, schema version, former names, or outgoing array.
Read allocated IDs from the result's subjects or the next model read.
Refer to a module added in the batch through its unique name.
Relationship edits and removals require qualified IDs.

Claim all affected existing subjects:

- For a relationship change, include its identity and former and new source and target modules.
- For containment, include moved descendants and former and new ancestor paths.
- For additions and removals, include the model ID, such as `Shop`, to reserve structure changes.

A transfer claim can name `["Shop#Gateway","Shop#Worker","Shop#Dispatch"]`.
Unrelated scopes remain available.
If a refusal names missing scopes, release the partial claim and obtain the complete scope.

Removing a module removes incident relationships unless the batch repairs their endpoints.
Reparent or remove every surviving child in the same batch. Archboard never promotes orphans.
Retired module and relationship IDs remain reserved in `model.json`.
Without a proposal intent, the batch changes only the selected current state.
For a draft, use [proposal operations](#create-and-compare-compact-proposals), including their confirmations.

## Author independent flows

A collection groups flows without assigning module ownership through its filename.
Collections have local identities. Flows and steps have qualified identities.
Claim the model, participants, and affected existing flows, steps, and holders before the batch.
For a complete example, use `examples/canonical-model/independent-flow.changes.json` in the Archboard checkout with its example modules.
Supply the common request fields from your own read and claim.

`add-collection` takes a name.
`add-flow` takes a collection identity or unique name, a `summary`, ordered participants, and nested steps.
[Flow authoring](authoring.md#say-what-each-flow-does) owns summary and source-evidence requirements.
Archboard allocates all new identities.

Use qualified module IDs or unique current or former names for participants and message endpoints.
A new module in the batch can use its unique name. Only qualified IDs persist.
Messages, decisions, loops, notes, repeat counts, summaries, and anchors keep their semantic fields.

`edit-flow` accepts a qualified ID or unique current or former name.
Its `set` assigns name, summary, or participants. Its optional `collection` transfers the same flow.

`edit-collection` renames a collection without changing its identity or file.
A unique former name still selects it.
`remove-flow` and `remove-collection` retire their remaining subjects.
A flow transferred out of a removed collection survives.

`edit-step` uses `set` and `clear` on a continuing step ID.
`add-step` supplies a nested step and placement. `remove-step` removes a subtree.
`move-step` preserves a subtree and its identities across holders or flows.

A holder contains steps: a flow, loop, or decision alternative.
Placement names `holder` and optional `before`, a sibling identity.
A decision also requires its exact `alternative` label.
Without `before`, the step appends:

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

Rename alternatives through the complete `edit-step.set.alternatives` label array.
Move every direct child of a renamed or removed alternative in that batch.
Missing holders, orphans, conflicting moves, cycles, and incompatible order refuse the whole operation.
Archboard never promotes orphaned steps.
The destination flow must list every message endpoint as a participant.

Module removal repairs participant lists and removes messages with removed endpoints.
It also removes loops, decisions, and flows left empty by those repairs.
Explicit endpoint repairs can preserve messages.
Claim former and new participants, affected flows, steps, and holders.
Refusals name missing claim scopes.
Retired flow and step IDs remain reserved in the manifest.

## Follow code and foreign references

A binding names implementing code independently of architecture ownership.
Use `model read <module> --code` or Open code beside the browser binding.
The vault uses its own checkout for its repository and the chosen checkout for other repositories.
The result includes `codeTarget` and effective `codeBinding`.
Unavailable code leaves architecture readable with a failure and recovery action.
The browser disables the code action and states why.

Code activation names the model, subject, and optional state or checkpoint.
A draft uses its own binding. A missing state never opens current code.
Historical code uses retained source associations and refuses changed files or a different revision.
An uncommitted association stores no source bytes. Recover them separately.

A module reference names another model, state, and subject explicitly.
The subject can be a module, relationship, collection, flow, or step.
Assign `references` through `edit-module.set` or remove the list through `edit-module.clear:["references"]`.
Omission preserves it:

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

`current` follows the foreign current designation.
A stable state ID selects that exact state, including an active draft.
For a retained state, include its complete `checkpoint` beside the stable state ID.
A pinned reference cannot use `state:"current"`.

References create no containment, relationship, claim, or ownership transfer.
Canonical ownership transfer is unavailable.
Proposal comparisons include reference changes.

```bash
archboard model read 'Shop#Gateway' --references
archboard model read 'Shop#Gateway' --reference 0
archboard model read 'Shop#Gateway' --reference 0 --code
archboard model read 'Shop#Gateway' --model Shop --code
```

`--reference` selects a zero-based list index.
`resolvedReferences` gives target addresses or unavailable diagnostics.
Available entries include the exact subject, model, and state names.

Following returns the foreign reading and `location`, including vault, model, subject, state, and any checkpoint.
`selectedSubject` preserves the target ID.
Modules also set `selectedModule`. Flows and steps also set `selectedFlow`.
No command changes either model or substitutes a similarly named model.

Open architecture follows that same address and preserves it through reload and browser history.
A relationship selects its exact member of an aggregate.
A collection offers its flows. Flows and steps open their containing flow.
Unavailable destinations keep their authored reference and recovery instructions visible.

Before local edits or retention, retain each referenced foreign reading through a separate operation in its own vault.
An existing exact foreign checkpoint must match the selected reading.
The local checkpoint records those pins without writing foreign files or history.
Saved navigation follows the pins even when foreign current files change or disappear.
If a pin or checkpoint is missing, restore the foreign archive and retry.
Never substitute foreign current content.

## Render a selected flow

Resolve the selection through `model read --flow <id>`.
If a name is ambiguous, use its qualified flow ID.
Behavioral diagrams require an authored exchange and never infer execution from structural relationships.

```bash
archboard model render --flow 'Shop#Checkout' --grammar sequence --out request.svg
archboard model render --flow 'Shop#Checkout' --grammar flowchart --out logic.svg
archboard model render --flow 'Shop#Checkout' --grammar sequence --checkpoint <exact-checkpoint-id> --out retained.svg
```

Each command writes a self-contained SVG and reports revision, dimensions, and placed identities.
Sequence draws ordered participants and messages. Flowchart draws control steps and branches.
Both include the complete flow, regardless of structural scope or relationship filters.
No named view is required.
For other exports and embedded pictures, use [rendering](#initialize-and-consume-one-live-model).

## Create and compare compact proposals

A proposal describes unbuilt architecture across modules and flows.
Its predecessor is the state that it starts from.
An active `.proposal.json` stores identity changes against a retained baseline, without changing current module or flow files.
Use `model proposals` for identity, name, predecessor, baseline, and lifecycle:

```bash
archboard model proposals -C <directory>
archboard model read --state '<proposal-name>' -C <directory>
archboard model compare --state '<proposal-name>' -C <directory>
archboard model compare --state '<proposal-name>' --against '<other-state-or-checkpoint>' -C <directory>
```

Use [authoring](authoring.md#say-what-each-proposal-changes) for names and summaries.
Use [the design lens](design-lens.md) to interpret comparison facts.
Keep independent proposals separate, even when names or task IDs match.

State selectors resolve stable IDs before unique current or former names.
`current` requests the explicit current designation.
A planning model has none until adoption.
Missing or ambiguous selectors refuse. Exact checkpoints require complete immutable IDs.

`selectedState` names the selected identity, name, summary, documents, and lifecycle.
A draft reports `draft`. `manifest.current` describes the retained designation, not the selected draft.
Never label a draft as implemented Current.
The write revision includes the entire vault and all active proposals.

Read the proposal's predecessor.
Use `selectedState.id` as `target.state`.
Claim the model and affected existing subjects in that predecessor.
Add these fields to the common edit request:

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

For a broader example, use `examples/canonical-model/compact-proposal.changes.json` in the Archboard checkout.
The receipt identifies the allocated draft through `target` and `selectedState`.
For siblings, use the same predecessor. For a child, use the selected draft as predecessor.

For a planning root, start with `current:null`, no current modules or flows, and target state null.
Claim the model and add all unbuilt subjects in the proposal batch.
Archboard retains the empty baseline first.

To edit a draft, claim its state ID, model, and affected existing subjects.
Release a predecessor claim before claiming another target.
Use the draft ID as `target.state` with `proposal:{"type":"edit"}`.
`proposal.set` assigns name, summary, or documents.
`proposal.clear:["summary","documents"]` explicitly removes metadata.

A metadata-only edit uses `changes:[]`.
Ordinary edits keep the immutable baseline. Settled reconciliation retains the updated predecessor as the new baseline.

Creation and edits enforce these confirmations:

- `INHERITANCE_DROPPED`: Removing more than half of the modules still shared with the direct predecessor requires confirmation.
- Exactly half requires none.
- `PART_RECREATED`: A new ID repeats an absent ancestor's name or exact repository, path, and symbol binding.

Inspect affected subjects before confirming an authorized redesign or distinct part.
Add its code to `proposal.confirm`, for example `"confirm":["INHERITANCE_DROPPED"]`, and use a new operation identity.
A confirmed new part keeps its separate identity.
The receipt's `confirmed` lists only acts that occurred.
These proposal confirmations do not change current edits or automatic reconciliation.

Composite fields, including bindings, change as a whole.

`model compare` and `model read --compare` use the same default base.
Comparison defaults depend on ancestry:

- A draft with `predecessorCheckpoint` compares with that checkpoint and reports `comparison.reason:"predecessor"`.
- A draft that follows Current through its predecessor chain compares with Current.
- Other dependent drafts compare with their retained predecessor, even when Current exists.
- A draft without a predecessor, or a completed state, compares with Current when it exists.
- A planning root without Current has no default comparison.

A checkpoint-based draft can contain only a fragment of Current.
Comparing that fragment with Current reports the rest as removed.
Use `--against` to select a coherent named state or complete checkpoint explicitly.
`comparison.reason` names the base choice. `comparison.revision` identifies its exact inputs.

If you read base definitions separately, require matching revision, model, state, and checkpoint identities.
A retained selection can have a different revision from its live comparison base.
Subject entries report added, removed, changed, unchanged, and changed semantic fields, including semantic order and emphasis differences.

An explicit empty planning base returns `comparison.against:null` and its exact `comparison.checkpoint`, with planning additions still listed.

If external edits change the predecessor, `PREDECESSOR_CHANGED` blocks ordinary reads and edits until [reconciliation](#reconcile-dependent-proposals).
Preserve the baseline and proposal changes. Exact retained proposal readings remain available.

History lists proposals, current, historical, and shelved readings with summary before name.
The header identifies the selected lifecycle.
The comparison control offers No comparison, Current, the proposal base, and other active proposals.
For an exact saved base, choose Compare on its History row.
Both selections survive reload and browser history.

The diagram marks additions, removals, and changes. Select a subject for its changed fields.
Removed subjects use exact base definitions.
An unavailable base produces an incomplete comparison and Refresh comparison, never substitute current definitions.

Active drafts refresh after accepted edits. Saved drafts stay exact.
An external predecessor change preserves the requested selection and shows the refusal.
Use a saved reading to inspect the retained proposal.

## Temporary explanations

An explanation capture fixes the reading that the agent answers.
It keeps subjects, complete revision, state or checkpoint, and reading intent together.
Reading intent includes scope, focus, relationship filters, group visibility, grammar, and optional flow.
`reading.groups` accepts exact visible group IDs, or `true` and `false` for all and none.
A compared capture also keeps its actual base and separate revision. Navigation cannot retarget it.

Before answering a screen question, run `browser panes`.
Read the selected pane's `architecture` report and `tabSessionId`.
If absent, ask the person to open the canonical reading before resolving a pointing request.
Use the reported `architecture.vault`, even after foreign navigation.
Keep `reading.referenceSubject` separate from temporary pointer selection.
Do not infer architecture from `paneKey`.

For a comparison, copy `model.comparison.revision.digest` into `request.expectedComparisonRevision`.
Omit it only when the observed model has no comparison.
Keep it with target and narrative-source revisions from that same reading.
A changed, missing, or newly appeared comparison returns `MODEL_CHANGED` before invocation.

Use `model explain` to request a new action from the local workhorse.
Pass `-C` for the directory that holds the reported vault.
Keep its complete `selection` and guards when reading further context.
If your queue names `captureFile`, read its complete JSON before answering.
The server removes that temporary file.
If it contains `explanation`, answer the accepted capture directly without another invocation.

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

Other actions are `explain-relationship`, `trace-flow`, and `explain-proposal`.
Without an explicit flow, `trace-flow` can investigate without authoring one.
An explicitly unavailable flow refuses.
A proposal explanation requires the selected draft and comparison.
State and checkpoint selectors are exclusive.
Read progress through the same command:

```json
{
	"type": "read",
	"tabSessionId": "<reported-tab-session>",
	"actionId": "<original-action-identity>"
}
```

The result reports captured, queued, running, completed, failed, cancelled, or unavailable.
Browser and voice use the same `action.text` answer.
Toolbar, context menu, and keyboard request that same action.
After navigation, the answer still names its original model, state, subjects, and revision.

The coordinator speaks it without requesting another explanation.
The browser receives progress updates and refreshes after reconnecting.

Send `type:"latest"` with `tabSessionId` for the last invocation or retry.
Use returned `action.vault` for later reads, cancellation, and retry, even after navigation.
If the action queues on your own workhorse, end your turn so it can start.

If `action.retryable` is true, send `type:"retry"` with the original tab and action identity.
Retry preserves captured content despite navigation or source changes.
Uncertain delivery disables retry to prevent duplicate work.
Send `type:"cancel"` to remove its queue item or interrupt its exact turn.
Read until the provider reports the final outcome.

Explanations write no architecture and take no claims.
Answers last only within the local agent generation and tab lifetime.
If the user requests saving one, use a claimed edit with a fresh complete revision.

## Reconcile dependent proposals

Standing records unresolved issues durably.
Before editing a family, read `selectedState.standing` and each proposal entry.
Absent standing means settled.
Each issue names its subject, kind, field, both values, and repair action.

`standing.blockedBy` names an unsettled ancestor.
A blocked descendant keeps its last coherent reading. A new child of an unsettled proposal starts blocked.

Claim affected descendant state IDs, existing subjects, and model structure.
Submit the predecessor edit with the complete vault revision.
Archboard reconciles parents before children in one durable operation.
Safe changes reach following proposals together.
Disputes keep the proposal side and block descendants.
The conflict baseline stays retained until settlement.

For `PREDECESSOR_CHANGED`, read the catalogue and claim the affected family.
Target the changed predecessor with this `model edit` intent:

```json
{ "proposal": { "type": "reconcile" }, "changes": [] }
```

This updates following proposals without another predecessor edit or current designation change.
Saved checkpoints keep their original content and standing.
The browser shows unresolved and blocked states, both disputed values, repair instructions, and links to blocking live ancestors.
The browser authors no settlement.

To settle, claim the proposal and affected family, then use its stable ID as `target.state`.
Give every issue one choice in the same request:

```json
{
	"proposal": {
		"type": "settle",
		"resolutions": [{ "subject": "Shop#Gateway", "field": "description", "take": "mine" }]
	},
	"changes": []
}
```

`mine` accepts the proposal, `theirs` accepts the predecessor, and `edited` accepts the accompanying ordinary batch.
Without `field`, a resolution covers all issues for that subject.
For order issues within one holder, use one choice throughout.
For a third order, use `edited` with ordinary movement changes.

Incomplete or overlapping choices return `MODEL_INVALID` and install nothing.
Ordinary edits preserve standing until settlement.
`PROPOSAL_BLOCKED` refuses edits and settlement. Settle the named ancestor first.

Complete settlement reconciles following drafts in the same operation.
A continuing subject deleted by the predecessor keeps its qualified ID through retained proof.
That proof never permits fresh allocation of retired IDs. Leave proof storage to Archboard.

`reconciliation:true` means that affected states still need settlement.
`reconciliations` names changed states and their standing. `selectedState` also exposes its standing.
Use [retry and recovery](#retry-and-recover-operations) for interrupted family operations.

## Complete a proposal

Adoption records implemented architecture. Shelving records a stopped proposal.
Adopt or shelve only with owner authorization.
A request to prepare the implementing PR authorizes adoption on its branch.
If the vault lives in another repository, the adoption is a commit there and cannot merge with the code. Tell the owner, and ask which PR merges first.
A source commit, merge, approval, or checkpoint performs neither action. The browser performs neither action.

Read the draft and claim its state, model, affected subjects, and affected descendant states and subjects.
For adoption, include changed subjects from both Current and the complete draft.
Use the common `model edit` request and doing line with one lifecycle intent:

```json
{ "proposal": { "type": "adopt", "reason": "The queue is implemented." }, "changes": [] }
```

```json
{ "proposal": { "type": "shelve", "reason": "The team chose direct dispatch." }, "changes": [] }
```

Lifecycle intents accept no content edits.
Adoption requires a coherent draft and settled ancestry.
Shelving accepts unresolved or blocked drafts.
`PROPOSAL_BLOCKED` requires settlement before adoption.
`PROPOSAL_SUPERSEDED` means that the draft follows a former current state. Normal adoption refuses it.

For an intended complete replacement, first compare explicitly with Current:

```bash
archboard model compare --state '<draft-id>' --against current -C <directory>
```

Copy the complete `comparison` from a read without `--beside` into `proposal.comparison`.
Set `proposal.force:true` and use that reading's complete revision.
`COMPARISON_REQUIRED` means absent, incomplete, or stale comparison evidence.
Forced adoption installs the complete proposal, including removals, rather than applying changes to another baseline.

Adoption keeps the proposal ID, name, former names, documents, and predecessor.
It records the previous current state, reason, and time.
A planning model receives its first Current without an invented predecessor.
Shelving keeps the final changes, baseline, ancestry, documents, reason, and time.
Completed states refuse ordinary content edits.

`model proposals` returns `states` beside active `proposals`.
A current read without state or comparison selectors also exposes this catalogue.
It names current, draft, historical, and shelved states. Completed entries include an exact `checkpoint`.

Reopen them by stable ID or unique current or former name.
If retained state identities are ambiguous, use an exact checkpoint.
Exact checkpoints keep their original lifecycle after later adoption or shelving.

The receipt's `selectedState` names the completed lifecycle.
Its checkpoint keeps `lifecycle`, the final proposal, and the exact previous Current.
New drafts record `createdAt`.
Completed metadata records `adoptedAt` or `shelvedAt`, `reason`, and `previousCurrent`.

Current files keep only Current and its lineage. Completed history stays in the archive with its baseline dependencies.

In History, open Decision and history for dates, predecessor, prior implementation, baseline, and documents.
Its state and baseline controls open those readings.
For missing history, [fetch](#publish-and-fetch-history), then Refresh.

## Correct a recorded state

Use correction for factual errors in historical or shelved states, and a new proposal for a new design.
Read the logical state and keep `checkpoint.id`.
Read the current catalogue again for its complete `revision`.
Claim the model, completed state, affected subjects, and following drafts affected by the correction.

Inspect supporting source commits.
Supply one available full Git commit ID per referenced repository. Uncommitted files cannot support historical corrections.

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

The browser's lasting state address opens its latest corrected facts and refreshes after correction, even without current-file changes.
Decision and history shows reasons, dates, and source commits.
Previous and Corrected open exact checkpoints. Comparisons show both audits together.
If history disappears, the requested checkpoint remains selected with Refresh after recovery.

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
A planning-only import keeps no Current and records `state:null`, labeled as a planning model in History.
Use [retry and recovery](#retry-and-recover-operations) in the same destination after interruption.

To restore deleted history behind unchanged inputs, use their current complete revision.
Keep the bundle as a backup because local archives can be deleted.
Import excludes publication destinations, receipts, claims, and private recovery files.
Configure and publish destination history explicitly when needed.

## Initialize and consume one live model

Initialize an empty vault with `archboard model init --name <name> --operation-id <id> --writer <writer> --doing <intent>`.
In a Git checkout without a vault, the same command first makes `<root>/.archboard/vault` and registers the checkout.
`archboard init` uses that same operation for new vaults.
The model starts with an allocated stable ID, no Current, and no fixed levels.
After an interrupted response, retry the exact operation identity. A different intent needs another operation identity.
Occupied vaults refuse. Legacy vaults require [migration](legacy-migration.md).

`model render --out picture.svg` draws structure by default.
Choose `--module`, exact `--scope`, repeated `--focus`, or `--hide-kind` for the reading.
Each relationship in that reading has a drawn line.
Use `--state` or `--checkpoint` for the architecture selection.
For behavior, follow [flow rendering](#render-a-selected-flow).

Exports use the state's default comparison, with removed subjects from its exact base.
Unresolved subjects have warning badges. Joined connections warn if any represented relationship remains unresolved.
Filters preserve the complete state's container interface meaning.
If the base changes during export, reread and retry `STALE_REVISION`.

`model rasterize --out picture.png` accepts the same selectors, plus `--scale` and `--region`.
Both artifacts carry a recipe with model identity, reading, revision, and picture digest.

Track exported pictures in Git when other files embed them.
`check embeds` discovers only Git-tracked SVG and PNG files with render recipes.
`check embeds --fix` redraws changed local sources when artifact replacement is authorized.
It preserves legacy recipes until explicit migration and canonical export, and never selects a replacement model by name.

If saved meaning draws incorrectly, fix the renderer. Do not change architecture or add geometry to repair placement.

`check code --state <state>` inspects one state. `--every-draft` inspects independent proposals by identity.
The result's `models` lists model, state, and complete revision.
Findings include `model`, `state`, and stable subject IDs.

`BINDING_PATH_MISSING` reports absent paths, including bindings without symbols.
Unavailable repositories and source revisions are skips, not missing-path warnings.
Remembered findings use that revision and stay empty until a code pass completes.

A proposal inspection reads its comparison source separately.
If that source changes, `STALE_REVISION` refuses the inspection.
Read the selected state again before retrying.
For binding and interface findings, follow [authoring](authoring.md).

## Navigate a local agent pane

`browser show [model] --pane <pane>` opens a model in an existing pane.
The optional model must match the vault's identity or exact name.
Use `--module`, `--scope`, `--focus`, `--hide-kind`, `--grammar`, and `--flow` for its reading.
Use `--state`, `--checkpoint`, `--preview`, `--bookmark`, or `--legacy-address` for selection.
`--walkthrough <id> --beat <index>` requests a narrative at a zero-based beat.
`--input <file>` supplies complete reading JSON.

POST `/api/panes/show`, also `/api/browser/show`, accepts `{vault,pane,agent,session,reading}`.
`reading` uses the same selectors, plus optional `model` and `beat`.
The server resolves it before changing the pane or chosen checkout.
The `pane_model` message carries `{model,reading,revision,vault,repository}`.
The result carries `{success,model,reading,revision,repository,checkout,paneId}` and pane address fields.

`browser panes` reports `panes[].architecture` and `tabSessionId` for explanation and narrative guards.
Navigation can choose a checkout but cannot activate the tab's conversation.
Browser activation focuses that checkout's workhorse.
Rendering runs in the client. Agents run in their addressed local checkouts.
For narratives, read [canonical walkthroughs](canonical-walkthroughs.md).
