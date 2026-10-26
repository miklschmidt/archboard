---
status: accepted
---

# Active proposals store identity changes

A small proposal must not repeat unchanged modules and flows in a code review.
TASK-549.06 stores each active canonical proposal in one `.proposal.json` file.
Legacy board families retain their authority until explicit migration.
This decision replaces complete draft snapshots for canonical models in ADR 0023.
It extends the canonical reader in ADR 0060 and the retained archive in ADR 0059.

The proposal records a stable state identity, lasting name, former names, summary, documents, predecessor identity, immutable baseline, and normalized changes.
Its lifecycle is explicitly `draft`.
A planning model can have no current state.
A new planning root retains an empty coherent baseline and introduces its subjects through additions.
A child names its predecessor by stable state identity.
Agents resolve unique names through the reader before writing that identity.
Sibling proposals share no mutable copy of their predecessor.

Changes distinguish additions, removals, field assignments, explicit clearing, and structural placement.
Each change addresses a stable subject identity.
Assignments replace composite fields atomically.
Omitted fields preserve their values, and null never means deletion.
Module placement names its parent or the model root.
Relationship placement names its source module.
Flow placement names its collection and relative sibling.
Step placement names its flow, loop, or exact decision alternative and relative sibling.
No change addresses a text line or an array index.
The existing flow rules retain alternative labels, subtree identities, and explicit child placements.

The runtime applies the existing module and flow batch to one complete candidate.
It derives compact changes against the original baseline.
Before signing, it materializes those changes and requires exact agreement with the intended candidate.
The canonical decoder validates the complete result.
A small edit stores changed fields and placements, without copying unchanged subjects into the active proposal.
Only its proposal file changes.
Draft additions remain outside current module and flow files.
The existing identity authority reserves additions and removals across active proposals.

Baseline snapshots live in the existing signed archive.
Actual Git parents retain every required baseline, including a predecessor draft's baseline.
The same archive engine supports source repositories, private archives, publication, and missing-history recovery.
Proposal writes use the existing claim, complete stale token, durable journal, file installation, exact retry, and completion notification.
They introduce no second writer, recovery log, or history store.
Signing failure refuses installation before authored inputs change.

A current read exposes the active proposal catalogue and explicit selected state metadata.
A selected draft always reports lifecycle `draft`, even when its retained manifest still names an implemented state.
Its read token covers the addressed vault's exact input paths and bytes, including active proposals.
An exact checkpoint instead uses its retained inputs and token.
An exact read of a previously current state reports lifecycle `historical`.
It never changes the checkout's designation.

Non-current readings compare against current by default.
Without current, a dependent draft compares against its retained predecessor.
A planning root has no predecessor comparison.
An explicit comparison can select two coherent named states or exact checkpoints.
The existing semantic comparison rules report changes by subject identity.
Canonical metadata and collection ownership extend those rules without interpreting geometry as architecture.

A predecessor fingerprint identifies complete meaning, metadata, policy, and identity reservations independently of sibling proposal files.
If that predecessor changes, ordinary draft reads and edits return `PREDECESSOR_CHANGED`.
Exact retained proposal revisions remain readable against their own retained catalogue.
This refusal prevents an unreconciled draft from appearing settled.
Reconciliation belongs to TASK-549.07.
Adoption and shelving belong to TASK-549.08.
This delivery adds none of those lifecycle actions.

CLI and HTTP adapt the existing architecture operations.
The public package interface gains no names.
Browser selection and visible acceptance remain the parent implementation's work.
The browser must use explicit selected state metadata when it labels a draft.
