# Create a sequence diagram

The recipe for a board that answers "what happens, in what order, for one
request or job": a `flow` over the parts it moves between, drawn through a
`data-flow` view.

A sequence is a `flow` on the board that holds its participants. Create the
parts, the relationships the messages travel and the flow in the same write. Add
a `data-flow` view over the flow in that write too. If the reader needs
narration, add a walkthrough to that write as well. On a board with no
relationships, the architecture picture draws each message as a dashed step
line. So an exchange is never a row of unjoined cards. On a board with
relationships, a message shows only in the flow's data-flow view. A step line
is a reading, not a relationship.

Every call the exchange makes is also an `edge` with the same line of evidence.
The reason is that the relationship carries the kind, the traffic and the
emphasis. A comparison, a view and a group inspection also read the
relationship.

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
   documents in one `self` step with `repeat: 2`, because `chooseDoc` runs
   inside `Setup block`.

   A `note` that states the count in prose does not replace the `repeat`. The
   step carries the `repeat`. If needed, add a note beside it. A loop whose
   length depends on data is one step with a `note` that says so. A `note` also
   holds a branch or a caveat.

   Walk the catalogue in `SKILL.md` for the rest: `external`, and `traffic` on
   the exchange's forward path and never on its returns.

   An ordering that the reader must understand gets a walkthrough beat. The
   beat explains a step by naming it. Give that step an `as` handle in the same
   write. Put the handle in the beat's `subjects`.

   An ordering has two sides, so the beat names both. One side is the earlier
   step, by its handle. The other side is what relies on that step having
   happened: a later step, or the part that acts on
   its result. The parts that a step runs on
   come with it. Set the beat's `view` to the data-flow view. Then the reader
   sees the exchange while they read the beat.

2. Create a standalone sequence in one write. For an existing board, send the
   same payload with `semantic edit` and the version you read.

   The evidence comes from archboard's own source. `executeInstallSkill`
   (`src/cli/commands/install-skill.ts`) calls `writeSetup`
   (`src/cli/commands/lib/repo-setup-block.ts`). To find the agent document,
   `chooseDoc` loops over the literal list `["CLAUDE.md", "AGENTS.md"]`. So
   that step is `repeat: 2`, and the `note` says that it keeps the first that
   exists. `writeSetup` then writes the block into that document. It asks
   `git check-ignore` whether git ignores the vault, and returns the result to
   the command.

   Each call between two parts is an `edge` as well as a step. Each message
   that a file of the checkout sends carries that file and the name it calls
   or returns from as its `anchor`. The user's command and git's answer come
   from outside the checkout, so they carry none.

```bash
archboard semantic new "Skill install" --doing "explaining how install-skill writes the repository setup" <<'JSON'
{
  "level": "module",
  "nodes": [
    { "name": "User", "kind": "external", "responsibility": "Runs archboard install-skill in a repository" },
    { "name": "install-skill command", "kind": "module", "responsibility": "Installs the skill files, then writes the setup",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/install-skill.ts" } },
    { "name": "Setup block", "kind": "module", "responsibility": "Writes the vault and CLI setup into the agent document",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/lib/repo-setup-block.ts" } },
    { "name": "git", "kind": "external", "responsibility": "Answers whether a path is ignored" }
  ],
  "edges": [
    { "from": "User", "to": "install-skill command", "kind": "call", "label": "install-skill" },
    { "from": "install-skill command", "to": "Setup block", "kind": "call", "label": "writeSetup", "emphasis": "hero",
      "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/install-skill.ts", "symbol": "writeSetup" } },
    { "from": "Setup block", "to": "git", "kind": "call", "label": "check-ignore",
      "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/lib/repo-setup-block.ts", "symbol": "execFileSync" } }
  ],
  "flows": [{
    "name": "Repository setup",
    "participants": ["User", "install-skill command", "Setup block", "git"],
    "steps": [
      { "from": "User", "to": "install-skill command", "label": "install-skill" },
      { "from": "install-skill command", "to": "Setup block", "label": "writeSetup",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/install-skill.ts", "symbol": "writeSetup" } },
      { "as": "find", "from": "Setup block", "to": "Setup block", "label": "find the agent document", "kind": "self", "repeat": 2, "note": "tries CLAUDE.md then AGENTS.md and keeps the first that exists; when neither does, the skill target names the one to create",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/lib/repo-setup-block.ts", "symbol": "chooseDoc" } },
      { "as": "write", "from": "Setup block", "to": "Setup block", "label": "write the setup block", "kind": "self",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/lib/repo-setup-block.ts", "symbol": "applyBlock" } },
      { "from": "Setup block", "to": "git", "label": "check-ignore the vault",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/lib/repo-setup-block.ts", "symbol": "execFileSync" } },
      { "from": "git", "to": "Setup block", "label": "ignored or not", "kind": "return" },
      { "from": "Setup block", "to": "install-skill command", "label": "setup result", "kind": "return",
        "anchor": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/lib/repo-setup-block.ts", "symbol": "writeSetup" } }
    ]
  }],
  "views": [{ "name": "Setup exchange", "grammar": "data-flow", "scope": { "kind": "selection", "flows": ["Repository setup"] } }],
  "walkthroughs": [{
    "name": "Why the document is found before the block is written",
    "beats": [{
      "heading": "One agent document, never two",
      "body": "The block is written into whichever of CLAUDE.md and AGENTS.md already exists, so the search has to finish first: writing before it would create the second document the search exists to avoid.",
      "subjects": ["find", "write"],
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
   id. They also carry what relies on that step (`write` above), not only the
   part that the step runs on. A handle that nobody referenced explains nothing.

   Open the picture through the `data-flow` view that you made, not the whole
   board. Make sure that the columns are in order, and that every message is
   readable and in sequence. Make sure that returns and repeats are
   distinguishable, and that nothing is cut off. Run `archboard check --code`
   when the steps carry anchors: each one holds in the files on disk.

Read [sequences, views and
walkthroughs](sequences-views-walkthroughs.md) for view scopes
(isolating one relationship, a region, the whole board), beat subjects and
identity, and single-participant flows.
