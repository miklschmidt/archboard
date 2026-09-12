# Archboard vocabulary cheatsheet

This file keeps the stated vocabulary only. Use `archboard help <command>` for
released syntax and options. Follow `src/cli/commands/run.ts` to a command's Zod
`ResultSchema` and inferred type for result behaviour. Use
[`cli-workflows.md`](cli-workflows.md) for tested producer-to-consumer chains.

**There are no coordinates, colours or sizes here, and there is no way to state
one.** The renderer owns every one of them, consistently across every board
(ADR 0023). What you choose is what a thing IS; the picture follows from that.

## What a node can be

`service`, `app`, `module`, `function`, `route`, `job`, `queue`, `datastore`,
`cache`, `external`, `ui`, `config`, `test`, `package`, `other`.

Pick the one that is true rather than the one that draws the shape you had in
mind. `external` is the honest answer for anything outside the system being
described, and `other` for a part the vocabulary has no word for — using it
often is a sign the board is at the wrong level.

A node may state:

- `parent` — the node that contains it, by name. Containment is ownership.
- `responsibility` — one short line saying what it is for.
- `binding` — `{ repo, path }`, the code that implements it. Portable: the
  repository identity and a repo-relative path, never an absolute one.

## How a node reaches another

`call`, `http`, `rpc`, `event`, `queue`, `data`, `dependency`, `render`,
`other`.

An edge may state a short `label` when the kind alone does not say what crosses,
and an `emphasis` of `hero` or `muted`. Emphasis is intent rather than
presentation: the renderer decides what a hero edge looks like, and an author
who marks everything a hero has marked nothing.

## How a variant is drawn

Two grammars, and the set is closed: `architecture` shows what the parts are and
how they are wired, `data-flow` shows one ordered exchange between them. A third
would be a new thing to say rather than a new way of drawing it.

A flow's messages are `sync`, `async`, `return` or `self`.

## What a variant is

`current` is the architecture that exists. `draft` is a proposal derived from
another variant. `historical` is what was current until a proposal was adopted —
kept under its own name, because that record is most of the point.

`current` is a designation that moves, so asking for `current` and asking for a
variant by name are different questions: one has an answer that changes.

## Levels

A board is at one of `system`, `service` or `module`. It is the altitude the
board is written at, and it is what tells a reader whether a part belongs on
this board or on one below it. A part that needs its own internals described is
a board of its own, linked from the node.

## Evidence

- `semantic render --board <key> --out f.svg` draws the persisted board through
  the server-owned renderer. No browser is involved.
- `semantic show <board>` is the board itself: every variant, its lineage, what
  each draft is holding, and what it says.
- The `browser` commands inspect or point panes and never write a board.
