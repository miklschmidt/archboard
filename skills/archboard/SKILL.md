---
name: archboard
description: >-
  Diagram real code as archboard semantic boards with the archboard CLI: create
  an architecture diagram (parts, containment, relationships) or a sequence
  diagram (an ordered exchange) from source, edit an existing board, propose an
  architectural change as a variant and compare it, bind parts to code, render
  SVGs and PNGs. Use when asked to document, explain or change a system's
  architecture, a request or data flow, or a board in the vault.
---

# Archboard

An agent states what an architecture IS; archboard draws it. A **board** is one
document in the vault holding a family of **variants** (the current architecture
and proposals derived from it). There is no layout to author: every picture is
rendered from meaning. Fix a semantic error in that meaning; when the saved
meaning matches the source and the picture does not, report a renderer defect.

Two diagram types, one board:

- **Architecture diagram**: nodes (with a configured `kind`, a clear short
  `responsibility`, optional `parent` containment, `groups`, a code `binding`),
  directed relationships (`edges`) between them, and board-owned `views` that
  read a region of it. Use it to answer "what are the parts and how are they
  wired".
- **Sequence diagram**: a `flow` (participants in column order, ordered steps
  with a message kind) drawn through a `data-flow` view. Use it to answer "what
  happens, in what order, for one request or job". A flow lives on the same
  board as the parts it moves between.

Use a **variant** for a proposed evolution of the same diagram, and a separate
**linked board** for a different subject or level of detail.

Write responsibilities as clear prose that usually reads over two or three
card lines. Newlines are optional: the renderer wraps and shows the complete
value, and rendered line count is not a validation limit. Put longer detail in
`description`.

## Essentials

- **The CLI is the only way a board changes.** Every board is a file the
  server owns; you never read one to edit it and never write one. Its ids,
  `version`, timestamps, `lifecycle`, `adoptions` and `reconciliation` are the
  product's outcome of your writes, not fields you author or repair. When a
  write is refused, repair the payload from what the refusal says; a second
  attempt needs new evidence, not a retry. When no supported command can do
  what was asked, leave the board valid as it is and report the requirement
  you could not meet.
- **Environment.** The repository's `AGENTS.md`/`CLAUDE.md` setup block names
  `ARCHBOARD_VAULT` (and `EXPRESS_SERVER_URL` when the canvas is not on the
  default port). Every `archboard` command reads them; the canvas starts itself
  when nothing answers. Inside the archboard checkout, `./bin/canvas` stands in
  for `archboard`.
- **Vocabulary.** Read `$ARCHBOARD_VAULT/.archboard/config.yaml` once: it
  defines the board `levels`, the `nodeKinds`, the `relationshipKinds` and the
  `groups`. Use those keys; a new unknown key is refused. Extend the file only
  when the request is about vocabulary ([schemas](references/schemas.md)
  links its JSON Schema); then run `archboard check`.
- **Reads.** `archboard semantic show <board>` prints the whole family: every
  variant with its `lifecycle`, `parent`, `content` and the board `version`.
  `archboard semantic` lists the boards.
- **Writes.** `semantic new` needs `--doing "<present-tense line>"`. Every
  later write (`edit`, `branch`, `resolve`, `adopt`) also needs
  `--expect-version <n>` with the version you read; a moved board refuses the
  write (exit 5) and you read again and redo the change on what is there now.
  One requested change is one batch. The answer to a write is the saved family
  with its new `version` and every minted id, so take ids and the version from
  it rather than reading again.
- **References.** Inside a payload, name a node by its `name` or its `id`; a
  relationship or step, which has no name, by `id` or by a same-write handle
  `as`. New subjects leave `id` out. A restated subject replaces its previous
  definition whole, so restate the fields you keep. A relationship restated
  without its `id` is a new relationship, however familiar its endpoints: to
  change one property of an existing relationship (its traffic, its label),
  restate it with the `id` you read, and never remove it to add it again.
- **Verification.** Read the write's answer back against the checks you wrote
  down before writing (below). When the picture is the deliverable, draw it
  and look at it: `semantic rasterize <board> --out <file.png>` and open the
  PNG, or `semantic render <board> --out <file.svg>` and open the SVG in a
  viewer. Reading the SVG's text is not looking at a diagram. `archboard check`
  is for after a vocabulary edit or when an answer carries `warnings`.
- **Open questions.** A question about the product (a field, a selector, what
  a refusal means, what a command accepts) is answered by the references
  below, the generated JSON Schemas under `references/generated/`, and
  `archboard <command> --help`. When none of them answers it, say so in your
  final message, naming the question; that report is how the skill gets the
  answer added.
- **Claims.** For work of several writes, `archboard claim --board <board>
--reason "<campaign>"` first and `archboard release --board <board>` after. A
  person can take the claim back: your next write is then refused once, nothing
  is rolled back, and you stop and say so.

## Evidence before a write

Reading the right guidance and the right source is not enough: a relationship
is a claim about code, and the failures that recur are claims nobody checked.
Do this in proportion to the request. A rename needs one line of it; a new
board needs all of it.

1. **Turn the request into checks.** Before the payload, write down what a
   correct answer must show: the board and the `version` you read; the target
   variant (a proposal names it in `variant`; a batch without `variant` edits
   the current architecture, so a proposal-only request lands nothing there);
   the ids and fields that must survive; and for a view, its exact `grammar`
   and `scope` selectors: naming `edges` isolates those relationships and
   draws no other, while naming `nodes` alone draws every relationship among
   them. After the write, read the answer against that list.
2. **Prove each relationship and step from source.** For every `edge` and
   every flow step keep a one-line record: `from` → `to`, the semantic kind,
   and the source file and function or symbol that prove the mechanism. For a
   call, `from` is the caller whose body makes it and `to` is the receiver
   whose body runs, inside its `parent`; a container is an endpoint only when
   the source addresses the whole module. A part you draw with children is a
   container whatever its kind: once the request context holds `push` and
   `pop`, the call `wsgi_app` makes lands on `push`, not on the container,
   and giving an existing part children moves every relationship that landed
   on it to the child whose body runs. For a return or a non-call
   relationship, state the directional claim in words and make the endpoints
   follow it (for example, A returns to B, A reads from B, A publishes to B, or
   A depends on B). Sibling calls are not a chain: when `dispatch()` calls
   `before()` and then `handle()`, the source shows two relationships from
   `dispatch`, and none from `before` to `handle`, whatever order they run in.
   For a sequence also check the order the source runs them in, which steps
   return to their caller, which branch and under what condition (say it in a
   `note`), and whether a repeat count is in the source at all (a loop over a
   list the source fixes, such as two default module names, is a `repeat` of
   that count; a loop over a list of unknown length is a `note`, not a
   `repeat`).
3. **Find the boundaries on purpose.** Before deciding the parts, look for
   what calls into this code (a server, a scheduler, a shell), the external
   libraries and services it depends on, the callbacks and plugins the
   application registers into it, and where it persists or publishes (a
   store, a queue, a socket). Include the ones the board's question needs and
   leave the rest out deliberately; a boundary you never looked for is an
   omission, one you chose to omit is scope.
4. **Bind to the owner.** A `binding` names the file that implements the
   node's stated responsibility, not a file that imports, registers or calls
   it. A planned part or an implementation unavailable for inspection stays
   unbound. An implementation in another checkout may bind after you inspect
   its owner and register that repository. When a node's responsibility spans
   files, narrow the responsibility or split the node rather than bind to the
   wrong one.

## Everything the code shows

A request names the question, the level and a few names. It does not list the
semantics; knowing the product is your job, and a board that stops at the parts
and calls the request happened to mention leaves out what the code showed you.
Before every write that creates or extends a board, walk this catalogue against
the source you read, in this vocabulary (the grader uses the same words); every
row the source justifies goes in the payload, and your answer says which rows
you used and which you judged not to apply.

| Row            | When the source shows                                                                         | You author                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `external`     | a caller, library, service, shell or hypothetical part outside the checkout                   | a node of kind `external`, unbound                                                                     |
| `binding`      | the file whose body implements a part's responsibility                                        | `binding: { repo, path }` to that file; nothing for a part you could not inspect                       |
| `containment`  | a part defined inside another (a method of a class, a function of a module)                   | `parent`                                                                                               |
| `relationship` | a call, return, read, dependency or publication one body makes to another                     | an `edge` of the configured kind, its `label` the message or mechanism                                 |
| `traffic`      | the path a request or event takes at runtime, as against setup, registration or teardown      | `traffic` on those relationships (`{}`, or `speed`/`volume` to contrast a hotter path); none elsewhere |
| `emphasis`     | the few lines the board exists to show, and lines that are only context                       | `emphasis: "hero"` on the few, `"muted"` on the context                                                |
| `repeat`       | a loop over a list the source fixes, or a retry limit                                         | `repeat` with that count on the step                                                                   |
| `note`         | a branch and its condition, a data-dependent loop, an environment variable, a caveat          | `note` on the step                                                                                     |
| `groups`       | a part whose concern is a configured group id in `config.yaml` (read them before every write) | `groups` on each member, explicit, across containers                                                   |
| `flow`         | an ordered exchange the question is about (handling a request, starting up, a lifecycle)      | a `flow` and a `data-flow` view over it                                                                |
| `view`         | a subset a reader wants alone: one path, one container's internals, the two sides of a change | a board `view`                                                                                         |
| `walkthrough`  | a why the code enforces (an ordering, an invariant, a context pushed before dispatch)         | a walkthrough beat whose subjects are the parts, relationships or steps it explains                    |
| `drillDown`    | a part whose internals already have a board (`archboard semantic` lists them; check first)    | `drillDown` to that board instead of its parts again                                                   |
| `description`  | a mechanism a one-line responsibility cannot hold                                             | `description` on the node or relationship                                                              |

A row the source does not support stays out: an added relationship without a
line of evidence is a wrong board, not a complete one.

## Create an architecture diagram from code

1. Read the source you will describe, do the four steps above and walk the
   catalogue. Decide the
   board's level from `config.yaml` (`system`: collaborating services;
   `service`: the modules of one; `module`: the functions inside one) and its
   subject: a short name such as `Flask request pipeline`, never a path. Two
   rows need a read before the payload: the configured `groups`, so each
   part lists the concerns it serves, and `archboard semantic`, so a part
   whose internals already have a board links to it with `drillDown`.
2. If parts will be bound to code, register the checkout once:
   `archboard repo add /path/to/checkout` prints the repository identity
   (`github.com/pallets/flask`); bindings use that identity and a repo-relative
   path.
3. State the architecture in one payload and create the board. The evidence
   behind this one, from `src/flask/app.py` in Flask 3.0: `Flask.wsgi_app`
   pushes a `RequestContext` (`ctx.py`) and calls `full_dispatch_request`;
   `full_dispatch_request` calls `preprocess_request`, then
   `dispatch_request`, then `finalize_request`, one after another from its own
   body, so those three are siblings, not a chain. The WSGI server is the
   inbound caller and lives outside the checkout, so it stays unbound.

```bash
archboard semantic new "Flask request pipeline" --doing "describing one request through Flask" <<'JSON'
{
  "level": "service",
  "nodes": [
    { "name": "WSGI server", "kind": "external", "responsibility": "Calls the application once per request" },
    { "name": "Flask app", "kind": "app", "responsibility": "The WSGI application object",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "Flask.wsgi_app", "kind": "function", "parent": "Flask app",
      "responsibility": "Pushes the request context and dispatches",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "Request context", "kind": "module", "parent": "Flask app",
      "responsibility": "Binds request and session for one request",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/ctx.py" } },
    { "name": "full_dispatch_request", "kind": "function", "parent": "Flask app",
      "responsibility": "Preprocess, dispatch and finalize one request",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "preprocess_request", "kind": "function", "parent": "Flask app",
      "responsibility": "Runs the before-request hooks",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } },
    { "name": "dispatch_request", "kind": "function", "parent": "Flask app",
      "responsibility": "Calls the matched view function",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } }
  ],
  "edges": [
    { "from": "WSGI server", "to": "Flask.wsgi_app", "kind": "call", "label": "environ, start_response" },
    { "from": "Flask.wsgi_app", "to": "Request context", "kind": "call", "label": "push" },
    { "from": "Flask.wsgi_app", "to": "full_dispatch_request", "kind": "call" },
    { "from": "full_dispatch_request", "to": "preprocess_request", "kind": "call" },
    { "from": "full_dispatch_request", "to": "dispatch_request", "kind": "call" }
  ]
}
JSON
archboard semantic rasterize "Flask request pipeline" --out pipeline.png
```

Each relationship lands on the part that actually receives the call, inside
its `parent`; the renderer carries the line across the container boundary.
A container is an endpoint only for a relationship to the whole module.
`Request context` receives `push` here because it has no children; the
moment you draw `push` and `pop` inside it, the call lands on `push`.

4. Check the answer against your record: every part you meant is there with a
   configured `kind`; every relationship's `from`, `to` and `kind` match the
   line of evidence you kept for it, and no relationship exists that you have
   no line for; bound parts name the identity from step 2 and the owning file.
   Open the picture and read it as the audience will: the labels legible,
   nothing cut off, each arrow ending on the part its evidence names. Your
   answer names the catalogue rows the board uses and the ones you judged not
   to apply.

Read [authoring](references/authoring.md) for groups, drill-down links to
detail boards, traffic, emphasis, descriptions, and what a refusal means.

## Create a sequence diagram

A sequence is a `flow` on the board that holds its participants; create the
parts, the relationships the messages travel and the flow in the same write,
add a `data-flow` view over it and, when the reader needs narration, a
walkthrough. The flow is drawn only through that view; the board itself is the
architecture picture, so every call the exchange makes is also an `edge`
between its participants, with the same line of evidence, or a reader who
opens the board sees cards with nothing joining them.

1. Read the code path and record each message with its evidence: who calls
   whom, from which function, in which order, and which messages come back.
   List the participants in reading order and each message in sequence with
   its kind: `sync` (a call, the default), `return`, `async` (fire and
   forget), `self` (a participant's own step; exactly when `from` and `to` are
   the same node). Use `repeat` for a count the source fixes (a retry limit,
   a batch of a known size, a literal list of candidates tried in turn: two
   default module names is `repeat: 2`); a loop whose length depends on data
   is one step with a `note` that says so. Use `note` for a branch or a
   caveat. Walk the catalogue for the rest: the parts outside the checkout
   are `external`, the exchange's relationships carry `traffic` when it is
   the runtime path, and an ordering the reader must understand gets a
   walkthrough beat.
2. Create a standalone sequence in one write. Against an existing board, use
   the same payload with `semantic edit` and the version you read. The
   evidence here, from `src/flask/cli.py` in Flask 3.0: `run_command` calls
   `ScriptInfo.load_app`; when `FLASK_APP` names nothing, `load_app` loops
   over the literal tuple `("wsgi.py", "app.py")`, a list the source fixes, so
   that step is `repeat: 2`, and within each candidate `locate_app` tries the
   attribute names, which the `note` says; `load_app` then returns the app to
   `run_command`, which hands it to werkzeug's `run_simple`. Each of those
   calls is an `edge` as well as a step.

```bash
archboard semantic new "Flask CLI startup" --doing "explaining how flask run starts the server" <<'JSON'
{
  "level": "module",
  "nodes": [
    { "name": "Shell", "kind": "external", "responsibility": "Invokes the flask command" },
    { "name": "FlaskGroup", "kind": "module", "responsibility": "Dispatches the selected Flask command",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/cli.py" } },
    { "name": "run_command", "kind": "function", "responsibility": "Loads the app and starts the development server",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/cli.py" } },
    { "name": "ScriptInfo", "kind": "module", "responsibility": "Locates and imports the Flask application",
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/cli.py" } },
    { "name": "run_simple", "kind": "external", "responsibility": "Serves requests until interrupted" }
  ],
  "edges": [
    { "from": "Shell", "to": "FlaskGroup", "kind": "call", "label": "flask run" },
    { "from": "FlaskGroup", "to": "run_command", "kind": "call", "label": "invoke" },
    { "from": "run_command", "to": "ScriptInfo", "kind": "call", "label": "load_app" },
    { "from": "run_command", "to": "run_simple", "kind": "call", "label": "serve", "emphasis": "hero" }
  ],
  "flows": [{
    "name": "flask run",
    "participants": ["Shell", "FlaskGroup", "run_command", "ScriptInfo", "run_simple"],
    "steps": [
      { "from": "Shell", "to": "FlaskGroup", "label": "flask run" },
      { "from": "FlaskGroup", "to": "run_command", "label": "invoke" },
      { "from": "run_command", "to": "ScriptInfo", "label": "load_app" },
      { "from": "ScriptInfo", "to": "ScriptInfo", "label": "import the first candidate that loads", "kind": "self", "repeat": 2, "note": "tries wsgi.py then app.py unless FLASK_APP names the app or factory; within each, locate_app tries the attribute names" },
      { "from": "ScriptInfo", "to": "run_command", "label": "Flask app", "kind": "return" },
      { "from": "run_command", "to": "run_simple", "label": "serve" }
    ]
  }],
  "views": [{ "name": "Startup exchange", "grammar": "data-flow", "scope": { "kind": "selection", "flows": ["flask run"] } }]
}
JSON
archboard semantic rasterize "Flask CLI startup" --view "Startup exchange" --out startup.png
```

3. Check the answer's flow against your record: participants in the order you
   meant, steps in the order the source runs them, returns where the source
   returns, kinds and notes as the code justifies. Open the picture through
   the `data-flow` view you made, not the whole board: the columns in order,
   every message readable and in sequence, returns and repeats
   distinguishable, nothing cut off. Your answer names the catalogue rows the
   board uses and the ones you judged not to apply.

Read [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md)
for view scopes (isolating one relationship, a region, the whole board), beat
subjects and identity, and single-participant flows.

## Edit an existing board

1. `archboard semantic show <board>` and note `version`, the target variant's
   ids, and the fields of every subject you will restate. Write the checks:
   which variant the change lands on, which ids must survive, which fields you
   are keeping and which you are changing. Read the source for the region you
   touch: when the board already contradicts it there (a call drawn from the
   wrong part, a membership the code does not support), say so in your
   answer, and change it only when the request covers it; a board you were
   asked to extend is not yours to silently repair or silently repeat.
2. Map the change onto what you read, subject by subject:
   - **Continuing**: the same part, relationship, exchange or step evolves; keep
     its `id` (a rename, a reworded responsibility, a new binding).
   - **Replacement**: a different unit takes its place; remove the old id and
     add the new subject without one. Similar names or paths do not make two
     implementations one unit.
   - **Untouched**: leave it out of the payload entirely.
     For a relationship, changing two or more of `from`, `to`, `kind`, `label`,
     `description`, `emphasis`, effective `traffic` makes it a replacement;
     one change keeps the id.
     Walk the catalogue for what you add: a new part brings its kind,
     containment, binding and groups; a new runtime path brings its traffic;
     a removed part takes its relationships and walkthrough references with
     it.
3. Write it as one batch, naming the `variant` when it is not the current one:

```bash
archboard semantic edit "Flask JSON" --expect-version 3 --doing "routing JSON through the provider" <<'JSON'
{
  "nodes": [{ "name": "DefaultJSONProvider", "kind": "module",
    "responsibility": "dumps, loads and response for the app",
    "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/json/provider.py" } }],
  "edges": [
    { "from": "Flask app", "to": "DefaultJSONProvider", "kind": "data", "label": "app.json" },
    { "from": "JSON helpers", "to": "DefaultJSONProvider", "kind": "call", "label": "current_app.json.dumps" }
  ],
  "removeEdges": ["e7Kq2mP1"]
}
JSON
```

The evidence for the two relationships: `Flask.__init__` (`app.py`) assigns
`self.json = self.json_provider_class(self)`, and `flask.json.dumps`
(`json/__init__.py`) calls `current_app.json.dumps`. The provider binds to
`provider.py`, where `DefaultJSONProvider` is implemented, not to the helpers
that call it.

4. Check the answer against your checks: the ids you meant to keep are
   unchanged, removed subjects are gone, restated subjects still carry the
   fields you kept, `version` moved by one, and nothing landed on a variant
   you did not name. Draw and look when the picture matters. Your answer
   names the catalogue rows the change uses and the ones you judged not to
   apply.

Read [authoring](references/authoring.md) for every removal list, bindings
with revision evidence, groups, and how to repair a refused write.

## Propose and compare a change

1. `semantic show` the board; note `version` and the variant to derive from.
   The checks: every edit names the proposal in `variant`, so the current
   architecture is byte-for-byte what it was; the ids the proposal keeps; the
   view both pictures will go through.
2. Branch, then edit the proposal:

```bash
archboard semantic branch "Flask contexts" --as "Context variables" --summary "Replace the LocalStacks with contextvars" --expect-version 2 --doing "proposing contextvars"
archboard semantic edit "Flask contexts" --expect-version 3 --doing "rewiring the contexts to contextvars" <<'JSON'
{
  "variant": "Context variables",
  "nodes": [{ "name": "Context variables", "kind": "module", "responsibility": "_cv_app and _cv_request hold the active contexts",
    "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/globals.py" } }],
  "edges": [
    { "from": "App context", "to": "Context variables", "kind": "data", "label": "set / reset" },
    { "from": "Request context", "to": "Context variables", "kind": "data", "label": "set / reset" }
  ],
  "removeNodes": ["App context stack", "Request context stack"]
}
JSON
archboard semantic rasterize "Flask contexts" --view Contexts --out current.png
archboard semantic rasterize "Flask contexts" --view Contexts --variant "Context variables" --out proposal.png
```

The proposal carries every subject of its predecessor with the same ids, so
the comparison is exact: kept ids read as continuing, new subjects as added,
removed ids as removed. Views belong to the board, so both pictures go through
the same view and a removed subject stays drawn as removed. The evidence for
the rewiring is in `src/flask/ctx.py` of Flask 2.2: `AppContext.push` and
`RequestContext.push` call `_cv_app.set` and `_cv_request.set` from
`globals.py`, where the context variables are defined.

3. Check the answer's comparison against your change map: the added, removed,
   changed and unchanged subjects are the ones you intended, the current
   variant is untouched, and a continuing exchange compares step by step.
   Open both pictures: the removal is drawn as removed in the proposal's, and
   the current one shows what it showed before. Report what changed in those
   terms: the parts removed, the parts added, and for every relationship the
   proposal keeps or adds, where it now lands (here, both contexts' `set /
reset` relationships land on `Context variables`). A relationship whose
   endpoint moved is the change the comparison exists to show, so name it.
4. Only when asked, adopt with the version returned by the proposal edit:
   `archboard semantic adopt "Flask contexts" --variant "Context variables" --reason "Flask 2.2 implements contexts with contextvars" --expect-version 4 --doing "adopting context variables"`.
   The proposal becomes current, the previous current becomes historical, and
   nothing is renamed.

Read [variants](references/variants.md) for what the comparison counts, for a
proposal that holds disagreements after its predecessor moved (`semantic
resolve`), and for adoption rules.

## Keep it true

- Author meaning. When the picture is wrong and the meaning is right, report the
  renderer defect; the architecture stays as the code has it.
- Every relationship and step has a line of source evidence; a picture that
  needs a relationship the source does not have is a wrong picture.
- Use the configured vocabulary and levels; extend `config.yaml` only when the
  request is about vocabulary.
- Reuse an existing detail board; link to it with `drillDown` instead of
  duplicating its parts.
- Fewer, truer parts: every node has a responsibility the source supports, and
  a binding only to the file that implements it.
- Traffic (`"traffic": {}`, or `speed`/`volume`) is authored intent, never a
  measurement: choose it from what the source says runs per request, not from
  numbers you do not have. A still picture shows the marks at rest and proves
  nothing about motion.
- A refusal is repaired from its reason. Never edit the vault to get past one,
  never invent an id, and when the CLI cannot do what was asked, say what
  remains open rather than approximate it.

## When to read more

| Read                                                                            | When                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [authoring](references/authoring.md)                                            | groups and `semantic inspect`, bindings with branch/commit, drill-down, traffic, emphasis, removals, refusals  |
| [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md) | view scopes and grammars, message kinds, repeat/note, walkthrough beats and their identity                     |
| [variants](references/variants.md)                                              | what a comparison counts, edge identity, flow/step identity, reconciliation and `resolve`, adoption, claims    |
| [schemas](references/schemas.md)                                                | the exact JSON Schemas of the payloads, the persisted document and `config.yaml`; vault setup and installation |
