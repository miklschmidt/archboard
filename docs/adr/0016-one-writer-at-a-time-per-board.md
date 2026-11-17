---
status: superseded by ADR-0068
---

# One writer at a time, per board

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) retires boards.
Subject, state and structure claims replace the per-board ownership of this
record, and a short vault lease serializes installation and recovery.
[ADR 0022](0022-the-note-decides-and-a-persons-edit-is-optimistic.md) had
already replaced part of it.

This record gave each board a mutex, so that an agent and a person never wrote
one board at once. Ordering the writes was rejected, because a merge of two
people who edit the same thing at once is a blend that neither intended. The
lock was a lease in a file beside the note, not a flag and not process memory,
so a crash cost one lease and every process saw the lock.
