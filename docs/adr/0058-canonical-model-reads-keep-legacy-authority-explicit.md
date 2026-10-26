---
status: accepted
---

# Canonical model reads keep legacy authority explicit

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

The reader preserves authored order, responsibilities, descriptions, groups, bindings, evidence, traffic, and document references.
It refuses duplicate definitions, missing local targets, unsupported formats, and invalid policy.
It never returns a partial model as a coherent reading.

A read token identifies the observed inputs.
It covers recognized paths and exact bytes, including policy.
Archboard refuses inputs that change while it reads them.
This detection does not promise atomic visibility to arbitrary filesystem readers.
Reads create no history, timestamps, counters, or derived authority.

[ADR 0059](0059-checkpoints-retain-architecture-without-selecting-current.md) extends this contract with immutable local checkpoints.
Their historical inputs remain independent of current files.

A pane lists root modules and opens their authored details.
The browser keeps the selected identity as presentation state.
One cached server reading supplies both the list and those details.
Refresh, returning to the tab, and reconnecting obtain a fresh reading.
Invalid inputs expose their diagnostic and recovery action.
An empty model remains readable.
A removed selection never silently selects another subject.

For canonical models, this replaces the board ownership in ADR 0015 and ADR 0023.
It replaces the fixed board-level navigation in ADR 0029.
Those earlier contracts still govern legacy vaults.
Agents author meaning, browsers own presentation, and every request names its vault.

## Legacy migration planning

TASK-549.19 introduces an inventory without requiring a canonical writer.
The architecture runtime captures exact legacy bytes and authored policy.
It uses the existing in-memory decoder and never saves its schema normalization.
Complete originals retain independent state coverage, lifecycle records, reconciliation bases, addresses, and references.

The owner selects an import namespace through the existing short-ID contract.
Each original board ID extends that namespace.
The original local subject ID remains unchanged.
Matching names, bindings, and drill-down links supply evidence, without establishing identity.
Only explicit mappings combine subjects.
Mappings name existing identities of the same kind and retain original provenance.

A separate authored `.archboard/migration-plan.json` stores mapping choices and conflict decisions.
Its exact-byte revision protects concurrent planning edits.
The source fingerprint covers recognized inputs and policy but excludes this separate record.
The existing lease and durable atomic writer serialize plan replacement under a reserved non-board key.
Plan replacement changes no board version, current designation, or architecture announcement.
Canonical architecture transactions and archive retention remain separate, later contracts.

Conflicts distinguish definitions, parents, sibling order, relationship ownership, and vocabulary.
Current definitions are compared within their original designated states.
No historical state borrows surrounding current architecture.
Conflict keys include the source fingerprint, so changed sources invalidate old choices.
An explicit replacement value records intent without claiming that a coherent target exists.
Later composition and installation must validate the complete candidate before any cutover.

CLI and server adapters share these schemas and runtime operations.
The public runtime tests use temporary files and disposable Git repositories.
Inventory does not retain external source code or referenced document contents.
