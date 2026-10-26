# Create a sequence diagram

The recipe for a board that answers "what happens, in what order, for one
request or job": a `flow` over the parts it moves between, drawn through a
`sequence` view.

A sequence is a `flow` on the board that holds its participants. Create the
parts, the relationships the messages travel and the flow in the same write. Add
a `sequence` view over the flow in that write too. If the reader needs
narration, add a walkthrough to that write as well. On a board with no
relationships, the architecture picture draws each message as a dashed step
line. So an exchange is never a row of unjoined cards. On a board with
relationships, a message shows only in the flow's sequence view. A step line
is a reading, not a relationship.

Two parts that exchange a message are joined by one `edge` of the kind the
message travels, with the same line of evidence. The relationship carries the
kind, the traffic and the emphasis, and a comparison, a view and a group
inspection read it. One relationship between two parts for each kind is
enough: a second call between the same parts is a step of the flow, never a
second relationship.

If the flow takes a different path under a condition, or repeats steps while
a condition holds, it holds a decision or a loop
([when a flow branches or repeats](#when-a-flow-branches-or-repeats)).

1. Read the code path and record each message with its evidence: who calls whom,
   from which function, in which order, and which messages come back. Each
   step carries its file and symbol as its `anchor`, as a relationship does
   ([evidence rule 3](../SKILL.md#evidence-before-a-write)).

   List the participants in reading order. The exchange is between the parts
   that the board has. A part drawn whole stays one column, whatever functions,
   methods or hooks run inside it. A call that it makes on itself is one `self`
   step. Examples are a recursive function, a component updating its own state
   and a handler re-entering itself. Another example is a method calling another
   method of a class that is one column.

   A function, method or component that the request names is a participant.
   If the named participant lives inside its caller, a call to it is still a
   message to its column. A function, method or component that the board draws
   is a candidate for a column. A flow's participants are a subset of the
   board's nodes, so you choose the columns. You do not read them off the
   board.

   If a candidate stays inside the part whose body runs it, its work is one
   step with that part at both ends. If a candidate gets its own column, the
   same call is an ordinary message between columns. Both shapes carry the
   `repeat` that the source fixes. The choice settles which kinds the exchange
   can contain. Make the choice before you list the messages. Apply it to every
   candidate alike. Say which you chose.

   Then list each message in sequence with its kind:

   - `sync`: a call that waits, an awaited promise included. This is the
     default.
   - `return`.
   - `async`: fire and forget, such as an emitted event, a message or a promise
     that nobody awaits.
   - `self`: a step whose `from` and `to` are the same node, and only such a
     step.

   If the source fixes the count of a step that runs more than once, the step
   carries `repeat`. Examples are a retry limit, a batch of a known size, and a
   literal list of candidates tried in turn. A `self` step carries `repeat` as
   readily as a call to another column. The example below tries two candidate
   documents in one `self` step with `repeat: 2`, because `removeOldBlocks` runs
   inside `Repository setup`.

   A `note` that states the count in prose does not replace the `repeat`. The
   step carries the `repeat`. If needed, add a note beside it. A loop whose
   length depends on data is a `loop` step, and a branch is a `decision` step
   ([when a flow branches or repeats](#when-a-flow-branches-or-repeats)). A
   `note` holds a caveat.

   Walk the catalogue in `SKILL.md` for the rest: `external`, and `traffic` on
   the exchange's forward path and never on its returns.

   An ordering that the reader must understand gets a walkthrough beat. The
   beat explains a step by naming it. Give that step an `as` handle in the same
   write. Put the handle in the beat's `subjects`.

   An ordering has two sides, so the beat names both. One side is the earlier
   step, by its handle. The other side is what relies on that step having
   happened: a later step, or the part that acts on
   its result. The parts that a step runs on
   come with it. Set the beat's `view` to the sequence view. Then the reader
   sees the exchange while they read the beat.

2. Create a standalone sequence in one write. For an existing board, send the
   same payload with `semantic edit` and the version you read.

   The evidence comes from archboard's own source. `executeInstallSkill`
   (`apps/cli/src/cli/operations/install-skill/install-skill.ts`) calls `setUpRepository`
   (`apps/cli/src/cli/operations/install-skill/repo-setup.ts`). To remove the block that earlier
   versions wrote, `removeOldBlocks` loops over the literal list
   `["CLAUDE.md", "AGENTS.md"]`. So that step is `repeat: 2`, and the `note`
   says that it cuts the block from each document that holds one.
   `setUpRepository` then asks `git check-ignore` whether git ignores the
   vault, and returns the result to the command.

   Each call between two parts is an `edge` as well as a step. Each message
   that a file of the checkout sends carries that file and the name it calls
   or returns from as its `anchor`. The user's command and git's answer come
   from outside the checkout, so they carry none.

```bash
archboard semantic new "Skill install" --doing "explaining how install-skill sets a repository up" <<'JSON'
{
  "level": "module",
  "nodes": [
    { "name": "User", "kind": "external", "responsibility": "Runs archboard install-skill in a repository" },
    { "name": "install-skill command", "kind": "module", "responsibility": "Installs the skill files, then sets the repository up",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/install-skill.ts" } },
    { "name": "Repository setup", "kind": "module", "responsibility": "Makes the vault and removes the block that earlier versions wrote",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/repo-setup.ts" } },
    { "name": "git", "kind": "external", "responsibility": "Answers whether a path is ignored" }
  ],
  "edges": [
    { "from": "User", "to": "install-skill command", "kind": "call", "label": "install-skill" },
    { "from": "install-skill command", "to": "Repository setup", "kind": "call", "label": "setUpRepository", "emphasis": "hero",
      "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/install-skill.ts", "symbol": "setUpRepository" } },
    { "from": "Repository setup", "to": "git", "kind": "call", "label": "check-ignore",
      "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/repo-setup.ts", "symbol": "execFileSync" } }
  ],
  "flows": [{
    "name": "Repository setup",
    "participants": ["User", "install-skill command", "Repository setup", "git"],
    "steps": [
      { "from": "User", "to": "install-skill command", "label": "install-skill" },
      { "from": "install-skill command", "to": "Repository setup", "label": "setUpRepository",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/install-skill.ts", "symbol": "setUpRepository" } },
      { "as": "remove", "from": "Repository setup", "to": "Repository setup", "label": "remove the earlier block", "kind": "self", "repeat": 2, "note": "looks in CLAUDE.md, then AGENTS.md, and cuts the block from each that holds one; every other byte of the document stays",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/repo-setup.ts", "symbol": "removeOldBlocks" } },
      { "from": "Repository setup", "to": "git", "label": "check-ignore the vault",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/repo-setup.ts", "symbol": "execFileSync" } },
      { "from": "git", "to": "Repository setup", "label": "ignored or not", "kind": "return" },
      { "as": "report", "from": "Repository setup", "to": "install-skill command", "label": "setup result", "kind": "return",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "apps/cli/src/cli/operations/install-skill/repo-setup.ts", "symbol": "setUpRepository" } }
    ]
  }],
  "views": [{ "name": "Setup exchange", "grammar": "sequence", "scope": { "kind": "selection", "flows": ["Repository setup"] } }],
  "walkthroughs": [{
    "name": "Why both documents are searched",
    "beats": [{
      "heading": "Every document, each cut alone",
      "body": "An earlier version wrote its block into whichever of CLAUDE.md and AGENTS.md existed, so a repository can hold one in either or both. The removal looks in both, and the result names every document it changed, so the person can commit exactly those.",
      "subjects": ["remove", "report"],
      "view": "Setup exchange"
    }]
  }]
}
JSON
archboard semantic rasterize "Skill install" --view "Setup exchange" --out /tmp/setup.png
```

3. Make sure that the answer's flow matches your record:

   - participants in the order you meant
   - steps in the order the source runs them
   - returns where the source returns
   - kinds and notes as the code justifies
   - a `repeat` on every step whose count the source fixes
   - a step with the same participant at both ends wherever the source has one
     calling itself

   The saved kind is `self` because the ends are equal. So the check is that
   the step exists at all. The saved beat's `subjects` carry the step's minted
   id. They also carry what relies on that step (`report` above), not only the
   part that the step runs on. A handle that nobody referenced explains nothing.

   Open the picture through the `sequence` view that you made, not the whole
   board. Make sure that the columns are in order, and that every message is
   readable and in sequence. Make sure that returns and repeats are
   distinguishable, and that nothing is cut off. Run `archboard check code`
   when the steps carry anchors: each one holds in the files on disk.

## When a flow branches or repeats

A flow's steps are not always one straight line. Read the source for each
place where the path depends on a condition:

- An `if`, a `switch`, an early return, a `catch` or a refusal that changes
  which messages follow is a **decision**. Its `question` is the condition,
  asked as a question. Each outcome is one **alternative** with its own
  `label` (`yes` and `no`, the cases of a `switch`, `refused`) and the steps
  that run on it, in order.
- Steps that run again for each item of a list, or until a condition holds,
  are a **loop**. Its `condition` says how long it runs: `for each variant
  the batch touches`, `until the server answers`. A count that the source
  fixes on one message stays that message's `repeat`.

A decision has two or more alternatives, and no two have one label. An
alternative can hold no step: that is the path that goes straight on, such as
the side of an `if` with no `else`. The alternatives rejoin: the step after
the decision follows every alternative. If an alternative ends the run (an
early return, a thrown error), put the steps that only the other path runs
inside that other alternative, and put nothing after the decision. A loop
holds at least one step. Decisions and loops nest, and every message inside
them names participants of the flow. A message's `label`, a decision's `question`, an
alternative's `label` and a loop's `condition` each hold at most 60
characters. Put the detail in the step's `note`. A walkthrough beat can be
about any step, inside a decision or a loop too, by its id or by the handle
(`as`) that the same write gives it.

The payload is the same `steps` list, with two more shapes beside a message.
This fragment of a `flows` entry has a decision on the lease, and its `free`
alternative writes each variant in a loop:

```json
"steps": [
  { "from": "CLI", "to": "Server", "label": "POST the batch" },
  { "kind": "decision", "question": "Does another agent hold the lease?",
    "alternatives": [
      { "label": "held", "steps": [
        { "from": "Server", "to": "CLI", "label": "LEASE_HELD", "kind": "return" }
      ] },
      { "label": "free", "steps": [
        { "kind": "loop", "condition": "for each variant the batch touches", "steps": [
          { "from": "Server", "to": "Board store", "label": "write the variant" },
          { "from": "Board store", "to": "Server", "label": "fsynced", "kind": "return" }
        ] },
        { "from": "Server", "to": "CLI", "label": "new version", "kind": "return" }
      ] }
    ] },
  { "from": "CLI", "to": "Agent", "label": "answer", "kind": "return" }
]
```

A decision and a loop take `id`, `as` and `note` as a message does, and
nothing else. Every step, a decision and a loop included, gets a minted id.
Restate a decision or a loop with its `id` to keep it, as you would a message.
A write is refused when a decision has fewer than two alternatives, two
alternatives with one label, or no step in any alternative, and when a loop
holds no step.

The flow's `sequence` view draws a decision as an `alt` frame and a loop as a
`loop` frame. When the logic is the question ([which
view](../SKILL.md#which-view)), add a `flowchart` view over the same flow in
the same write:

```json
"views": [
  { "name": "One edit", "grammar": "sequence", "scope": { "kind": "selection", "flows": ["One edit"] } },
  { "name": "One edit: logic", "grammar": "flowchart", "scope": { "kind": "selection", "flows": ["One edit"] } }
]
```

Make sure that each decision's question and labels say what the source tests,
that each alternative holds the messages that run on it, and that each loop's
condition says what ends it. Draw the flowchart view and look at it: every line
out of a diamond carries its label, and every alternative rejoins at the step
after the decision.

Read [sequences, views and
walkthroughs](sequences-views-walkthroughs.md) for view scopes
(isolating one relationship, a region, the whole board), beat subjects and
identity, and single-participant flows.
