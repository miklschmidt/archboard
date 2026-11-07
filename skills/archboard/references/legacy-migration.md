# Inventory legacy boards

Use this workflow for owner-requested migration planning or `LEGACY_AUTHORITY`.
Original `.semantic.json` files remain authoritative until owner-approved installation.
Retired `board` commands are unavailable.
A mapping plan records identity and conflict choices without creating active architecture.

## Read the inventory

Choose a stable short import namespace with the owner, using the [canonical ID rules](canonical-models.md#read-the-model).
Keep it for all reads and saves:

```bash
archboard model inventory --origin Shop -C /path/to/checkout > inventory.json
```

`boards[].source` preserves each original board.
Optional `document` contains its normalized reading without saving that normalization.
Unreadable documents keep source text and diagnostics. An unreadable byte sequence refuses live inventory.

Complete documents retain states, adoptions, shelvings, reconciliation bases, views, walkthroughs, corrections, and document references.
`identities` includes every state and reconciliation base.
Imported IDs use `origin/original-board-id#local-id`. The board records origin, not canonical containment.

`aliases` keeps legacy addresses, former names, and named states.

`source` fingerprints recognized paths and exact bytes, including policy.
File additions, removals, renames, and whitespace changes affect it. The separate plan does not.
Referenced code and documents remain external evidence. Inventory does not copy them.

## Record owner choices

Read `evidence` before choosing identities.
Names, bindings, and drill-down links suggest matches but never create mappings.
Current conflicts never combine separate histories. Planning-only boards keep their draft coverage.

Create a request with `plan` and `expectedPlan`.
Copy `planRevision` to `expectedPlan`, including `null` before the first save.
Keep `plan.sourceDigest` equal to `source.digest`.
Add deliberate identity mappings to `plan.mappings`:

```json
{
	"legacy": "Shop/Detail#Api",
	"canonical": "Shop/System#Gateway",
	"reason": "The owner identifies one public gateway"
}
```

Both identities must exist in the inventory with the same subject kind.
Map directly to the chosen identity. Omission preserves the original.
To keep suggested matches separate, map each to itself with a reason.
Combinations preserve all original namespaces and addresses in the inventory.

After mapping, read `conflicts` for definitions, parents, sibling order, relationship ownership, and policy vocabulary.
Some conflicts appear only after identities combine.
Add each resolution to `plan.choices`:

```json
{
	"conflict": "<exact conflict key from the inventory>",
	"reason": "Keep the implemented public definition",
	"resolution": { "kind": "select", "option": 0 }
}
```

An option selects an original value.
For a replacement, use `{"kind":"value","value":<JSON value>}`.
Choices take effect in preview, which must produce a coherent complete target.
An empty `unresolved` list does not authorize installation.
Save the plan:

```bash
archboard model plan --input choices.json --doing "Record the owner identity choices" -C /path/to/checkout
```

Only `<vault>/.archboard/migration-plan.json` changes through durable replacement.
Track that authored file when the vault is tracked.
It is independent of claims and versions.
Saving changes no board, current designation, checkpoint, or pane announcement.

`MAPPING_STALE` rejects mismatched inputs without replacing the plan.
`INVENTORY_CHANGED` reports an inventory that changes during the operation.
Keep external edits idle. Fingerprints detect interference without locking external editors.

Before revising, read a fresh inventory.
For changed source, reassess mappings and rebuild choices against its fingerprint.
If the saved namespace differs, use that original namespace.
Resolve duplicate family IDs explicitly before saving mappings.

## Preview the current model

After saving, use the inventory's origin:

```bash
archboard model read --preview Shop -C /path/to/checkout
archboard model read 'Shop/System#Api' --preview Shop --flow 'Shop/System#Buy' -C /path/to/checkout
```

The preview returns composed current modules, source-owned relationships, and independent flows without installing files.
Its model and current-state identity use the origin. The state name is `Migration baseline`.
Synthetic paths describe candidate definitions only.
The result has no legacy level or numeric depth, while policy keeps its vocabulary contract.

Preview metadata includes:

- `migrationPreview.source`: Exact legacy source fingerprint.
- `migrationPreview.planRevision`: Saved mapping fingerprint.
- `migrationPreview.coverage`: Original board names and current metadata, including summaries and documents.
- `migrationPreview.plannedBoards`: Planning-only states and their canonical mappings.

The model revision covers candidate content, source fingerprint, and plan.
Current document evidence follows composed modules.
Combined subjects retain other source names as former names.
An omitted state mapping preserves its qualified identity.
A planning-only vault has no current modules or flows and a null designation, never a substituted draft.
Read inventory for complete original coverage.

Supply conflict choices as follows:

- Definitions: Complete fields without identity or authored order.
- Parents: Qualified module ID or `null` for a root.
- Relationship owners: Source module ID.
- Sibling order: Each disputed canonical sibling exactly once, in the intended sequence.
- Flow definitions: Complete recursive steps and participant order.
- Policy: The same complete object in every policy choice, including all used original kinds and groups.

The candidate keeps order values when they fit, otherwise reuses positions and separates ties.
Inventory reports disagreements between combined current flows. Contradictory pairwise choices refuse.
Policy choices change no source policy bytes. Undefined vocabulary cannot form a coherent candidate.

Each current drill-down needs an explicit `plan.references` entry:

```json
{
	"legacy": "Shop/System#Api",
	"reference": {
		"repo": "github.com/acme/shop",
		"model": "Shop",
		"subject": "Shop/Detail#Gateway",
		"state": "current"
	},
	"reason": "Open the gateway in the composed migration baseline"
}
```

Follow the [model-reference contract](canonical-models.md#follow-code-and-foreign-references), including exact checkpoints for historical targets.
Preview never infers subjects from board names or roots and never imports referenced subjects into Current.
Unavailable foreign or historical destinations keep their explicit addresses.

Preview refusals exit with status 2:

| Code                 | Cause                                                    |
| -------------------- | -------------------------------------------------------- |
| `MAPPING_REQUIRED`   | No saved plan                                            |
| `MAPPING_STALE`      | Changed source fingerprint                               |
| `MAPPING_UNRESOLVED` | Unanswered conflicts or drill-down targets               |
| `MAPPING_INVALID`    | Invalid mappings or contradictory choices                |
| `MODEL_INVALID`      | Incoherent candidate, with affected paths and identities |
| `MODEL_CHANGED`      | Source or plan changed during composition                |

Preview accepts qualified original states, exact migration checkpoints, and ordinary module or flow selectors.
Comparisons and explanations are unavailable.
HTTP uses `/api/architecture/model?vault=<vault>&preview=Shop` and requires an explicit vault.
Reads save no model, checkpoint, plan, timestamp, or current designation.
For active canonical authoring, complete [installation](#install-an-approved-preview).

## Inspect previews in the browser

Open `/?modelA=Shop&previewA=Shop`, adding `repoA` for another registered repository.
Use ordinary navigation, selection, filters, flow modes, and code actions.
The source disclosure shows both fingerprints, original coverage, and proposed state mappings.
Reload and history preserve origin, scope, and flow. Code actions preserve origin and follow the selected binding.
A planning-only preview shows no implemented modules.

If source changes, Refresh refuses until the plan matches again.
Browser reads normalize legacy schemas in memory without changing original bytes.

Original histories stay separate, even with equal draft names.
The coverage notice names the original board, not a historical repository-wide model.
State evidence shows lifecycle reasons, corrections, baselines, conflicts, and blocked ancestry.
The browser authors no mapping or migration.

Retained previews offer Original files with exact text or lossless base64 for unsupported UTF-8.
Only the selected file is decoded.
If originals cannot form a model, the browser keeps evidence and recovery instructions instead of drawing empty Current.
An absent mapping plan stays explicit.

## Preserve original history

A legacy state covers one original board, not the whole historical repository.
Select its qualified ID from `migrationPreview.history`:

```bash
archboard model read --preview Shop --state 'Shop/System#Old' -C /path/to/checkout
```

The result includes only that state's modules and flows, with a null current designation.
`migrationPreview.selected` names the board, file, and incomplete repository coverage.
History keeps state metadata, corrections, standing bases, adoptions, and shelving reasons.

Unpinned external history and code stay unavailable. Present-day surroundings never replace them.
Converted narratives and bookmarks keep original coverage and exact catalogue addresses.
Historical subjects keep their namespaces, without current identity merges.

## Map each draft

Add one `drafts` entry per draft to convert:

```json
{
	"legacy": "Shop/System#Draft",
	"predecessor": "Shop/System#Now",
	"baseline": { "kind": "content", "state": "Shop/System#Now" },
	"reason": "Preserve the original predecessor and its exact content"
}
```

A settled draft uses its original parent through `content`.
A draft with standing selects itself through `reconciliation-base`, preserving the conflict base instead of a changed parent.
A parentless planning root uses `predecessor:null` and `baseline:{kind:"empty",state:null}`.
Substituted predecessors or baselines refuse. Every choice belongs to the plan's exact source digest.

A history entry's `conversion` includes its mapping, baseline digest, and canonical changes after subject mappings.
Without `conversion`, the draft remains unmapped.
Matching names or task IDs never combine proposals.
Planning-only subjects become proposal additions, outside implemented Current.
Preview does not install active proposal files.

## Retain complete originals

Before installation, retain the exact originals with inventory `source.digest` and `planRevision`.
For an absent plan, pass `none`:

```bash
archboard model retain --migration Shop --expected-plan <plan-digest-or-none> --expect-revision <source-digest> --operation-id preserve-originals-1 --writer agent --doing 'Retain original migration evidence' -C /path/to/checkout
```

Retention preserves exact bytes, old schemas, unresolved documents, conflict bases, and the saved plan.
It changes no originals, current model, source HEAD, or index.
If retention fails, follow the [retry and recovery rules](canonical-models.md#retry-and-recover-operations).
A changed source or plan refuses a new retention request.
Read retained originals without consulting live files:

```bash
archboard model read --preview Shop --checkpoint <checkpoint> -C /path/to/checkout
archboard model read --preview Shop --checkpoint <checkpoint> --state 'Shop/System#Old' -C /path/to/checkout
```

`migrationPreview.originals` gives exact source and supported normalized documents.
Unsupported bytes also appear as `sourceBase64`.
`migrationPreview.originalInputs` gives every file as `{file,base64}`, including policy and plan.

Incomplete conversion choices return an empty model with originals and diagnostics. An absent plan revision stays null.
Qualified state selection requires a complete retained conversion plan.
Checkpoint `migration` metadata distinguishes original retention from a canonical state.
Archive order neither declares historical repository coverage nor adopts proposals.

## Read converted narratives

Choose from the preview walkthrough catalogue:

```bash
archboard model read --preview Shop --walkthrough 'Shop/System#Tour' -C /path/to/checkout
archboard model read --preview Shop --state 'Shop/System#Old' --walkthrough 'Shop/System#Tour' -C /path/to/checkout
archboard model read --preview Shop --checkpoint <checkpoint> --state 'Shop/System#Old' --walkthrough 'Shop/System#Tour' --shared -C /path/to/checkout
```

Current playback captures the composed candidate.
Original-state playback captures only that board and namespace.
Retained playback reads content and choices only from its migration checkpoint.
It reports separate source selectors and a complete target revision.
Keep that model until an explicit restart. Shared playback requires a checkpoint.

Every original beat must name an explicit view.
For a whole board, use an all-scope architecture view.
The view supplies grammar and exact subjects through complete reading instructions.
Optional `reading.visibility` lists module, relationship, and flow IDs without content or geometry.
It can isolate one relationship between otherwise connected modules.

A missing view returns `WALKTHROUGH_VIEW_REQUIRED` and stops that beat.
Original bytes and omissions remain available for owner correction.
Conversion invents neither a previous view nor an overview.
Unavailable subjects or flows stop the affected beat with recovery diagnostics.
Recursive navigation remains independent.

## Open imported bookmarks and addresses

Unused views become `migrationPreview.bookmarks` with only name, summary, and reading intent.
Select by stable ID to avoid ambiguity:

```bash
archboard model read --preview Shop --bookmark 'Shop/System#Saved' -C /path/to/checkout
archboard model read --preview Shop --legacy-address 'Store@Before' -C /path/to/checkout
```

`migrationPreview.bookmark` identifies the selection and unavailable subjects, flows, scope, or filters.
The model remains complete without bookmark-owned architecture.
`migrationPreview.addresses` lists exact aliases with original and canonical state IDs.
`legacyAddress` opens that original state and one-board coverage.
`migrationPreview.resolvedAddress` records the choice.

Aliases include board names, former names, filenames, state names, former state names, IDs, and serialized pane addresses such as `shop@Old`.
Resolution matches captured strings exactly. Ambiguous addresses refuse.
A conflicting state returns `TARGET_CHANGED`.
Unknown addresses return `LEGACY_ADDRESS_NOT_FOUND`. Unknown bookmarks return `BOOKMARK_NOT_FOUND`.

Before installation, both selectors require a preview origin.
Current merged subjects keep predecessor names, but never sibling proposal names, as former names.

For a historical drill-down, add its source state's qualified ID:

```json
{
	"legacy": "Shop/System#Api",
	"state": "Shop/System#Old",
	"reference": {
		"repo": "github.com/acme/shop",
		"model": "Shop",
		"subject": "Shop/Detail#Gateway",
		"state": "Shop/Detail#Old"
	},
	"reason": "Preserve the exact original target state"
}
```

Without source `state`, a reference choice applies only to the captured designated Current.
Historical coverage never reuses that choice.
Missing choices leave `REFERENCE_UNAVAILABLE` beside readable architecture.

Same-vault targets use qualified original states.
Retained local references keep their checkpoint and paired original state.
Unpinned external history stays unavailable even if a matching current model exists.
Complete original checkpoints retain every derived reading's source through installation.

In the browser, Bookmarks and Former addresses open these readings.
The address keeps `bookmarkA` or `legacyAddressA` through reload and history.
Scope, focus, or grammar changes resume ordinary exploration. Filters preserve exact bookmark membership.
Walkthroughs plays converted narratives with the availability and capture rules above.

Retained previews keep `checkpointA` with the original state or address, even after live originals disappear.
Following a reference keeps returned origin, state, and checkpoint and replaces the source bookmark or former address.

## Install an approved preview

Install only when the owner explicitly authorizes migration.
Save all choices and read a complete live preview.
Map every draft and exact baseline.
Give every converted current or draft beat an explicit original view.
Historical and shelved originals retain their bytes and unavailable-beat diagnostics.

`migrationPreview.installation` supplies complete destination and checkout fingerprints.
For a vault outside source Git, initialize [private history](canonical-models.md#initialize-private-history) before requesting installation intent.
Copy all revision objects and file lists without changing origin, source, plan revision, or candidate revision:

```bash
archboard model read --preview Shop -C /path/to/checkout > preview.json
bun -e 'const p = await Bun.file("preview.json").json(); console.log(JSON.stringify({origin:p.migrationPreview.origin, expectedSource:p.migrationPreview.source, expectedPlan:p.migrationPreview.planRevision, previewRevision:p.revision, ...p.migrationPreview.installation, authorization:"owner", operationId:"migrate-shop-1", writer:"owner", doing:"Install the approved migration"}));' > migration-request.json
archboard model migrate --input migration-request.json -C /path/to/checkout
```

Installation retains exact originals and choices before removing live copies.
If installation fails, follow the shared [retry and recovery rules](canonical-models.md#retry-and-recover-operations).
For a changed request, use a fresh preview and operation identity.
Converted proposals retain predecessor, baseline, reason, and original checkpoint in `proposal.migration`.
Planning-only subjects stay proposed. Current has one canonical representation after completion.

During installation, `RECOVERY_REQUIRED` and `MODEL_BUSY` block format selection.
After completion, ordinary `model read` identifies canonical authority and the change feed announces the new model.

The result's `migration` contains `bookmarks`, `addresses`, and `states`.
A selected bookmark is `migration.bookmark`. Read its diagnostics before using the reading intent.
Unavailable intent preserves exact IDs and leaves the model readable.
Canonical reads omit `migrationPreview` and original bytes.

Use `--bookmark <id>` without preview for installed Current bookmarks.
Use `--legacy-address <address>` without preview for exact original coverage.
During further original navigation, keep returned preview origin, original state, and checkpoint together.
Recursive canonical navigation requires neither selector.
Portable export includes installed metadata, compact baselines, exact originals, and complete archive ancestry.
