---
id: TASK-091
title: 'A board carries a version, so a writer can say which one it was editing'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-22 15:32'
updated_date: '2026-08-22 21:16'
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
- [x] #1 A note carries a monotonic version that archboard bumps on every write, and it round-trips like the other frontmatter identity keys
- [x] #2 The fingerprint returned on a write carries the version, so a writer knows what it produced without asking
- [x] #3 A writer may state the version it expects, and the write is refused when the board has moved on, naming both versions
- [x] #4 ADR 0006's hash check stays and still refuses a write when a writer that does not maintain the version has changed the note
- [x] #5 A refusal says which side is ahead, and distinguishes a foreign writer (version unchanged, bytes different) from a revert (version moved backwards)
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC 3 as written says a writer *may* state the version. The user's correction while this was in flight supersedes that toward the stronger thing: it is checked automatically wherever the writer is identifiable, and stating it is the override. Both are met — `scripts/check-version.mjs` proves the stated form and the two automatic ones — so the criterion is checked, with the note that what shipped is more than it asked for.

## Where the version lives

`version` in the note's frontmatter, beside `board`, `variant` and `level` (`FRONTMATTER_VERSION`, src/core/board.ts). Round-trips like the other three, because the frontmatter block is carried across a save verbatim and only the keys archboard owns are touched.

**Bumped on change, not on every write.** `stampVersion` in src/core/board-io.ts renders the note, compares it to the destination's bytes, and moves the count only when the two differ. Two saves of an unchanged board stay byte-identical, and the diagnosis below rests on the same fact from the other side: 'the version stood still and the bytes moved' names a foreign writer only while archboard never writes different bytes without moving it.

A `version` key holding something that is not a count is left alone, key and value. That is somebody's own property in their own frontmatter; such a board is unversioned and the hash guards it exactly as before.

## Who supplies the number

The precondition is not a flag an agent must remember — that was the first cut and the user rejected it, rightly: an invariant enforced by a document is the pattern this repo keeps removing. The canvas fills it in from what it last told the writer, checked in the write-boundary middleware under the lock and before the handler.

| Writer | Checked | Record |
|---|---|---|
| person at a pane | never | — |
| agent holding a claim | every write | the claim (`claimSeen`/`claimSaw`, board-lock.ts) |
| MCP client | every write in the session | `versionsSeen` in canvas-client.ts |
| unclaimed CLI agent | only what it states | nowhere |

**The gap is real and is not papered over.** A fresh CLI process per command is anonymous: its writer id is minted for the request, so the canvas cannot tell its second command from another agent's first. Every stand-in — the board, the kind of writer, the machine — silently collapses to one that always matches, and a check that cannot fail is worse than none. So that writer states `--expect-version`, or claims the board. The writers the canvas can remember turn out to be exactly the writers the lock can identify.

**Never filled from the note's own current version**, which is the trap: it always matches, so it would refuse nothing while looking like a check.

**Told once.** The refusal names the version the board is at, which is itself a telling, so the writer's next write goes against that rather than being wedged for ever on one stale read. Same shape as CLAIM_REVOKED.

## What it cost

An agent's write after somebody else's is refused once and told to read the board back. Two existing checks tripped on exactly that and both were adjusted rather than the rule weakened: check-mcp-stdio's two clients now hear about the human's drag before ungrouping, and check-one-write's raw-api hand tells the client it wrote.

## Revert-proof

Each mechanism broken on purpose, and what noticed. `bun run test` is 24 steps and green; every step reached its report line.

| Reverted | test:version | elsewhere |
|---|---|---|
| the version is never stamped | 30 of 43 | none |
| bump on every write, not on change | 8 of 43, byte-identical among them | none |
| the fingerprint re-renders instead of using the write's answer | 5 of 43 — the **hash** was wrong too, which is the silent lie this threading exists to stop | none |
| no precondition at the write boundary | 6 of 43 | none |
| foreignWriteTo says only that the bytes differ | 9 of 43 | none |
| the canvas fills nothing in for a claim | 4 of 57 | mcp still green: a different identity |
| the client remembers nothing | 2 of 57 | test:mcp fails: the two are separate mechanisms and each is load-bearing |

## Verification

`bun run test` green, 24 of 24, zero FAIL lines, exit 0. `scripts/check-version.mjs` is 57 checks and covers: the frontmatter round-trip, bump-on-change with byte-identical saves, a human's `version` key untouched, the three diagnoses through `foreignWriteTo`, TASK-062's mark saying which side is ahead, the fingerprint carrying the version and its hash matching the bytes on disk, the automatic check under a claim with the caller saying nothing, the client-side fill across three calls, the explicit override, a person never refused, and last a foreign edit with a matching expectation still refused by the hash.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A board note carries a `version` in its frontmatter beside `board`, `variant` and `level`: a count archboard moves whenever it writes a note that differs from the one that was there. ADR 0006's hash is untouched and still decides whether a write happens; this adds the two things a sha-256 structurally cannot.

It orders. `foreignWriteTo` compares what archboard last wrote against what the note carries now and names which of three things happened: the count stood still while the bytes moved, so a writer that does not keep it was here; it moved backwards, so the note was reverted or an older copy restored; it moved forwards, so another archboard wrote it, and by how many. One comparison, so the refusal and TASK-062's board-bar mark improved together — the mark now reads `note is 2 writes ahead` or `note was rolled back` where it could only ever say `note changed on disk`.

And it is a precondition, checked automatically rather than being a flag an agent must remember. A write goes against the version its writer was last told, in the write-boundary middleware under the lock. The canvas keeps that record against a claim, the way TASK-080 keeps a claim against a board so an agent carries nothing; an MCP server keeps it for its own session. A person is never checked, because refusing their gesture would stop a wall display responding to the person standing at it. An unclaimed CLI process is anonymous by construction and is the one writer nothing can honestly check — stated plainly rather than papered over with a surrogate identity that would always match.

Verified by `scripts/check-version.mjs` (57 checks, new, wired into the chain as test:version) and by `bun run test`: 24 of 24 steps, zero failures. Each mechanism was reverted in turn and the failures counted — 30, 8, 5, 6, 9, 4 and 2 checks respectively — including the case where re-rendering the fingerprint outside the write reported a hash the vault did not hold.
<!-- SECTION:FINAL_SUMMARY:END -->
