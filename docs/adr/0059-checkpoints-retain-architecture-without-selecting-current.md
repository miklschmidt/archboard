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
Publication, private archives, proposal changes, and migration remain separate delivery slices.

## Canonical description installation

TASK-549.03 adds one claimed description edit through the shared runtime.
The operation names the model, current state, complete read token, subject, writer, doing line, claim, and operation identity.
The complete token covers discovered paths, exact bytes, and policy.
Only the affected module file changes.

The runtime uses one short cross-process installation lease per vault.
Standing subject claims remain separate from that lease.
A reader can take a claim back, which refuses its former writer's next intent.
Reserved installation locks produce no legacy board activity.

Preparation validates the complete candidate and creates its checkpoint under configured Git signing.
A signing refusal changes no current input.
A private journal records the checkout, branch, HEAD, exact images, fingerprints, checkpoint, and progress.
The journal and a temporary transaction ref exist before installation starts.
Git worktrees keep their journals and claims in their separate administrative directories.
Those private records never enter authored architecture or portable checkpoints.

Each file replacement uses the existing durable atomic writer.
The runtime rechecks the complete input set and checkout context before each file operation.
It then proves the final fingerprints and records installed progress.
Archive synchronization signing also precedes installation.
A conditional append retains the prepared checkpoint or synchronization in archive ancestry.
If another writer advances the archive afterward, recovery prepares a new join before any further file operations.
A completed-operation ref retains the signed request and its deterministic result.
The runtime records completion before cleanup and news.
The same request returns that result without requiring a current read or installation lease.
Another request with the same operation identity is refused.
Operation identities belong to the addressed checkout and vault.

An interrupted journal with before or after images resumes the logged installation.
Foreign values and changed branch context block replay while preserving all bytes.
The caller receives recovery instructions and restores a logged image or original branch before retrying.
The refusal identifies the operation, retained checkpoint, progress, fingerprints, and original branch and HEAD.
It exposes no private directory or logged input bytes.
An edit refusal states `applied: false` before installation or `applied: "unknown"` when application remains uncertain.
The caller resolves an uncertain result through recovery or the original request.
A completed installation stays applied when cleanup fails.
Its current architecture remains readable, and a retry finishes cleanup without another checkpoint.

Current reads refuse a pending installation instead of assembling mixed inputs.
The synchronous reader leaves replay to the explicit recovery operation.
Exact checkpoint reads remain independent of current installation and current files.
External writers must remain idle during installation because filesystem replacement has no atomic compare-and-replace guarantee.
Stable valid external content becomes observed current architecture without an adoption event.
Invalid or changing content refuses a coherent read and blocks new edits.

A vault-scoped event stream starts each connection with a fresh reading and claim list.
Later events identify durable completion, stable external content, claim changes, or an unavailable current reading.
The browser owns the stale-scene indication and take-back control.
Its visible acceptance evidence remains part of the mixed delivery ticket.
