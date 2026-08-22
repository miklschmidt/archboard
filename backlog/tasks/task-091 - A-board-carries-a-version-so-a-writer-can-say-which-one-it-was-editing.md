---
id: TASK-091
title: 'A board carries a version, so a writer can say which one it was editing'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-22 15:32'
updated_date: '2026-08-22 20:10'
labels: []
dependencies:
  - TASK-075
  - TASK-078
references:
  - src/server.ts
  - src/core/board-io.ts
  - src/core/board.ts
  - docs/adr/0006-a-board-save-refuses-to-overwrite-a-note-that-changed.md
priority: medium
type: enhancement
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the user. Not a replacement for ADR 0006's hash check — an addition that does two things the hash cannot.

**The hash says 'different'. It cannot say 'which is newer'.** Two documents that disagree are just two documents; nothing in a sha-256 orders them. So archboard can refuse a write, but it cannot tell a person or an agent whether the note is ahead of the canvas or behind it.

**And a writer cannot state a precondition.** Today a write carries no claim about what it was editing. A version lets it say 'I was working from 7, refuse this if the board has moved on' — optimistic concurrency, checked at the boundary, rather than last-write-wins between two archboard clients that both read before either wrote.

## Shape

A monotonic counter in the note's frontmatter beside `board`, `variant` and `level`, bumped by archboard on every write. `boardFingerprint` already returns `{elements, note: <sha256>}` on every agent write (TASK-075); the version belongs there, so a writer is told which version its own write produced without asking. A writer may then send that back as an expected version on the next one.

## The hash stays, and the reason is the same one that made it right in the first place

A version is a protocol, and it only binds writers who join it. Already up to date. — the external writer that actually applies here — does not, nor does Obsidian or a text editor. A version key sits in frontmatter that both Obsidian and archboard preserve verbatim, so a foreign edit leaves it **unchanged**: reading the version alone, archboard would conclude nothing had happened and overwrite. It fails open exactly where the hash fails closed. The hash is a property of the bytes rather than an agreement, which is why it catches writers who have never heard of archboard.

So: the version orders archboard's own writers, the hash catches everybody else's. That is the same split ADR 0016 already draws for locking — the mutex handles our own concurrency, the hash check catches everybody else's — applied to document state rather than to exclusion.

## The combination says more than either alone

Worth building for deliberately, because it is diagnostic rather than just defensive:

- version unchanged, bytes different -> **a writer who does not maintain the version touched this note**, which is the foreign-writer case named exactly rather than inferred
- version moved backwards -> **a revert or a Already up to date.**, which no equality check can distinguish from an ordinary edit
- version ahead of what the writer expected -> another archboard client got there first, and by how many writes

## Where it pays off soonest

Two canvases over one vault, which the mutex already supports and `check-lock` already exercises. And TASK-062, whose whole subject is a note being ahead of what a pane holds — 'which side is newer' is the question it exists to answer, and today it has no way to say.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A note carries a monotonic version that archboard bumps on every write, and it round-trips like the other frontmatter identity keys
- [ ] #2 The fingerprint returned on a write carries the version, so a writer knows what it produced without asking
- [ ] #3 A writer may state the version it expects, and the write is refused when the board has moved on, naming both versions
- [ ] #4 ADR 0006's hash check stays and still refuses a write when a writer that does not maintain the version has changed the note
- [ ] #5 A refusal says which side is ahead, and distinguishes a foreign writer (version unchanged, bytes different) from a revert (version moved backwards)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Frontmatter: a `version` key beside board/variant/level, read from the note's head, round-tripped verbatim like the rest.
2. Bump in `writeBoardContent`, on change rather than blindly: render once with the destination's frontmatter carried across, compare to the destination's bytes, and patch the version line only when the document actually moved. Two writes of an unchanged board stay byte-identical, and 'archboard never writes different bytes at the same version' is what makes the foreign-writer diagnosis sound.
3. The write returns the version it produced. `persistBoard` hands that to `agentWriteAnswer`, so `fingerprint` carries `{elements, note, version}` and stops re-rendering the note to hash it.
4. The baseline records the version alongside the hash, at every place it records the hash: a board opened, reloaded or written.
5. `foreignWriteTo` compares the baseline's version against the note's and says which way it moved — unchanged (a foreign writer), behind (a revert or a pull), ahead (another archboard client). One comparison, so the refusal and TASK-062's mark both say it.
6. A writer states an expectation: `?expectVersion=`, `--expect-version`, MCP `expectVersion`. Checked in the write-boundary middleware after the lock and before the handler, which is where it is atomic against another archboard client.
7. `board info` reports the note's version, so a writer can learn one without writing first.
8. `scripts/check-version.mjs`, wired into the chain: round-trip, bump-on-change, the stale precondition, and the three diagnoses — including a foreign write with a matching expectVersion, which the hash still refuses.
9. ADR 0006 gets a paragraph saying what TASK-091 built, so its rejected option does not read as rejecting this.
<!-- SECTION:PLAN:END -->
