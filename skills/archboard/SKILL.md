---
name: archboard
description: >-
  Architecture boards an agent authors as meaning and a renderer draws. Use when
  an agent needs to state what a system IS, propose a change as a variant beside
  what is current, read back what somebody is looking at, bind a part of the
  architecture to the code that implements it, or render a diagram. The bundled
  archboard CLI is the agent interface.
---

# archboard

Archboard is for comparing architectures. The architecture that exists is one
variant of a board. A proposal is another, derived from it. Both live in the
same document, so what a proposal changed is derived rather than written down
twice — and the two can be read side by side.

**You state what the architecture IS. The renderer owns how it looks.** Every
coordinate, colour, font size and connector route is the renderer's (ADR 0023).
There is no way to move a box and deliberately none: a layout somebody repaired
by hand cannot be improved for every board at once.

Four rules decide whether a board stays usable:

1. Name the board on every call. There is no active-board fallback.
2. Give every write a short present-tense `--doing` line saying what changes in
   the architecture. It goes up on the screen of whoever is reading the board.
3. State the version you read with `--expect-version`. An edit that does not is
   an edit applied to whatever the board says now, which is how one agent's
   change disappears under another's.
4. Propose by branching. A redraw has no shared identity to compare against.

## Command authority

Use `archboard help <command>` for released syntax and options. Inside the
Archboard checkout, use `./bin/canvas` in place of `archboard`.

For result shapes, follow `src/cli/commands/run.ts` to the command's
`ResultSchema` and inferred type. Those Zod contracts are the source of truth.
For tested producer-to-consumer chains, read
[`references/cli-workflows.md`](references/cli-workflows.md). Do not reconstruct
either contract from this skill.

Read [`references/semantic-boards.md`](references/semantic-boards.md) before any
board work: it is the authority for the write contract, the reconciliation
envelope, resolution, adoption, derived differences, and how a person's
selection grounds a request.

## The main path

A configured vault and the Archboard server are enough for all of this. No
browser is involved anywhere in it.

```bash
board=payments
archboard semantic                      # what boards the vault holds

archboard semantic new "$board" --doing "drawing the payment path" <<'JSON'
{ "nodes": [
    { "name": "API Gateway", "kind": "service", "responsibility": "Takes the traffic" },
    { "name": "Orders", "kind": "service", "parent": "API Gateway",
      "binding": { "repo": "github.com/acme/payments-api", "path": "src/orders.ts" } },
    { "name": "Orders Postgres", "kind": "datastore" } ],
  "edges": [
    { "from": "API Gateway", "to": "Orders", "kind": "http" },
    { "from": "Orders", "to": "Orders Postgres", "kind": "data", "label": "rows" } ] }
JSON

archboard semantic show "$board"        # every variant, its lineage, its content
archboard semantic edit "$board" --expect-version 1 --doing "adding the queue" <<'JSON'
{ "nodes": [ { "name": "Orders Queue", "kind": "queue" } ],
  "edges": [ { "from": "API Gateway", "to": "Orders Queue", "kind": "event" } ] }
JSON

archboard semantic branch "$board" --as "Queued ingest" --expect-version 2 \
  --doing "proposing a queue"
archboard semantic render "$board" --out payments.svg
```

A board is one `.semantic.json` document in the vault. Every write is validated,
version-checked, committed and only then answered, so there is nothing held back
in memory and nothing to save.

## What a board says

- **Nodes** are the parts: a name, a `kind` from the vocabulary, what it is
  responsible for, optionally what contains it, and optionally the code it is
  implemented by.
- **Edges** are how they reach each other: `from`, `to`, a `kind`, and a short
  label when the kind alone does not say it.
- **Flows** are sequences through them, which is what a message-sequence view
  draws.
- **Views** are named readings of one variant — a scope, and the grammar to draw
  it in. Naming relationships in a scope shows exactly what is named.
- **Walkthroughs** explain a variant in beats, for a reader scrolling through it.

Choose visual form by meaning rather than putting every fact in a rectangle. The
`kind` is what earns a part its shape and colour; the renderer is consistent
about it across every board, which is the whole reason it owns the decision.

## Proposals

A variant is a modification of its source, not a fresh statement of the same
subject. Branch first, then change only what the proposal changes: subject
identity is what makes a comparison possible, and a redrawn board shares none.

Editing a variant carries the edit into every draft derived from it, in the same
write. A draft that cannot take the change cleanly says what it is holding, and
a draft below an unsettled one waits rather than guessing which side to build
on. Read `semantic show` for what each one did.

`current` is a designation that moves. Adopting a proposal makes it current and
leaves the architecture that was implemented until then as a historical variant
under its own name — which is the record, and the point of keeping it.

## One writer at a time

An ordinary write holds the board only while it writes. Claim before a known
substantial multi-write campaign whose half-finished state would mislead
somebody reading it. Do not claim for one node, one label, or a read. Release as
soon as the writes end.

The claim reason names the campaign; each `--doing` line names the current step.
Every pane showing the board says who has it, why and since when, and keeps
drawing — reading is never what a claim stops. A person can end your claim with
one control. If that happens you are told once, on your next write, and nothing
you wrote was undone: say what is complete and what is not.

A version refusal means another writer changed the board first. Read it again
and write your change against what it says now.

## When somebody is reading a board

The browser is a viewer. Use the `archboard browser` branch only when a person
is currently reading a board, or when the evidence asked for is about what they
are looking at.

```bash
archboard browser panes --text
archboard browser open
archboard browser show payments@"Queued ingest" --pane right
```

These name a pane and write nothing. `show` puts a proposal beside what it
proposes to change, which is the comparison this tool exists for. A third pane
is refused. Inspect the inventory before using words like "left" or "this one".

What somebody has picked out on screen reaches you as part of your context: the
ids are the same ids an edit command takes, so "what does this do?" is a
question you can answer and "change this" is one you can act on.

## Files

The board is the deliverable and the picture is derived. Render an SVG when
somebody reads the repository without archboard, and keep the board either way.
A vault may also hold `.excalidraw.md` notes from before ADR 0023: nothing here
reads, writes or migrates them, and they are left exactly as they are.

## References

- [`references/architecture-workflow.md`](references/architecture-workflow.md)
  covers levels, drill-down, and reading back what somebody is looking at.
- [`references/semantic-boards.md`](references/semantic-boards.md) is the agent
  contract for boards: writes and versions, the reconciliation envelope, resolve
  and adopt, derived differences, and selection-grounded requests.
- [`references/cli-workflows.md`](references/cli-workflows.md) contains tested
  CLI value chains without copying result schemas.
- [`references/cheatsheet.md`](references/cheatsheet.md) keeps the stable
  vocabulary and points back to the live command and result authorities.
