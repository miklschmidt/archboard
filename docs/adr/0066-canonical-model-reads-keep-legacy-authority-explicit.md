---
status: accepted
---

# Canonical model reads keep legacy authority explicit

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) replaces the
temporary live legacy compatibility of this record. Only migration and exact
originals use legacy decoding.

Overlapping boards can give one module several definitions. One canonical model
per vault replaces that ownership. Readers need the new model without losing
legacy proposals, decisions, or history.

## Decision

Automatic conversion during a read is rejected. Independent boards require
deliberate identity and history choices before they can form one model. Legacy
boards remain authoritative until explicit migration, and a canonical read
refuses a vault that still contains them. No other canonical failure selects
legacy content.

A manifest identifies the model and its current state. Each module owns its
definition and outgoing relationships. Incoming relationships derive from those
definitions. Containment forms a forest, while dependencies can cycle.

Subject identities include their original namespace and short local identity.
Names and file locations never establish identity. Matching names, bindings,
and links supply migration evidence, but only explicit mappings combine
subjects. Removed module and relationship identities remain reserved.

The reader never returns a partial model as a coherent reading. A read token
covers the recognized paths and exact bytes of the observed inputs, and
Archboard refuses inputs that change while it reads them. Reads create no
history, timestamps, counters, or derived authority.

A batch holds every change for one intent, and the whole candidate is validated
before it is installed. A claim covers explicit modules and relationships. The
model itself is a structure scope that protects identity allocation and
retirement without claiming every module.

Neither a reference to a foreign model nor a code binding establishes
containment or transfers ownership. No navigation writes either model, and
nothing copies source code into architecture history. A local checkpoint
records exact foreign revision pins.

A walkthrough beat states its complete presentation. Omission resets a field
instead of inheriting hidden state from another beat. Narrative inputs hold no
geometry or architecture copies.

Missing history returns an unavailable reading and never substitutes current
inputs. The archive keeps a lossless byte envelope of every original input, so
incomplete conversion returns inspectable originals and diagnostics rather than
a fabricated complete model.

[ADR 0065](0065-checkpoints-retain-architecture-without-selecting-current.md)
extends this contract with immutable local checkpoints.
[ADR 0067](0067-active-proposals-store-identity-changes.md) extends it to
compact active proposals. For canonical models, this record replaces the board
ownership in ADR 0015 and ADR 0023, and the fixed board-level navigation in
ADR 0029.
