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
