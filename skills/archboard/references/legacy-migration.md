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
These choices record intent only.
A later composition must validate the complete target and apply each choice.
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

Composition, proposal conversion, imported bookmarks, history retention, and migration installation belong to later delivery slices.
Continue to use legacy board commands for active architecture.
