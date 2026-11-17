---
status: accepted
---

# Checkpoints retain architecture without selecting current

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) replaces the live legacy compatibility that this ADR first allowed.

A source branch can change or disappear while an architectural decision remains relevant.
A historical reading must preserve its original architecture without borrowing current modules or policy.

A checkpoint retains exact authored inputs, state metadata, schema information, and source associations.
It contains no source checkout, unrelated working files, or machine paths.
Readers open a complete immutable checkpoint identity without changing their checkout.
They interpret its retained policy and modules through the same architecture contract as current inputs.

The independent `archboard-history` branch retains checkpoints through actual Git ancestry.
Required baselines also become actual parents.
The same operation identity and request return the same checkpoint after interruption or a lost response.

Storing historical snapshots inside current modules is rejected because it repeats unchanged architecture in code reviews.
Keeping only JSON hashes is rejected because those strings do not retain Git objects.
The archive preserves accepted checkpoint identities without altering the index, HEAD, or current files.
Configured author identity and signing requirements govern checkpoint and synchronization records.

Linked worktrees share one archive, and each checkout retains its own current architecture.
A marked synchronization record retains both divergent parents and contains no architecture inputs.
It never represents a state, adoption, proposal predecessor, or semantic merge.
Archive order never selects current architecture.

Architecture retention does not retain source commits or uncommitted code.
A missing source revision leaves architecture readable with an explicit evidence recovery action.
Missing architecture or required baselines instead refuse the exact reading.
Readers never substitute current content.
The browser never creates checkpoints.

This decision extends ADR 0066 for retained canonical readings.
The source-history lens in ADR 0045 remains separate from retained architecture.

## Explicit archive publication

History reaches a configured named remote only through explicit publication.
Normal source pushes create no archive publication evidence.
Published means availability at the last successful explicit exchange.
It does not establish permanent remote retention.
Generic Git transport cannot install or inspect rewrite and deletion controls.
The remote owner must enforce those controls and maintain backups.

An explicit fetch restores referenced history without checking out archive content.
Machine-local source repository paths remain local because publication cannot redact immutable metadata.

## Canonical description installation

Preparation validates the complete candidate and creates its checkpoint under configured Git signing.
A signing refusal changes no current input.
A private journal and a temporary transaction ref exist before installation starts.
Those private records never enter authored architecture or portable checkpoints.

An interrupted journal with before or after images resumes the logged installation.
Foreign values and changed branch context block replay while preserving all bytes.
Current reads refuse a pending installation instead of assembling mixed inputs.
External writers must remain idle during installation because filesystem replacement has no atomic compare-and-replace guarantee.
Stable valid external content becomes observed current architecture without an adoption event.

## Explicit private history

The same archive engine serves vaults outside source repositories.
The owner explicitly initializes a bare repository in Archboard's machine state.
A second history implementation is rejected because it duplicates recovery and publication behavior.
A later source repository cannot silently replace private history.

## Portable model restoration

Export writes a versioned JSON envelope with exact authored inputs and a prerequisite-free Git bundle.
Import inspects untrusted history in disposable Git storage before changing destination refs or inputs.
The destination accepts empty inputs or byte-identical inputs for archive restoration.
Imported checkpoints keep their original identities and signatures.
A second persistence engine or transaction owner is rejected because the existing archive and journal already own these guarantees.

## Explicit migration installation

Migration installs only an owner-authorized complete live preview.
The existing signer retains exact original inputs and saved mapping choices before removal.
The same lease, journal and archive append install all canonical inputs.
The installed `migration.json` file holds original checkpoint references and no architecture snapshots.
