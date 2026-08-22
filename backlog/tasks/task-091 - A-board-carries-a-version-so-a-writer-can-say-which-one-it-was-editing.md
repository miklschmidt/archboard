---
id: TASK-091
title: 'A board carries a version, so a writer can say which one it was editing'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-22 15:32'
updated_date: '2026-08-22 20:51'
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
1. Frontmatter: a `version` key beside board/variant/level, read from the note's head, round-tripped verbatim like the rest. [done]
2. Bump in `writeBoardContent`, on change rather than blindly, so two saves of an unchanged board stay byte-identical and 'archboard never writes different bytes at the same version' holds. [done]
3. The write returns the version it produced; `fingerprint` carries it and stops re-rendering the note to hash it. [done]
4. The baseline records the version alongside the hash, everywhere it records the hash. [done]
5. `foreignWriteTo` says which way the note's version moved — unchanged, behind, ahead — once, so the refusal and TASK-062's mark both say it. [done]
6. REVISED after the user's correction. The precondition is not an optional flag an agent must remember. The canvas fills it from what it last told this writer, the way TASK-080 keeps a claim against the board so an agent carries nothing:
   a. A person is exempt. Their gesture already took the mutex at its leading edge and their report is a delta on a fresh read, so a version refusal could only take a wall display away from the person standing at it, which ADR 0016 forbids. TASK-095 draws the same line.
   b. A claim is an identity the canvas keeps, so it keeps the version that claim's holder was last told. Seeded when the claim is made, moved on every write under it, and moved by a refusal too — the refusal is itself a telling, so an agent is refused once and not wedged.
   c. An MCP server is one process serving one agent session, so `canvas-client` remembers what it was last told per board and attaches it. The agent carries nothing there either.
   d. `--expect-version` stays as the explicit override and wins over both.
   e. The gap, stated rather than papered over: a fresh CLI process per command is anonymous, and every surrogate identity collapses to one that always matches, which is worse than none. An unclaimed CLI agent is the one writer the canvas cannot remember, and claiming is how it buys the check.
7. `board info` and the claim's answer report the version, so a writer can learn one without writing. [done]
8. `scripts/check-version.mjs`, wired into the chain: round-trip, bump-on-change, the three diagnoses, the automatic check under a claim with no flag, the client-side fill, the override, a person never refused, and the hash still deciding.
9. ADR 0006, CONTEXT.md, CLAUDE.md and the skill say what was built and who supplies the number.
<!-- SECTION:PLAN:END -->
