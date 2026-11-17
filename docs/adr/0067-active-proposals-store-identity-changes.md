---
status: accepted
---

# Active proposals store identity changes

A small proposal must not repeat unchanged modules and flows in a code review.
So each active canonical proposal is stored in one `.proposal.json` file as
changes against an immutable baseline.
This decision replaces complete draft snapshots for canonical models in ADR 0023.
It extends the canonical reader in ADR 0066 and the retained archive in ADR 0065.
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) retires live legacy authoring.

A planning model can have no current state.
A new planning root retains an empty coherent baseline and introduces its subjects through additions.
A child names its predecessor by stable state identity.
Sibling proposals share no mutable copy of their predecessor.

A proposal compares against its independent or explicitly pinned predecessor, even when Current exists, because it can describe only a fragment of Current.
A proposal that follows Current otherwise compares against Current.

Each change addresses a stable subject identity.
Omitted fields preserve their values, and null never means deletion.
No change addresses a text line or an array index.
Walkthroughs and their beats use the same compact changes.

The runtime applies the existing module and flow batch to one complete candidate.
It derives compact changes against the original baseline.
Before signing, it materializes those changes and requires exact agreement with the intended candidate.
Draft additions remain outside current module and flow files.

Baseline snapshots live in the existing signed archive.
Proposal writes use the existing claimed, journaled writer.
They introduce no second writer, recovery log, or history store.

If a predecessor changes, ordinary draft reads and edits return `PREDECESSOR_CHANGED`.
This refusal prevents an unreconciled draft from appearing settled.
Comparison differences never establish whether a proposal needs settlement.
Reconciliation visits parents before children, and an unsettled parent blocks its descendants.
A conflict retains the original proposal baseline.
Settlement supplies one explicit choice for every standing issue in the same intent.
CLI and HTTP interpret neither conflicts nor recovery progress.

Adoption installs the proposal's complete materialized architecture.
It never applies a compact patch blindly to another baseline.
Completed history never enters current model files or active proposal files.
Archive append order supplies no architecture ancestry or current designation.

A factual correction to a completed state goes through the same writer.
It stores normalized identity changes and an explicit link to the prior checkpoint.
An exact checkpoint keeps its original record, and concurrent correction tips remain ambiguous.
Current authored files gain no correction ledger or copied history.
The browser submits no correction writes.
