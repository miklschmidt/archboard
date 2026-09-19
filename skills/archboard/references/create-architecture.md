# Create an architecture diagram from code

The recipe for a board that answers "what are the parts and how are they
wired": read the source, do the evidence steps in `SKILL.md`, walk its
catalogue, write one payload, look at the picture.

A board nobody can follow whole (a dozen or more parts, routes crossing the
page) is written with board `views` from the start, one per reading a person
will want: one path, one container's internals, the parts one concern
touches. Scope each to the reading, not to a group you already have, and keep
what it selects joined: a part whose only relationship points at a part the
view leaves out stands in it unattached. A view is the answer to a tangle,
never a smaller or falser board.

Containment says what belongs inside what, not which row it occupies. The
renderer may place an outside caller or dependency beside the particular child
it connects to. Keep real parents and relationships intact when judging a
picture; changing them to force placement changes the architecture. Stable
subject identities also guide sibling ordering between variants; positions and rows
are still chosen fresh in a top-to-bottom reading. Long paths may wrap into
side-by-side downward columns when the completed picture fits the pane better,
keeping containers and small branches together. The renderer chooses the column
count; authors do not encode layout in the board.
Relationships of one kind may share card ports; different kinds use separate
ports so their meaning remains distinguishable. Overlapping card spans can
use straight connections with balanced attachment offsets, allowing small shifts
to keep neighboring labels clear. Labels should follow those connections instead
of forcing sideways detours. Bends retain their configured radius and arrows retain
a straight approach; routing reserves the required space instead of shrinking them.
Keep the real relationship kind when judging routing.

1. Read the source you will describe, do the evidence steps in `SKILL.md` and
   walk its catalogue. Decide the board's level from `config.yaml` (`system`:
   collaborating services; `service`: the modules of one; `module`: the
   functions inside one) and its subject: a short name such as
   `Semantic board writes`, never a path. Two rows need a read before the
   payload: the configured `groups`, so each part lists the concerns it serves,
   and `archboard semantic`, so a part whose internals already have a board
   links to it with `drillDown`.
2. If parts will be bound to code, register the checkout once:
   `archboard repo add /path/to/checkout` prints the repository identity
   (`github.com/miklschmidt/archboard`); bindings use that identity and a
   repo-relative path.
3. State the architecture in one payload and create the board. The evidence
   behind this one, from archboard's own source: the canvas server's `editRoute`
   (`src/server/canvas/lib/semantic-board-writes.ts`) calls
   `writeSemanticBoard` (`src/runtime/semantic-board-store/lib/write.ts`), which
   takes the board's lease through `withBoardLock`
   (`src/runtime/engine/lib/board-lock-acquisition.ts`) and runs
   `applyUnderLease` inside it; `applyUnderLease` reads the board, applies the
   edit transition, then calls `persisted`, one after another from its own
   body, so those are siblings, not a chain. The agent running the command is
   the inbound caller and lives outside the checkout, so it stays unbound.

```bash
archboard semantic new "Semantic board writes" --doing "describing how one board edit reaches disk" <<'JSON'
{
  "level": "service",
  "nodes": [
    { "name": "Agent", "kind": "external", "responsibility": "Runs archboard semantic edit" },
    { "name": "Edit route", "kind": "function", "responsibility": "Accepts one edit and hands it to the store",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/server/canvas/lib/semantic-board-writes.ts" } },
    { "name": "Board store", "kind": "module", "responsibility": "The one place a board is read or written",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store/lib/write.ts" } },
    { "name": "writeSemanticBoard", "kind": "function", "parent": "Board store",
      "responsibility": "Runs one write under the board's lease",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store/lib/write.ts" } },
    { "name": "applyUnderLease", "kind": "function", "parent": "Board store",
      "responsibility": "Reads, applies, validates and persists one command",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store/lib/write.ts" } },
    { "name": "persisted", "kind": "function", "parent": "Board store",
      "responsibility": "Writes the board atomically and answers with its warnings",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store/lib/write.ts" } },
    { "name": "Board lease", "kind": "module", "responsibility": "One writer at a time per board",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/engine/lib/board-lock-acquisition.ts" } }
  ],
  "edges": [
    { "from": "Agent", "to": "Edit route", "kind": "http", "label": "POST /api/semantic-boards/edit" },
    { "from": "Edit route", "to": "writeSemanticBoard", "kind": "call", "label": "edit transition" },
    { "from": "writeSemanticBoard", "to": "Board lease", "kind": "call", "label": "withBoardLock" },
    { "from": "writeSemanticBoard", "to": "applyUnderLease", "kind": "call" },
    { "from": "applyUnderLease", "to": "persisted", "kind": "call" }
  ]
}
JSON
archboard semantic rasterize "Semantic board writes" --out /tmp/writes.png
```

Each relationship lands on the part that receives the call ([evidence rule
3](../SKILL.md#evidence-before-a-write)): `Board lease` receives `withBoardLock`
here because it has no children; the moment you draw its functions inside it,
the call lands on `withBoardLock`.

4. Check the answer against your record: every part you meant is there with a
   configured `kind`; every relationship's `from`, `to` and `kind` match its
   line of evidence, and none exists without one; bound parts name the
   identity from step 2 and the owning file. Open the picture and read it as
   the audience will: labels legible, nothing cut off, each arrow ending on the
   part its evidence names, and the reported `width` and `height` small enough
   to take in at once. A page thousands of pixels on both axes is the tangle
   this recipe opens with, and a second edit adding its views is the normal
   loop, not a repair. A request path the board carries is a `flow` drawn
   through a `data-flow` view, not a row to declare inapplicable.

Read [authoring](references/authoring.md) for groups, drill-down links to
detail boards, traffic, emphasis, descriptions, and what a refusal means.
