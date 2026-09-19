# Create a sequence diagram

The recipe for a board that answers "what happens, in what order, for one
request or job": a `flow` over the parts it moves between, drawn through a
`data-flow` view.

A sequence is a `flow` on the board that holds its participants: create the
parts, the relationships the messages travel and the flow in the same write,
with a `data-flow` view over it and, when the reader needs narration, a
walkthrough. The architecture picture draws each message as a dashed step line
where no relationship joins the two parts, so an exchange is never a row of
unjoined cards, but a step line is a reading, not a relationship. Every call the
exchange makes is also an `edge` with the same line of evidence, because the
relationship carries the kind, the traffic and the emphasis, and is what a
comparison, a view and a group inspection read.

1. Read the code path and record each message with its evidence: who calls whom,
   from which function, in which order, and which messages come back.

   List the participants in reading order: the exchange is between the parts
   the board has, so a part drawn whole stays one column whatever functions,
   methods or hooks run inside it, and a call it makes on itself (a recursive
   function, a method calling another method of a class that is one column, a
   component updating its own state, a handler re-entering itself) is one
   `self` step. A function, method or component the request names is a
   participant, and a call to it is a message to that column even when it lives
   inside its caller; one the board draws is a candidate for a column. A flow's
   participants are a subset of the board's nodes, so the columns are chosen,
   not read off the board: keep a candidate inside the part whose body runs it
   and the work done through it is one step with that part at both ends; give
   it a column and the same call is an ordinary message between columns. Both
   shapes carry the `repeat` the source fixes. The choice settles which kinds
   the exchange can contain, so make it before listing the messages, apply it
   to every candidate alike, and say which you chose.

   Then list each message in sequence with its kind: `sync` (the default: a
   call that waits, an awaited promise included), `return`, `async` (fire and
   forget: an emitted event, a message, a promise nobody awaits), `self`
   (exactly when `from` and `to` are the same node). A step that runs more than
   once carries `repeat` when the source fixes the count (a retry limit, a batch
   of a known size, a literal list of candidates tried in turn), on a `self`
   step as readily as on a call to another column: the example below tries two
   candidate documents in one `self` step with `repeat: 2`, because `chooseDoc`
   runs inside `Setup block`. A `note` that states the count in prose does not
   replace the `repeat`: the step carries the `repeat`, with a note beside it if
   needed. A loop whose length depends on data is one step with a `note` that
   says so; `note` also holds a branch or a caveat.

   Walk the catalogue in `SKILL.md` for the rest (`external`, `traffic` on the
   exchange's forward path and never on its returns). An ordering the reader
   must understand gets a walkthrough beat, which explains a step by naming it:
   give that step an `as` handle in the same write and put the handle in the
   beat's `subjects`. An ordering has two sides, so the beat names both: the
   earlier step by its handle, and what relies on it having happened (a later
   step, or the part that acts on its result), with the parts they run on. Set
   the beat's `view` to the data-flow view so the reader looks at the exchange
   while reading it.

2. Create a standalone sequence in one write; against an existing board, send
   the same payload with `semantic edit` and the version you read. The evidence,
   from archboard's own source: `executeInstallSkill`
   (`src/cli/commands/install-skill.ts`) calls `writeSetup`
   (`src/cli/commands/lib/repo-setup-block.ts`); to find the agent document,
   `chooseDoc` loops over the literal list `["CLAUDE.md", "AGENTS.md"]`, so that
   step is `repeat: 2`, and the `note` says it keeps the first that exists;
   `writeSetup` then writes the block into that document, asks
   `git check-ignore` whether the vault is ignored, and returns the result to
   the command. Each call between two parts is an `edge` as well as a step.

```bash
archboard semantic new "Skill install" --doing "explaining how install-skill writes the repository setup" <<'JSON'
{
  "level": "module",
  "nodes": [
    { "name": "Person", "kind": "external", "responsibility": "Runs archboard install-skill in a repository" },
    { "name": "install-skill command", "kind": "module", "responsibility": "Installs the skill files, then writes the setup",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/install-skill.ts" } },
    { "name": "Setup block", "kind": "module", "responsibility": "Writes the vault and CLI setup into the agent document",
      "binding": { "repo": "github.com/miklschmidt/archboard", "path": "src/cli/commands/lib/repo-setup-block.ts" } },
    { "name": "git", "kind": "external", "responsibility": "Answers whether a path is ignored" }
  ],
  "edges": [
    { "from": "Person", "to": "install-skill command", "kind": "call", "label": "install-skill" },
    { "from": "install-skill command", "to": "Setup block", "kind": "call", "label": "writeSetup", "emphasis": "hero" },
    { "from": "Setup block", "to": "git", "kind": "call", "label": "check-ignore" }
  ],
  "flows": [{
    "name": "Repository setup",
    "participants": ["Person", "install-skill command", "Setup block", "git"],
    "steps": [
      { "from": "Person", "to": "install-skill command", "label": "install-skill" },
      { "from": "install-skill command", "to": "Setup block", "label": "writeSetup" },
      { "as": "find", "from": "Setup block", "to": "Setup block", "label": "find the agent document", "kind": "self", "repeat": 2, "note": "tries CLAUDE.md then AGENTS.md and keeps the first that exists; when neither does, the skill target names the one to create" },
      { "as": "write", "from": "Setup block", "to": "Setup block", "label": "write the setup block", "kind": "self" },
      { "from": "Setup block", "to": "git", "label": "check-ignore the vault" },
      { "from": "git", "to": "Setup block", "label": "ignored or not", "kind": "return" },
      { "from": "Setup block", "to": "install-skill command", "label": "setup result", "kind": "return" }
    ]
  }],
  "views": [{ "name": "Setup exchange", "grammar": "data-flow", "scope": { "kind": "selection", "flows": ["Repository setup"] } }],
  "walkthroughs": [{
    "name": "Why the document is found before the block is written",
    "beats": [{
      "heading": "One agent document, never two",
      "body": "The block is written into whichever of CLAUDE.md and AGENTS.md already exists, so the search has to finish first: writing before it would create the second document the search exists to avoid.",
      "subjects": ["find", "write", "Setup block"],
      "view": "Setup exchange"
    }]
  }]
}
JSON
archboard semantic rasterize "Skill install" --view "Setup exchange" --out setup.png
```

3. Check the answer's flow against your record: participants in the order you
   meant, steps in the order the source runs them, returns where the source
   returns, kinds and notes as the code justifies, a `repeat` on every step
   whose count the source fixes, and a step with the same participant at both
   ends wherever the source has one calling itself (the saved kind is `self`
   because the ends are equal, so the step has to be there at all). The saved
   beat's `subjects` carry the step's minted id (a handle nobody referenced
   explains nothing) and what relies on that step (`write` above), not only the
   part the step runs on. Open the picture through the `data-flow` view you
   made, not the whole board: the columns in order, every message readable and
   in sequence, returns and repeats distinguishable, nothing cut off.

Read [sequences, views and
walkthroughs](references/sequences-views-walkthroughs.md) for view scopes
(isolating one relationship, a region, the whole board), beat subjects and
identity, and single-participant flows.
