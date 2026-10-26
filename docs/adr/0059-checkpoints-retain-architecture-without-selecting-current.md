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

The browser selects Current or one complete checkpoint identity as presentation state.
Each selection reads that scope again through the shared contract.
Separate cache keys prevent a current result from supplying a historical reading.
The retained identity and source-evidence availability remain visible beside its architecture.
The browser never creates checkpoints.

This decision extends ADR 0060 for retained canonical readings.
The source-history lens in ADR 0045 remains separate from retained architecture.
Private archives, proposal changes, migration, and recoverable current-file installation remain separate delivery slices.

## Explicit archive publication

TASK-549.16 adds a configured named remote and independent archive ref.
Normal source pushes create no archive publication evidence.
A private sidecar beside common Git objects records the destination and pending intent per portable vault address.
Immutable receipt refs retain the exact closures acknowledged by explicit exchanges.
Linked worktrees share this evidence while their current architecture remains independent.
The current-edit journal remains checkout-specific and separate from publication state.

Local status distinguishes saved-locally, publication-pending, published, and unavailable.
Published means availability at the last successful explicit exchange.
It does not establish permanent remote retention.
The result reports the host-policy limitation because generic Git transport cannot install or inspect rewrite and deletion controls.
The remote owner must enforce those controls and maintain backups.
Changing an effective remote URL requires explicit configuration again and invalidates the former destination's evidence.
Publication metadata failures do not block coherent local retention or exact architecture reads.

A stale non-forced push fetches complete named archive history.
The runtime joins divergent tips through the existing signed synchronization record and retries an ordinary push.
The record retains both parents without merging architectural meaning or rewriting accepted checkpoint identities.
Signing failure preserves local checkpoints and the remote's accepted tip.
Network failure preserves durable pending intent and never reverses local work.

An explicit fetch restores referenced history without checking out archive content.
It retains the fetched closure under a named private ref and makes those checkpoints discoverable.
A shallow archive boundary triggers a deeper fetch of the configured archive ref.
The runtime refuses incomplete or foreign archive ancestry and keeps current files, the index, source HEAD, and source fetch mappings unchanged.
Machine-local source repository paths remain local because publication cannot redact immutable metadata.
The browser's publication controls and visible recovery workflow remain parent-owned until their delivery evidence is complete.
