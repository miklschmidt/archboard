---
status: accepted
---

# Canonical model reads keep legacy authority explicit

The final canonical consumer path supersedes temporary live legacy compatibility below. Unmigrated authority remains explicit, but only migration and exact originals use legacy decoding.
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) records the replacement accepted through TASK-549.24.
The original decision below remains historical evidence.

Overlapping boards can give one module several definitions.
TASK-549 replaces that ownership with one canonical model per vault.
Readers need the new model without losing legacy proposals, decisions, or history.

Automatic conversion during a read is rejected.
Independent boards require deliberate identity and history choices before they can form one model.
Legacy boards remain authoritative until explicit migration.
A canonical read refuses a vault that still contains legacy boards.

Agents and readers use one coherent model contract.
A manifest identifies the model and its current state.
Each module owns its definition and outgoing relationships.
Incoming relationships derive from those definitions.
Containment forms a forest, while dependencies can cycle.

Subject identities include their original namespace and short local identity.
Imported board provenance establishes identity, without owning navigation or architecture.
Names and file locations never establish identity.
A current or former name resolves only when it identifies one subject.

The reader never returns a partial model as a coherent reading.

A read token identifies the observed inputs.
It covers recognized paths and exact bytes, including policy.
Archboard refuses inputs that change while it reads them.
This detection does not promise atomic visibility to arbitrary filesystem readers.
Reads create no history, timestamps, counters, or derived authority.

[ADR 0065](0065-checkpoints-retain-architecture-without-selecting-current.md) extends this contract with immutable local checkpoints.
Their historical inputs remain independent of current files.

For canonical models, this replaces the board ownership in ADR 0015 and ADR 0023.
It replaces the fixed board-level navigation in ADR 0029.
Those earlier contracts still govern legacy vaults.
Agents author meaning, browsers own presentation, and every request names its vault.

## Legacy migration planning

TASK-549.19 introduces an inventory without requiring a canonical writer.
The inventory never saves its schema normalization.

Matching names, bindings, and drill-down links supply evidence, without establishing identity.
Only explicit mappings combine subjects.

A separate authored `.archboard/migration-plan.json` stores mapping choices and conflict decisions.
The source fingerprint covers recognized inputs and policy but excludes this separate record.
Plan replacement changes no board version, current designation, or architecture announcement.
Conflict keys include the source fingerprint, so changed sources invalidate old choices.

## Canonical structure authoring

TASK-549.04 extends the existing edit operation with a batch of module and relationship changes.
A batch holds every change for one intent.
The shared runtime validates the whole candidate before the existing durable transaction installs its affected files.

Callers cannot choose a new subject ID or replace a continuing ID.
Field omission preserves the existing value, and an explicit clear list removes optional fields.
Null never requests deletion.

Each relationship belongs to its source module file.
Removed module and relationship IDs remain reserved in the manifest.
Current-state edits create no proposal ancestry and bypass no confirmation requirement.

Claims cover explicit modules, relationships, and the model ID as a structure scope.
That structure scope protects identity allocation and retirement without claiming every module.
A competing claim refuses admission, while unrelated subjects remain available.

## Independent flow authoring

TASK-549.05 adds independent `.flows.json` collections to the complete canonical reading.
A collection identity names an authoring group and differs from qualified flow and step identities.
Its filename restricts no participant or module reference.
Return messages add no structural relationships.

Sequence and flowchart renders require an explicit selection, including when only one flow exists.
The CLI installs an output artifact only for a successful command outcome.
A refused render preserves any existing output file and returns structured diagnostics.

## Code and foreign model references

TASK-549.15 keeps architectural ownership separate from source location and foreign navigation.
A module can hold explicit references that name repository, model, subject identity, and state.
Neither a reference nor a code binding establishes containment or transfers ownership.
No navigation operation writes either model.

Local checkpoint preparation records exact foreign revision pins.
It never creates foreign history or writes across models.
Missing foreign models, subjects, states, or archive objects remain unavailable without a current substitute.

Source availability stays separate from architecture availability.
The opener never switches a checkout or copies source code into architecture history.

## Compact proposal readings

[ADR 0067](0067-active-proposals-store-identity-changes.md) extends this reader to compact active proposals.

## Dynamic narrative readings

TASK-549.14 adds versioned `.walkthrough.json` inputs to the same coherent reader and writer.
Each beat states a complete scope, selection, focus, filters, grammar, and optional flow.
Omission resets presentation fields instead of inheriting hidden state from another beat.
Narrative inputs contain no geometry or architecture copies.

Playback resolves current, a proposal, or an exact checkpoint once.
Missing history returns an unavailable reading and never substitutes current inputs.
Shared and recorded playback require an exact retained target.

## Explicit migration preview

TASK-549.20 adds an explicit preview selection to the existing canonical reader.
Legacy files remain the sole live authority, and ordinary canonical reads still refuse them.
No preview read installs inputs, retains history, or changes a current designation.
The result carries the exact original source fingerprint and saved plan revision.
The candidate revision also covers those inputs, so a different plan invalidates a prior reading.
Board level classification disappears without a numeric replacement.

TASK-549.21 extends the same preview with original history coverage and explicit draft conversion choices.
A qualified original state opens only its board's original modules and flows.
The result names its original board and file and states that repository coverage is incomplete.
It clears the current designation and never adds present-day surrounding modules.

The existing checkpoint operation also accepts original migration retention.
The archive keeps a lossless byte envelope for every recognized input and the plan.
This envelope preserves unsupported documents without depending on text decoding or normalization.
A migration checkpoint carries explicit migration metadata and no selected canonical state.
Its reader reconstructs originals from Git objects independently of live source and plan files.
Incomplete conversion returns inspectable originals and diagnostics rather than a fabricated complete model.

## Converted original readings

TASK-549.22 extends preview through the existing reading, reference, and playback owners.
Every converted beat requires an explicit original view.
Conversion preserves original bytes and never inherits another view or supplies an overview.
Unknown or ambiguous aliases refuse without matching similar names or substituting current architecture.
Historical coverage never borrows another state's decision.

## Authority after explicit cutover

TASK-549.23 uses the ordinary architecture read for authority discovery.
A successful ordinary read selects canonical authority.
LEGACY_AUTHORITY preserves the existing reader for an unmigrated vault.
RECOVERY_REQUIRED and MODEL_BUSY block format selection during installation.
Other canonical failures remain unavailable and do not select legacy content.
No second authority endpoint, content cache, journal, or migration engine exists.
Installed former addresses resolve through their immutable originals checkpoint.
Ownership transfer remains unavailable for canonical models.

## Canonical default transition

TASK-549.24 retires live legacy authoring and consumers.
See [the accepted consumer transition](0068-one-live-canonical-model-and-consumer-path.md) for its consumer contract and acceptance boundary.
Legacy bytes remain available for explicit migration and exact retained history.
