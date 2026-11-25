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

## Edit one module description

Read the complete model. Use source-backed history or [initialize private history](history.md#initialize-private-history) before editing an untracked vault.
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
Follow [retry and recovery](history.md#retry-and-recover-operations) for failures or lost responses.
A complete operation announces its full affected subject set once.
Stable external corrections change current content without adoption metadata.

To release a claim, write `{"claim":"<claim.id>","writer":"architecture-agent"}` to `release.json`.
Run `archboard model release --input release.json -C <directory>` when the intent ends.
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
		"relationship": { "to": "Shop#Worker", "kind": "sync", "effect": "mutation", "order": 20 }
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
Each relationship states its `kind` and, except for declared-only dependencies, its `effect`. Choose them using [authoring](authoring.md#choose-the-kind-and-the-effect).
A batch that leaves a relationship without an effect is refused at `outgoing.<n>.effect`, unless its kind is `dependency`.
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
Use `model read <module> --code` to resolve it.
The vault uses its own checkout for its repository and the chosen checkout for other repositories.
The result includes `codeTarget` and effective `codeBinding`.
Unavailable code leaves architecture readable with a failure and recovery action.

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
Use [retry and recovery](history.md#retry-and-recover-operations) for interrupted family operations.

## Complete a proposal

Adoption records implemented architecture. Shelving records a stopped proposal.
Adopt or shelve only with owner authorization.
A request to prepare the implementing PR authorizes adoption on its branch.
If the vault lives in another repository, the adoption is a commit there and cannot merge with the code. Tell the owner, and ask which PR merges first.
A source commit, merge, approval, or checkpoint performs neither action.

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

## Initialize and consume one live model

Initialize an empty vault with `archboard model init --name <name> --operation-id <id> --writer <writer> --doing <intent>`.
In a Git checkout without a vault, the same command first makes `<root>/.archboard/vault` and registers the checkout.
`archboard init` uses that same operation for new vaults.
The model starts with an allocated stable ID, no Current, and no fixed levels.
After an interrupted response, retry the exact operation identity. A different intent needs another operation identity.
Occupied vaults refuse. Legacy vaults require [migration](legacy-migration.md).

`model render --out picture.svg` draws structure by default.
Choose `--module`, exact `--scope`, repeated `--focus`, `--lens`, `--hide-kind` or `--hide-effect` for the reading.

A picture is read through a lens: a named question that chooses which relationships draw.
`--lens <id>` names one. Without it, the picture reads through the vault's default lens, `main` unless the vault names another, or through `all` where the default would draw no line.
The built-in lenses are listed below.

| Lens           | Draws                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `main`         | All relationships except `dependency`, `sync` or `async` queries, and `sync` or `async` computes |
| `effects`      | Side effects: every mutation                                                                     |
| `sync-compute` | `sync` relationships with the `compute` effect                                                   |
| `network`      | `http`, `rpc`, `queue`, `event` and `stream`                                                     |
| `reads`        | Every query                                                                                      |
| `dependencies` | Every `dependency` relationship                                                                  |
| `all`          | Every relationship                                                                               |

Each relationship that a lens shows has a drawn line. A part whose every line the lens leaves out leaves the picture.
Pass `--lens all` to draw every relationship. `--hide-kind <kind>` and `--hide-effect <effect>`, both repeatable, hide relationships beyond the lens. The effects are `mutation`, `query`, `compute` and `declared`, a dependency that states none.
New lens configuration, `relationshipKinds` entries, and render and rasterize `--hide-kind` flags refuse the retired kind `call`. Use `sync` or `async`.
A sequence or a flowchart refuses `--lens`, because it draws its whole flow.
A vault adds or replaces lenses under `lenses` in its configuration, and names its default with `defaultLens`.
The legend is drawn under the picture. Use `--legend vertical` to draw it beside the picture, or `--legend none` to leave it out.
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

## Related workflows

- For checkpoints, recovery, private archives, remote publication, historical corrections, or portable export/import, read [history](history.md).
- For steering a live browser pane or answering a pointed screen question, read [browser panes](browser-panes.md).
- For narratives, read [canonical walkthroughs](canonical-walkthroughs.md).
