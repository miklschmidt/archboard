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

## The runbook

One ordered walk from an empty request to a board somebody can read, for
either diagram type. Each step is one move, and links the detail it needs
where that detail lives, so the walk is what reaches the rest of this file and
its references. Take the whole walk for a new board; an edit, a proposal or a
question is the same walk with its own recipe at step 1 and the steps that
recipe names.

1. **Pick the workflow and read its one recipe** before the first command of
   it ([which recipe](#which-recipe)).
2. **Claim a board that already exists** when the work runs to several writes
   ([Claims](#essentials)); a board this walk creates is claimed at step 13
   instead.
3. **Read the configured vocabulary and the boards the vault already holds**,
   so a part whose internals already have a board links to it with `drillDown`
   instead of being drawn again ([Vocabulary](#essentials),
   [Reads](#essentials)).
4. **Gather the source context**: read the code the request names and follow
   it out to the boundaries [evidence rule 1](#evidence-before-a-write) lists.
5. **Decide the parts**: the level, the subject, which parts hold which as
   children, which belong to another codebase or nobody has built yet, and each
   one's `binding` ([evidence rule 2](#evidence-before-a-write)).
6. **Map the relationships**, one line of evidence per `edge`
   ([evidence rule 3](#evidence-before-a-write)).
7. **For a sequence, choose the columns before the messages**: a flow's
   participants are a subset of the board's nodes, so the parts the request
   names are columns, a part drawn whole stays one column whatever functions
   run inside it, and any other part the board draws is a candidate for a
   column rather than owed one — a choice that settles which message kinds the
   exchange can hold ([create a sequence diagram](references/create-sequence.md)).
8. **Order the exchange**: the participants in column order, and every message
   between them in the order the source runs them, returns included.
9. **Read the source again for what a flow shows only on a second pass**: a
   call a participant makes on itself (a recursive function, a method calling
   another of its own, a component updating its own state, a handler
   re-entering itself; the [sequence recipe's
   example](references/create-sequence.md) shows one) is one step with that
   participant at both ends, and a count the source fixes (a literal list of
   candidates tried in turn, a retry limit, a batch of known size) is the
   repeating step's `repeat`, on a `self` step or a call to another column
   alike, which a `note` stating the count in prose leaves out ([sequences,
   views and walkthroughs](references/sequences-views-walkthroughs.md)).
10. **Walk the catalogue** row by row against the source you read
    ([everything the code shows](#everything-the-code-shows)).
11. **Model the subject a second way** — cut at another level, another set of
    participants, a container drawn whole instead of opened, one flow where
    you had two — and keep the shape whose advantage over the other you can
    state in one line.
12. **Turn the request into checks** and write them down before the payload
    ([evidence rule 4](#evidence-before-a-write)).
13. **Write one payload** carrying the parts, the relationships, the flow, the
    views each reading wants — a `data-flow` view over a flow — and the
    walkthrough an ordering needs, then claim the board it just made when more
    writes are coming ([Writes](#essentials), [Claims](#essentials)).
14. **Read the answer against those checks and look at the picture it draws**
    ([Verification](#essentials)).
15. **Compare a proposal against the variant it came from**
    ([variants](references/variants.md)).
16. **Run `archboard check`** after a vocabulary edit or an answer that
    carried `warnings` ([Vocabulary](#essentials)).
17. **Repeat steps 4 to 16** for each further write the board still needs — a
    flow over parts already drawn, a view a later reading wants, the correction
    the picture showed you.
18. **Read your own board back** with `archboard semantic show`, and spend one
    more write removing what it shows that the board's question does not need
    ([authoring](references/authoring.md) for the removal keys).
19. **Release a claim you took, and report**: the line you kept at step 11, the
    columns you settled at step 7, the catalogue rows you judged not to apply,
    and any question this skill left open ([Claims](#essentials),
    [Open questions](#essentials)).

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
  `as`. Every id is minted, so a new subject of any kind — a view, a flow or a
  beat as much as a node — leaves `id` out. A restated subject replaces its
  previous definition whole, so restate the fields you keep. A relationship
  restated without its `id` is a new relationship, however familiar its ends: to
  change one property of an existing relationship (its traffic, its label),
  restate it with the `id` you read, and never remove it to add it again.
- **Verification.** Read the write's answer back against the checks you wrote
  down before writing (below). When the picture is the deliverable, draw it
  and look at it: `semantic rasterize <board> --out <file.png>` and open the
  PNG, or `semantic render <board> --out <file.svg>` and open the SVG in a
  viewer. Reading the SVG's text is not looking at a diagram. A picture the
  request names goes where it says; one you draw only to look at goes in a
  temporary directory, never into the checkout you are describing. `archboard
check` is for after a vocabulary edit or when an answer carries `warnings`.
- **Open questions.** A question about the product (a field, a selector, what
  a refusal means, what a command accepts) is answered by the references
  below, the generated JSON Schemas under `references/generated/`, and
  `archboard <command> --help`. When none of them answers it, say so in your
  final message, naming the question; that report is how the skill gets the
  answer added.
- **Claims.** For work of several writes, `archboard claim --board <board>
--reason "<campaign>"` first and `archboard release --board <board>` after; the
  reason is what the pane shows the person whose board you took, and a claim
  without one is refused. A claim is on a board the vault already holds, so a
  board you are creating is claimed after the write that makes it. A person can
  take the claim back: your next write is then refused once, nothing is rolled
  back, and you stop and say so.

## Evidence before a write

Reading the right guidance and the right source is not enough: a relationship
is a claim about code, and the failures that recur are claims nobody checked.
Do this in proportion to the request. A rename needs one line of it; a new
board needs all of it.

1. **Find the boundaries on purpose.** Before deciding the parts, look for
   what calls into this code (a server, a scheduler, a shell, a user event in
   a browser, a message consumer), the external libraries and services it
   depends on, the callbacks, hooks, handlers and plugins the application
   registers into it, and where it persists or publishes (a store, a queue, a
   socket, an event bus, a stream). Include the ones the board's question needs and
   leave the rest out deliberately; a boundary you never looked for is an
   omission, one you chose to omit is scope.
2. **Bind to the owner.** A `binding` names the file that implements the
   node's stated responsibility, not a file that imports, registers or calls
   it. A planned part or an implementation unavailable for inspection stays
   unbound. An implementation in another checkout may bind after you inspect
   its owner and register that repository once with `archboard repo add
<path>`, whose answer is the identity a `binding` names. When a node's
   responsibility spans
   files, narrow the responsibility or split the node rather than bind to the
   wrong one.
3. **Prove each relationship and step from source.** For every `edge` and
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
   on it to the child whose body runs. That is where a relationship lands, not
   who takes part in an exchange; a flow's columns are chosen at step 7. For a
   return or a non-call
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
4. **Turn the request into checks.** Before the payload, write down what a
   correct answer must show: the board and the `version` you read; the target
   variant (`semantic edit --variant <id|name>` lands the change on a proposal,
   and a payload `variant` says the same thing — where the two differ the
   command line wins, and the write warns naming both; a write naming neither
   edits the current architecture, so a proposal-only request lands nothing
   there);
   the ids and fields that must survive; and for a view, its exact `grammar`
   and `scope` selectors: naming `edges` isolates those relationships and
   draws no other, while naming `nodes` alone draws every relationship among
   them. After the write, read the answer against that list.

## Everything the code shows

A request names the question, the level and a few names. It does not list the
semantics; knowing the product is your job, and a board that stops at the parts
and calls the request happened to mention leaves out what the code showed you.
Before every write that creates or extends a board, walk this catalogue against
the source you read, in this vocabulary (the grader uses the same words); every
row the source justifies goes in the payload, and your answer says which rows
you used and which you judged not to apply.

| Row            | Lands on                           |
| -------------- | ---------------------------------- |
| `external`     | a node                             |
| `binding`      | a node                             |
| `containment`  | a node (`parent`)                  |
| `relationship` | an `edge`                          |
| `traffic`      | a relationship                     |
| `emphasis`     | a relationship                     |
| `repeat`       | a flow step                        |
| `note`         | a flow step                        |
| `groups`       | a node                             |
| `flow`         | the board, with a `data-flow` view |
| `view`         | the board                          |
| `walkthrough`  | the board, as a beat               |
| `drillDown`    | a node                             |
| `description`  | a node or a relationship           |

What the source shows for each row, and what you author for it:

- `external`. _Shows:_ a caller, library, framework, runtime, shell or hosted
  service this codebase does not own, or a part nobody has built yet. _Author:_
  a node of kind `external`, unbound; a part that does not exist yet is drawn
  and unbound the same way, taking the configured kind the request names for it
  when it names one. Never for a part of this codebase a reader reaches through
  another board.
- `binding`. _Shows:_ the file whose body implements a part's responsibility.
  _Author:_ `binding: { repo, path }` to that file; nothing for a part you could
  not inspect.
- `containment`. _Shows:_ a part defined inside another (a function of a module,
  a method of a class, a child component, a closure inside its factory).
  _Author:_ `parent`.
- `relationship`. _Shows:_ a call, render, read, event, message, dependency or
  publication one body makes to another. _Author:_ an `edge` of the configured
  kind, its `label` the message or mechanism.
- `traffic`. _Shows:_ the forward path one request or event takes at runtime:
  the calls that run on every pass. _Author:_ `traffic` on those relationships
  only (`{}`, or `speed`/`volume` to contrast a hotter path), a call an error
  could skip but a normal pass always makes (the handler every request reaches)
  included; never on teardown or cleanup, an error or exception path, an
  optional hook most passes skip, startup, registration or a one-shot call.
- `emphasis`. _Shows:_ a spine: the path or backbone the board's question is
  about, and the lines that are only context. _Author:_ `emphasis: "hero"` on
  the spine — a third of the relationships, never past half — and `"muted"` on
  the context. A board with a spine and no `hero` at all leaves the reader to
  find it.
- `repeat`. _Shows:_ a loop over a list the source fixes, or a retry limit.
  _Author:_ `repeat` with that count on the step.
- `note`. _Shows:_ a branch and its condition, a data-dependent loop, an
  environment variable, a caveat. _Author:_ `note` on the step.
- `groups`. _Shows:_ a part whose concern is a configured group id in
  `config.yaml` (read them before every write). _Author:_ `groups` on each
  member, explicit, across containers.
- `flow`. _Shows:_ a request that asks for the exchange itself — what happens,
  in what order, for one request, job, interaction or startup — on a new board
  or an existing one. A board asked to describe how something travels through
  the parts is parts, containment and the calls between them
  ([which recipe](#which-recipe)), and owes no flow merely because what it draws
  runs in order. _Author:_ a `flow` and a `data-flow` view over it.
- `view`. _Shows:_ a subset a reader wants alone: one path, one container's
  internals, the two sides of a change. _Author:_ a board `view`.
- `walkthrough`. _Shows:_ a why the code enforces (an ordering, an invariant, a
  lock held around a write). _Author:_ a walkthrough beat whose subjects are the
  parts, relationships or steps it explains.
- `drillDown`. _Shows:_ a part whose internals already have a board
  (`archboard semantic` lists them; check first). _Author:_ `drillDown` on that
  part instead of drawing its parts again, its `kind` the level of the board it
  opens (`system`, `service`, `module`); never a node added only to carry the
  link.
- `description`. _Shows:_ a mechanism a one-line responsibility cannot hold.
  _Author:_ `description` on the node or relationship.

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

Each recipe, and the request it is for:

- [create an architecture diagram](references/create-architecture.md): make a
  new board: parts and their wiring at a level, whatever the subject (a
  service's modules, how a request travels, what starts up).
- [create a sequence diagram](references/create-sequence.md): explain one
  request, job or startup as an ordered exchange: a `flow` with participants and
  steps, on a new board or an existing one.
- [edit an existing board](references/edit.md): change, extend, correct or
  repair what an existing board says.
- [propose and compare a change](references/propose-compare.md): propose a
  change as a variant, compare it, settle its disagreements, or adopt it.
- [answer from a saved board](references/read.md): answer a question from a
  saved board and change nothing.

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

The recipe for the workflow at hand is in [which recipe](#which-recipe); these
are what a branch of one needs on top of it.

- [authoring](references/authoring.md): groups, bindings with branch/commit,
  drill-down, traffic, emphasis, removals and handles, refusals.
- [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md):
  view scopes and grammars, message kinds, repeat/note, walkthrough beats and
  their identity.
- [variants](references/variants.md): what a comparison counts, edge identity,
  flow/step identity, reconciliation and `resolve`, adoption, claims.
- [schemas](references/schemas.md): the exact JSON Schemas of the payloads, the
  persisted document and `config.yaml`; vault setup and installation.
