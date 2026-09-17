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
  `archboard semantic` lists the boards. `archboard semantic compare <board>
[--variant <id|name>]` reads one variant against the variant it came from:
  every subject as `added`, `removed`, `changed` or `unchanged`, the fields
  that moved, and the parts a relationship or step now lands on. A root
  architecture has no predecessor and is refused.
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
   call (a function or method call, a hook, a component rendering another),
   `from` is the part whose body makes it and `to` is the part whose body runs,
   inside its `parent`; a container is an endpoint only when
   the source addresses the whole module. A part you draw with children is a
   container whatever its kind: once a module, class or component is drawn
   holding its functions, methods or child components, a call into it lands on
   the child whose body runs, not on the container,
   and giving an existing part children moves every relationship that landed
   on it to the child whose body runs. For a return or a non-call
   relationship, state the directional claim in words and make the endpoints
   follow it (for example, A returns to B, A reads from B, A emits an event B
   handles, A resolves a promise B awaits, A passes B a callback or props, or
   A depends on B). Sibling calls are not a chain: when `apply()` calls
   `validate()` and then `persist()`, the source shows two relationships from
   `apply`, and none from `validate` to `persist`, whatever order they run in.
   For a sequence also check the order the source runs them in, which steps
   return to their caller, which branch and under what condition (say it in a
   `note`), and whether a repeat count is in the source at all (a loop, `map`
   or retry over a list the source fixes, such as two candidate file names, is a `repeat` of
   that count; a loop over a list of unknown length is a `note`, not a
   `repeat`).
3. **Find the boundaries on purpose.** Before deciding the parts, look for
   what calls into this code (a server, a scheduler, a shell, a user event in
   a browser, a message consumer), the external libraries and services it
   depends on, the callbacks, hooks, handlers and plugins the application
   registers into it, and where it persists or publishes (a store, a queue, a
   socket, an event bus, a stream). Include the ones the board's question needs and
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

| Row            | When the source shows                                                                                                        | You author                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `external`     | a caller, library, framework, runtime, shell or hosted service this codebase does not own                                    | a node of kind `external`, unbound. Never for a part of this codebase a reader reaches through another board                                                                                                                                                                                                                               |
| `binding`      | the file whose body implements a part's responsibility                                                                       | `binding: { repo, path }` to that file; nothing for a part you could not inspect                                                                                                                                                                                                                                                           |
| `containment`  | a part defined inside another (a function of a module, a method of a class, a child component, a closure inside its factory) | `parent`                                                                                                                                                                                                                                                                                                                                   |
| `relationship` | a call, render, read, event, message, dependency or publication one body makes to another                                    | an `edge` of the configured kind, its `label` the message or mechanism                                                                                                                                                                                                                                                                     |
| `traffic`      | the forward path one request or event takes at runtime: the calls that run on every pass                                     | `traffic` on those relationships only (`{}`, or `speed`/`volume` to contrast a hotter path), a call an error could skip but a normal pass always makes (the handler every request reaches) included; never on teardown or cleanup, an error or exception path, an optional hook most passes skip, startup, registration or a one-shot call |
| `emphasis`     | a spine: the path or backbone the board's question is about, and the lines that are only context                             | `emphasis: "hero"` on the spine — a third of the relationships, never past half — and `"muted"` on the context. A board with a spine and no `hero` at all leaves the reader to find it                                                                                                                                                     |
| `repeat`       | a loop over a list the source fixes, or a retry limit                                                                        | `repeat` with that count on the step                                                                                                                                                                                                                                                                                                       |
| `note`         | a branch and its condition, a data-dependent loop, an environment variable, a caveat                                         | `note` on the step                                                                                                                                                                                                                                                                                                                         |
| `groups`       | a part whose concern is a configured group id in `config.yaml` (read them before every write)                                | `groups` on each member, explicit, across containers                                                                                                                                                                                                                                                                                       |
| `flow`         | an ordered exchange the question is about (handling a request, a user interaction, a pipeline run, starting up, a lifecycle) | a `flow` and a `data-flow` view over it                                                                                                                                                                                                                                                                                                    |
| `view`         | a subset a reader wants alone: one path, one container's internals, the two sides of a change                                | a board `view`                                                                                                                                                                                                                                                                                                                             |
| `walkthrough`  | a why the code enforces (an ordering, an invariant, a lock held around a write)                                              | a walkthrough beat whose subjects are the parts, relationships or steps it explains                                                                                                                                                                                                                                                        |
| `drillDown`    | a part whose internals already have a board (`archboard semantic` lists them; check first)                                   | `drillDown` on that part instead of drawing its parts again, its `kind` the level of the board it opens (`system`, `service`, `module`); never a node added only to carry the link                                                                                                                                                         |
| `description`  | a mechanism a one-line responsibility cannot hold                                                                            | `description` on the node or relationship                                                                                                                                                                                                                                                                                                  |

A row the source does not support stays out: an added relationship without a
line of evidence is a wrong board, not a complete one.

The rows land on different subjects. `note` and `repeat` are fields of a flow
step; `emphasis` and `traffic` are fields of a relationship; `from`, `to`,
`kind` and `label` are on both and mean the same thing. A step
takes nothing else, so `emphasis` or `traffic` on one is refused by key name
over the step it sits on (`→ at flows[0].steps[0]`): move it onto the
relationship between the same parts rather than dropping it from the payload.

## Which recipe

Every request is one of five workflows, and each has one recipe holding the
payload shape, a worked example from archboard's own source and the checks to read the answer
against. Read the recipe before the first command of that workflow; it is the
one reference a common path needs beyond this file.

| The request asks you to                                                                                                                | Read                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| make a new board: parts and their wiring at a level, whatever the subject (a service's modules, how a request travels, what starts up) | [create an architecture diagram](references/create-architecture.md) |
| explain one request, job or startup as an ordered exchange: a `flow` with participants and steps, on a new board or an existing one    | [create a sequence diagram](references/create-sequence.md)          |
| change, extend, correct or repair what an existing board says                                                                          | [edit an existing board](references/edit.md)                        |
| propose a change as a variant, compare it, settle its disagreements, or adopt it                                                       | [propose and compare a change](references/propose-compare.md)       |
| answer a question from a saved board and change nothing                                                                                | [answer from a saved board](references/read.md)                     |

A new board is the architecture recipe first, whatever the request calls its
subject: a board that describes how a request travels is parts, containment
and the calls between them, and the sequence recipe is read on top of it only
when the request asks for the exchange itself. A request that combines
workflows (extend the vocabulary, then create; link a detail board, then
propose) reads each recipe it needs, in the order the request runs them.

## Keep it true

- Author meaning. When the picture is wrong and the meaning is right, report the
  renderer defect; the architecture stays as the code has it.
- Every relationship and step has a line of source evidence; a picture that
  needs a relationship the source does not have is a wrong picture.
- Use the configured vocabulary and levels; extend `config.yaml` only when the
  request is about vocabulary.
- Reuse an existing detail board; link to it with `drillDown` instead of
  duplicating its parts. The linking node is a part the board draws anyway, and
  it carries the linked board's level as its kind; a node whose only reason to
  exist is the link is a button, and a diagram has no buttons.
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

| Read                                                                            | When                                                                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [create an architecture diagram](references/create-architecture.md)             | the recipe: level, registration, one payload with parts, containment, relationships and bindings, and its checks                  |
| [create a sequence diagram](references/create-sequence.md)                      | the recipe: participants, message kinds, repeat and note, the data-flow view, and its checks                                      |
| [edit an existing board](references/edit.md)                                    | the recipe: continuing, replacement and untouched subjects, one batch at the read version, and its checks                         |
| [propose and compare a change](references/propose-compare.md)                   | the recipe: branch, variant-targeted edit, both pictures through one view, the comparison report, adoption                        |
| [answer from a saved board](references/read.md)                                 | the recipe: `semantic show`, `semantic inspect --group`, `semantic compare`, what a view draws, what the answer reports, no write |
| [authoring](references/authoring.md)                                            | groups, bindings with branch/commit, drill-down, traffic, emphasis, removals and handles, refusals                                |
| [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md) | view scopes and grammars, message kinds, repeat/note, walkthrough beats and their identity                                        |
| [variants](references/variants.md)                                              | what a comparison counts, edge identity, flow/step identity, reconciliation and `resolve`, adoption, claims                       |
| [schemas](references/schemas.md)                                                | the exact JSON Schemas of the payloads, the persisted document and `config.yaml`; vault setup and installation                    |
