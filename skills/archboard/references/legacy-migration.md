# Inventory legacy boards

Use this workflow when an owner requests legacy migration planning.
Legacy boards remain authoritative throughout this workflow.
A mapping plan records intended identities and conflict choices.
It contains no active architecture.

## Read the inventory

Choose a stable import namespace with the owner.
Use an existing short ID that follows the normal ID rules.
Keep that namespace for every later read and save.

```bash
archboard model inventory --origin Shop -C /path/to/checkout > inventory.json
```

The result includes every original board as `boards[].source`.
The optional `document` is the existing decoder's normalized, in-memory reading.
Inventory never persists that normalization.
Unreadable documents retain their source text and report diagnostics.
An unreadable byte sequence refuses the inventory.

Each complete document retains its states, adoptions, shelvings, reconciliation bases, views, walkthroughs, corrections, and document references.
`identities` includes subjects from every state and reconciliation base.
An imported identity uses `origin/original-board-id#local-id`.
A board family supplies provenance, without owning canonical containment.
`aliases` retains board addresses, former names, and named state addresses.

`source` fingerprints recognized architecture paths and exact bytes, including the authored policy.
It covers file additions, removals, renames, and whitespace changes.
The separate planning record does not change this source fingerprint.
Referenced source-code and document contents remain external evidence.
Inventory does not copy or retain those external files.

## Record owner choices

Read `evidence` before selecting identities.
Matching names, exact bindings, and drill-down links suggest shared subjects.
They never create mappings.
Current-state conflicts do not combine independent historical readings.
A planning-only board retains its original draft coverage.

Create a request containing `plan` and `expectedPlan` from the inventory.
Use the inventory's `planRevision` as `expectedPlan`, including `null` before the first save.
Keep `plan.sourceDigest` equal to `source.digest`.

Add each deliberate mapping to `plan.mappings`:

```json
{
	"legacy": "Shop/Detail#Api",
	"canonical": "Shop/System#Gateway",
	"reason": "The owner identifies one public gateway"
}
```

Both identities must already appear in the inventory with the same subject kind.
Map directly to the chosen canonical identity.
An omitted mapping preserves the original identity.
To declare two suggested subjects separate, map each identity to itself with a reason.
All original namespaces and addresses remain in the inventory after a combination.

Inspect `conflicts` after recording identity mappings.
The categories cover definitions, parents, sibling order, relationship ownership, and policy vocabulary.
Some conflicts become visible only after their identities are combined.
Add a choice for each intended resolution to `plan.choices`:

```json
{
	"conflict": "<exact conflict key from the inventory>",
	"reason": "Keep the implemented public definition",
	"resolution": { "kind": "select", "option": 0 }
}
```

An option selects one original source value.
For a deliberate replacement, use `{"kind":"value","value":<JSON value>}`.
These choices record intent until an explicit preview applies them.
The preview must make sure that the complete target is coherent.
An empty `unresolved` list does not authorize cutover.

```bash
archboard model plan --input choices.json --doing "Record the owner identity choices" -C /path/to/checkout
```

The command saves only `<vault>/.archboard/migration-plan.json` through durable atomic replacement.
Keep this authored plan in version control when the vault is tracked.
The plan file is independent of every board claim and version.
No board content, current designation, archive checkpoint, or pane announcement changes.

If captured inputs differ from your request, saving returns `MAPPING_STALE` without replacing the plan.
A changing inventory returns `INVENTORY_CHANGED`.
Keep external file edits idle while saving choices.
Fingerprints detect observed interference but do not lock external editors.
Read a fresh inventory before revising the request.
If the source changes, review mappings and rebuild conflict choices against its new fingerprint.
If the saved namespace differs, use its original namespace.
If a source has duplicate family IDs, resolve that ambiguity explicitly before saving mappings.

## Preview the current model

Save the plan before requesting a preview.
Use the same origin namespace that you supplied to `model inventory`.

```bash
archboard model read --preview Shop -C /path/to/checkout
archboard model read 'Shop/System#Api' --preview Shop --flow 'Shop/System#Buy' -C /path/to/checkout
```

Open the local browser at `/?modelA=Shop&previewA=Shop` to inspect that candidate.
For a different repository, add its registered identity as `repoA`.
The preview uses the existing module navigation, selection, filters, and flow modes.
Its source disclosure shows both fingerprints, original board coverage, and proposed state mappings.
Reload and browser history retain the preview origin and selected scope or flow.
If the source changes, Refresh refuses the stale candidate until the plan matches the source again.

Browser snapshots and diagnostics normalize old board schemas in memory.
Opening a preview does not persist those schema upgrades.
Ordinary legacy CLI reads retain their existing schema migration behavior.

The existing canonical model result carries the composed current modules, source-owned relationships, and independent flows.
The preview uses the origin as its model identity and composed current-state identity.
It names that state `Migration baseline`.
Synthetic file paths describe candidate definitions, and no file is installed there.
The result contains no board level or numeric depth.
The shared policy still carries its existing vocabulary contract.

`migrationPreview.source` retains the exact legacy source fingerprint.
`migrationPreview.planRevision` identifies the saved mapping bytes.
`migrationPreview.coverage` retains original board names and current-state metadata, including summaries and documents.
The model revision covers the candidate, source fingerprint, and saved plan.
Changing the source or plan produces another revision.
Current-state document evidence also follows the composed modules.
Explicitly combined subjects retain their other source names as former names.

`migrationPreview.plannedBoards` records planned-only states and their canonical state mappings for later proposal conversion.
An omitted state mapping preserves its original qualified identity.
A planning-only vault returns no current modules or flows and a null current designation.
It never substitutes a draft for implemented architecture.
Historical proposals, walkthroughs, bookmarks, and installation remain separate delivery slices.
Read the inventory for their complete original coverage.

Definition choices supply complete definition fields without identity or authored order.
Parent choices supply a qualified module identity or `null` for a root.
Relationship-owner choices supply the source module identity.
Order choices supply each disputed canonical sibling exactly once in the intended order.
The candidate preserves original order values when they satisfy the selected sequence.
A changed sequence reuses those positions and separates tied values when necessary.
Flow-definition choices preserve complete recursive steps and participant order.
The inventory reports disagreements between explicitly combined current flows.
Contradictory pairwise choices refuse the candidate.

For a policy conflict, supply the same complete policy object in every policy choice.
Include the original kinds and groups that the candidate uses.
The preview changes no source policy bytes.
A source option that still names an undefined vocabulary key cannot establish a coherent candidate.

Each current drill-down requires an explicit entry in `plan.references`:

```json
{
	"legacy": "Shop/System#Api",
	"reference": {
		"repo": "github.com/acme/shop",
		"model": "Shop",
		"subject": "Shop/Detail#Gateway",
		"state": "Shop"
	},
	"reason": "Open the gateway in the composed migration baseline"
}
```

Use the existing model-reference contract for the target.
A reference names the repository, model, subject, and state explicitly.
An exact historical target also names its checkpoint.
The preview never infers a target subject from a board name or a root list.
Foreign and historical targets retain their explicit addresses when those targets remain unavailable.
Resolving references uses the existing reader and does not import their subjects into current architecture.

If the saved plan is absent, the reader returns `MAPPING_REQUIRED`.
If the source fingerprint changes, the reader returns `MAPPING_STALE`.
Unanswered conflicts or drill-down targets return `MAPPING_UNRESOLVED`.
Invalid mappings or contradictory choices return `MAPPING_INVALID`.
Incoherent canonical output returns `MODEL_INVALID` with affected paths and identities.
The CLI returns exit status 2 for these refusals.
A source or plan change during composition returns `MODEL_CHANGED`.

Select preview independently of state, checkpoint, comparison, and explanation requests.
Module and flow selectors use the same canonical identities and unique names as ordinary reads.
HTTP readers use `/api/architecture/model?vault=<vault>&preview=Shop` with the same result contract.
The public runtime uses `readArchitectureModel(vault, module, flow, {preview: "Shop"})`.
All requests continue to name their vault explicitly.
Preview reads save no model, checkpoint, plan, timestamp, or current designation.
Ordinary model reads still return `LEGACY_AUTHORITY`.
Continue to use legacy board commands for active architecture.
