---
name: archboard
description: >-
  Diagram real code as archboard semantic boards with the archboard CLI: create
  an architecture diagram (parts, containment, relationships) or a sequence
  diagram (an ordered exchange) from source, edit an existing board, propose an
  architectural change as a variant and compare it, bind parts to code, render
  SVGs. Use when asked to document, explain or change a system's architecture,
  a request or data flow, or a board in the vault.
---

# Archboard

An agent states what an architecture IS; archboard draws it. A **board** is one
document in the vault holding a family of **variants** (the current architecture
and proposals derived from it). There is no layout to author: every picture is
rendered from meaning, so a wrong picture is fixed by fixing the meaning.

Two diagram types, one board:

- **Architecture diagram**: nodes (with a configured `kind`, a one-line
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

## Essentials

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
  definition whole, so restate the fields you keep.
- **Verification.** Read the write's answer back against what you meant; render
  with `semantic render <board> --out <file.svg>` and look at the SVG when the
  picture is the deliverable. `archboard check` is for after a vocabulary edit
  or when an answer carries `warnings`.
- **Claims.** For work of several writes, `archboard claim --board <board>
--reason "<campaign>"` first and `archboard release --board <board>` after. A
  person can take the claim back: your next write is then refused once, nothing
  is rolled back, and you stop and say so.

## Create an architecture diagram from code

1. Read the source you will describe. Decide the board's level from
   `config.yaml` (`system`: collaborating services; `service`: the modules of
   one; `module`: the functions inside one) and its subject: a short name such
   as `Flask request pipeline`, never a path.
2. If parts will be bound to code, register the checkout once:
   `archboard repo add /path/to/checkout` prints the repository identity
   (`github.com/pallets/flask`); bindings use that identity and a repo-relative
   path.
3. State the architecture in one payload and create the board:

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
      "binding": { "repo": "github.com/pallets/flask", "path": "src/flask/app.py" } }
  ],
  "edges": [
    { "from": "WSGI server", "to": "Flask.wsgi_app", "kind": "call", "label": "environ, start_response" },
    { "from": "Flask.wsgi_app", "to": "Request context", "kind": "call", "label": "push" },
    { "from": "Flask.wsgi_app", "to": "full_dispatch_request", "kind": "call" }
  ]
}
JSON
archboard semantic render "Flask request pipeline" --out pipeline.svg
```

Each relationship lands on the part that actually receives the call, inside
its `parent`; the renderer carries the line across the container boundary.
A container is an endpoint only for a relationship to the whole module.

4. Check the answer: every part you meant is there with a configured `kind`,
   every relationship ends where the code says, bound parts name the identity
   from step 2. Open the SVG and read it as the audience will.

Read [authoring](references/authoring.md) for groups, drill-down links to
detail boards, traffic, emphasis, descriptions, and what a refusal means.

## Create a sequence diagram

A sequence is a `flow` on the board that holds its participants; create the
parts and flow in the same write, add a `data-flow` view over it and, when the
reader needs narration, a walkthrough.

1. Read the code path. List the participants in reading order and each message
   in sequence with its kind: `sync` (a call, the default), `return`, `async`
   (fire and forget), `self` (a participant's own step; exactly when `from` and
   `to` are the same node). Use `repeat` (2 or more) for a repeated attempt and
   `note` for a caveat on one step.
2. Create a standalone sequence in one write. Against an existing board, use
   the same payload with `semantic edit` and the version you read:

```bash
archboard semantic new "Flask CLI startup" --doing "explaining how flask run starts the server" <<'JSON'
{
  "level": "module",
  "nodes": [
    { "name": "Shell", "kind": "external", "responsibility": "Invokes the flask command" },
    { "name": "FlaskGroup", "kind": "module", "responsibility": "Dispatches the selected Flask command" },
    { "name": "run_command", "kind": "function", "responsibility": "Loads the app and starts the development server" },
    { "name": "ScriptInfo", "kind": "module", "responsibility": "Locates and imports the Flask application" },
    { "name": "run_simple", "kind": "external", "responsibility": "Serves requests until interrupted" }
  ],
  "flows": [{
    "name": "flask run",
    "participants": ["Shell", "FlaskGroup", "run_command", "ScriptInfo", "run_simple"],
    "steps": [
      { "from": "Shell", "to": "FlaskGroup", "label": "flask run" },
      { "from": "FlaskGroup", "to": "run_command", "label": "invoke" },
      { "from": "run_command", "to": "ScriptInfo", "label": "load_app" },
      { "from": "ScriptInfo", "to": "ScriptInfo", "label": "try candidate app names", "kind": "self", "repeat": 2, "note": "FLASK_APP can name the app or factory" },
      { "from": "ScriptInfo", "to": "run_command", "label": "Flask app", "kind": "return" },
      { "from": "run_command", "to": "run_simple", "label": "serve" }
    ]
  }],
  "views": [{ "name": "Startup exchange", "grammar": "data-flow", "scope": { "kind": "selection", "flows": ["flask run"] } }]
}
JSON
archboard semantic render "Flask CLI startup" --view "Startup exchange" --out startup.svg
```

3. Check the answer's flow: participants in the order you meant, steps in
   sequence, kinds as the code justifies. Open the SVG.

Read [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md)
for view scopes (isolating one relationship, a region, the whole board), beat
subjects and identity, and single-participant flows.

## Edit an existing board

1. `archboard semantic show <board>` and note `version`, the target variant's
   ids, and the fields of every subject you will restate.
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

4. Check the answer: the ids you meant to keep are unchanged, removed subjects
   are gone, restated subjects still carry the fields you kept, `version` moved
   by one. Render when the picture matters.

Read [authoring](references/authoring.md) for every removal list, bindings
with revision evidence, groups, and how to repair a refused write.

## Propose and compare a change

1. `semantic show` the board; note `version` and the variant to derive from.
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
archboard semantic render "Flask contexts" --view Contexts --out current.svg
archboard semantic render "Flask contexts" --view Contexts --variant "Context variables" --out proposal.svg
```

The proposal carries every subject of its predecessor with the same ids, so
the comparison is exact: kept ids read as continuing, new subjects as added,
removed ids as removed. Views belong to the board, so both renders go through
the same view and a removed subject stays drawn as removed.

3. Check the answer's comparison against your change map: the added, removed,
   changed and unchanged subjects are the ones you intended, and a continuing
   exchange compares step by step. Report what changed in those terms.
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
- Use the configured vocabulary and levels; extend `config.yaml` only when the
  request is about vocabulary.
- Reuse an existing detail board; link to it with `drillDown` instead of
  duplicating its parts.
- Fewer, truer parts: every node has a responsibility the source supports.
- Traffic (`"traffic": {}`, or `speed`/`volume`) illustrates flow; say so when
  you report it, and never present it as measured.

## When to read more

| Read                                                                            | When                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [authoring](references/authoring.md)                                            | groups and `semantic inspect`, bindings with branch/commit, drill-down, traffic, emphasis, removals, refusals  |
| [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md) | view scopes and grammars, message kinds, repeat/note, walkthrough beats and their identity                     |
| [variants](references/variants.md)                                              | what a comparison counts, edge identity, flow/step identity, reconciliation and `resolve`, adoption, claims    |
| [schemas](references/schemas.md)                                                | the exact JSON Schemas of the payloads, the persisted document and `config.yaml`; vault setup and installation |
