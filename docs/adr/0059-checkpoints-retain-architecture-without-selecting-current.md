---
status: accepted
---

# Checkpoints retain architecture without selecting current

A source branch can change or disappear while an architectural decision remains relevant.
A historical reading must preserve its original architecture without borrowing current modules or policy.
TASK-549.02 adds local checkpoints for canonical models.
Legacy vaults retain their existing authority until explicit migration.

A checkpoint retains exact authored inputs, state metadata, schema information, and source associations.
It contains no source checkout, unrelated working files, or machine paths.
Readers open a complete immutable checkpoint identity without changing their checkout.
They interpret its retained policy and modules through the same architecture contract as current inputs.

The independent `archboard-history` branch retains checkpoints through actual Git ancestry.
Required baselines also become actual parents.
A retention ref preserves each prepared operation before its archive append.
The same operation identity and request return the same checkpoint after interruption or a lost response.
An identity reused for another request is refused.

Storing historical snapshots inside current modules is rejected because it repeats unchanged architecture in code reviews.
Keeping only JSON hashes is rejected because those strings do not retain Git objects.
The archive and retention refs preserve accepted checkpoint identities without altering the index, HEAD, or current files.
Configured author identity and signing requirements govern checkpoint and synchronization records.
Signing failure refuses retention and provides a recovery action.

Linked worktrees share Git objects and archive refs through the common repository directory.
Each checkout retains its own current architecture.
Conditional ref updates detect competing appends.
A marked synchronization record retains both divergent parents and contains no architecture inputs.
It never represents a state, adoption, proposal predecessor, or semantic merge.
Archive order never selects current architecture.
An archive branch checked out by a worktree cannot advance through retention.

Source associations record the source repository revision and whether code was uncommitted.
Architecture retention does not retain source commits or uncommitted code.
A missing source revision leaves architecture readable with an explicit evidence recovery action.
Missing architecture or required baselines instead refuse the exact reading.
Readers never substitute current content.

This decision extends ADR 0058 for retained canonical readings.
The source-history lens in ADR 0045 remains separate from retained architecture.
Publication, private archives, proposal changes, migration, and recoverable current-file installation remain separate delivery slices.
