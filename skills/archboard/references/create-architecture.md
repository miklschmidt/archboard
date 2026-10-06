# Create an architecture diagram from code

The recipe for a board that answers "what are the parts and how are they
wired": read the source, do the evidence steps in `SKILL.md`, walk its
catalogue, write one payload, look at the picture.

A board nobody can follow whole (a dozen or more parts, routes crossing the
page) is written with board `views` from the start, one per reading a user
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
side-by-side downward columns when the completed picture fits the pane better and reads no worse,
keeping containers and small branches together. The renderer chooses the column
count; authors do not encode layout in the board.
Relationships may share card ports when their kind, comparison standing and
direction at that card agree; differences use separate ports so their meaning
remains distinguishable. Overlapping card spans can
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
   A board for an architecture nobody has built follows the same steps with
   the request's stated intent in place of source, and its payload adds
   `"lifecycle": "draft"`, so the board says nothing on it is built
   ([planning](../SKILL.md#planning-what-nobody-has-built)).
2. If parts will be bound to code, register the checkout once:
   `archboard repo add /path/to/checkout` prints the repository identity
   (`github.com/miklschmidt/archboard`); bindings use that identity and a
   repo-relative path.
3. State the architecture in one payload and create the board. The evidence
   behind this one comes from archboard's own source. The Archboard server's
   `editRoute` (`src/server/archboard/lib/semantic-board-writes.ts`) imports
   two functions from `src/runtime/semantic-board-store/index.ts`, the board
   store's interface. It builds the edit with `editVariantTransition`
   (`lib/transitions.ts`) and hands it to `writeSemanticBoard`
   (`lib/write.ts`). So the store is a container, bound to its directory, and
   those two are its entry points. Behind them, inside the store,
   `writeSemanticBoard` calls `underBoardLease`, which takes the board's lease
   through `withBoardLock` (`src/runtime/engine/lib/board-lock-acquisition.ts`).
   It also passes `underBoardLease` a callback that calls `applyUnderLease`.
   `applyUnderLease` applies the edit through `transition.apply`, then calls
   `persisted`. No file outside the store calls those three, so they are its
   hidden parts. Each function's two calls come from its own body, so they are
   siblings, not a chain. The agent running the command is the inbound caller
   and lives outside the checkout, so it stays unbound.

```bash
archboard semantic new "Semantic board writes" --doing "describing how one board edit reaches disk" <<'JSON'
{
  "level": "service",
  "nodes": [
    { "name": "Agent", "kind": "external", "responsibility": "Runs archboard semantic edit" },
    { "name": "Edit route", "kind": "function", "responsibility": "Accepts one edit and hands it to the store",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/server/archboard/lib/semantic-board-writes.ts" } },
    { "name": "Board store", "kind": "module", "responsibility": "The one place a board is read or written",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store" } },
    { "name": "editVariantTransition", "kind": "function", "parent": "Board store",
      "responsibility": "Builds the change one edit makes to a board",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store/lib/transitions.ts" } },
    { "name": "writeSemanticBoard", "kind": "function", "parent": "Board store",
      "responsibility": "Runs one write under the board's lease",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/runtime/semantic-board-store/lib/write.ts" } },
    { "name": "underBoardLease", "kind": "function", "parent": "Board store",
      "responsibility": "Admits the writer and holds the lease around one pass",
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
    { "from": "Edit route", "to": "editVariantTransition", "kind": "call", "label": "builds the edit" },
    { "from": "Edit route", "to": "writeSemanticBoard", "kind": "call", "label": "edit transition" },
    { "from": "writeSemanticBoard", "to": "underBoardLease", "kind": "call" },
    { "from": "writeSemanticBoard", "to": "applyUnderLease", "kind": "call", "label": "as the leased pass" },
    { "from": "underBoardLease", "to": "Board lease", "kind": "call", "label": "withBoardLock" },
    { "from": "applyUnderLease", "to": "editVariantTransition", "kind": "call", "label": "transition.apply" },
    { "from": "applyUnderLease", "to": "persisted", "kind": "call" }
  ]
}
JSON
archboard semantic inspect "Semantic board writes" --container "Board store"
archboard semantic rasterize "Semantic board writes" --out /tmp/writes.png
```

`Edit route` lands on the two functions that the store's `index.ts` exports,
and not on `applyUnderLease` or `persisted`, although their bodies do the write
([evidence rule 3](../SKILL.md#evidence-before-a-write)). The inspection reads
that back: `editVariantTransition` and `writeSemanticBoard` are the entry
points, the other three are hidden parts, `Edit route` is the one caller and
the call to `Board lease` is the one outgoing relationship. `Board lease`
receives `withBoardLock` itself because this board draws it whole, with no
children. Draw its functions inside it, and the call lands on `withBoardLock`,
its entry point.

4. Check the answer against your record: every part you meant is there with a
   configured `kind`; every relationship's `from`, `to` and `kind` match its
   line of evidence, and none exists without one; a call from outside a
   container ends on an entry point that its caller names; bound parts name the
   identity from step 2 and the owning file. Open the picture and read it as
   the audience will: labels legible, nothing cut off, each arrow ending on the
   part its evidence names, and the reported `width` and `height` small enough
   to take in at once. A page thousands of pixels on both axes is the tangle
   this recipe opens with, and a second edit adding its views is the normal
   loop, not a repair. A request path the board carries is a `flow` drawn
   through a `data-flow` view, not a row to declare inapplicable.

Read [authoring](references/authoring.md) for groups, drill-down links to
detail boards, traffic, emphasis, descriptions, and what a refusal means.
