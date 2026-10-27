---
name: archboard
description: >-
  Diagram real code as archboard semantic boards with the archboard CLI: create
  an architecture diagram (parts, containment, relationships), a sequence
  diagram (an ordered exchange) or a flowchart (a flow's decisions and loops)
  from source, edit an existing board, propose an
  architectural change as a variant and compare it, bind parts to code, render
  SVGs and PNGs, record a walkthrough to a narrated video such as a pull
  request's for its reviewers. Use when asked to document, explain or change a
  system's architecture, a request or data flow, or a board in the vault.
---

# Archboard

For an authored vault with `model.json`, read [canonical models](references/canonical-models.md) before working with canonical architecture.
Legacy vaults keep the board workflow below until explicit migration.
For legacy inventory, identity choices, preview, or owner-authorized cutover, read [legacy migration](references/legacy-migration.md) before using `model inventory`, `model plan`, `model read --preview`, or `model migrate`.

An agent states what an architecture IS; archboard draws it. A **board** is one
document in the vault holding a family of **variants** (the current architecture,
when anything it describes is built, and proposals). There is no layout to author: every picture is
rendered from meaning. Fix a semantic error in that meaning; when the saved
meaning matches the source and the picture does not, report a renderer defect.

A board holds two sorts of meaning:

- **Parts and relationships**: nodes (with a configured `kind`, a clear short
  `responsibility`, optional `parent` containment, `groups`, a code `binding`)
  and directed relationships (`edges`) between them.
- **Flows**: one request, job or event as ordered steps between the parts it
  names as participants. A step is a message, a decision with labelled
  alternatives, or a loop. A flow lives on the same board as the parts it
  moves between.

Board-owned `views` read that meaning in one of three grammars:
`architecture`, `sequence` and `flowchart`. [Which view](#which-view) says
which one answers a question.

Use a **variant** for a proposed evolution of the same diagram, and a separate
**linked board** for a different subject or level of detail.

## Which view

Decide the reading before you decide what to write, because the reading
decides whether the board needs relationships, a flow, or both.

- **Architecture view**: the question is which parts exist and which depend on
  or use which ("what is this made of, what talks to what"). It draws
  relationships: at most one between two parts for each kind, never one for
  each call. A view whose cards would have no lines between them is the wrong
  reading, and so is a view whose lines would tell a numbered story.
- **Sequence view**: the question is what happens, in what order, between
  several parts, for one request, job or event ("what happens when X"). It
  draws one flow: the participants in columns and every message, returns
  included. Each call between two parts is a step of a flow, not a further
  relationship.
- **Flowchart view**: the question is the logic: which path is taken, under
  which condition, and how often it repeats ("how does X decide", "what if Y
  fails"). It draws one flow's steps as boxes and its decisions as diamonds.
  Use it when the flow's decisions or loops matter more than who talks to
  whom. The same flow can have a sequence view and a flowchart view.

The quick test: if the answer is a sentence with "then", it is a flow, read as
a sequence. If it has "if" or "until", the flow needs a decision or a loop,
read as a flowchart, and its sequence view draws them as `alt` and `loop`
frames. If it has neither, it is architecture.

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
   it ([which recipe](#which-recipe)), and **decide which views answer the
   question** ([which view](#which-view)).
2. **Claim a board that already exists** when the work runs to several writes
   ([Claims](#essentials)).
3. **Read the configured vocabulary and the boards the vault already holds**
   ([Vocabulary](#essentials), [Reads](#essentials), the [`drillDown` row](#everything-the-code-shows)).
4. **Gather the source context**: read the code the request names and follow
   it out to the boundaries [evidence rule 1](#evidence-before-a-write) lists.
   For architecture nobody has built, the request and the documents it names
   are that context ([planning](#planning-what-nobody-has-built)).
5. **Decide the parts**: the level, the subject (at a dozen or more cards, look
   for a set of like parts to cut into one card that opens a board of its own,
   [create an architecture diagram](references/create-architecture.md)), which
   parts are defined inside which as children, which belong to another
   codebase, whether any of it is built (a part nobody has built is a proposal,
   drawn on a draft), and each one's `binding`
   ([evidence rule 2](#evidence-before-a-write)).
6. **Map the relationships**, one line of evidence per `edge`: the file and
   symbol that prove it, written as its `anchor`, or for an intended mechanism
   the sentence that states it ([evidence rule 3](#evidence-before-a-write)).
7. **For a sequence, choose the columns before the messages**
   ([create a sequence diagram](references/create-sequence.md)).
8. **Order the exchange**: the participants in column order, and every message
   between them in the order the source runs them, returns included.
9. **Read the source again for what a flow shows only on a second pass**: a
   call a participant makes on itself (one step with it at both ends, never a
   call between two parts that each have a column), a
   count the source fixes (that step's `repeat`), and each `if`, `switch`,
   early return or `catch` that changes which messages follow (a decision) and
   each loop whose length the data decides (a loop)
   ([create a sequence diagram](references/create-sequence.md#when-a-flow-branches-or-repeats)).
   For a plan, read the request again the same way: a count it states is a
   `repeat`, and a condition it states is a decision.
10. **Walk the catalogue** row by row against the source you read, or for a
    plan against what the request states
    ([everything the code shows](#everything-the-code-shows)).
11. **Model the subject a second way** — cut at another level, another set of
    participants, a container drawn whole instead of opened, one flow where
    you had two — and keep the shape whose advantage over the other you can
    state in one line.
12. **Turn the request into checks** and write them down before the payload
    ([evidence rule 4](#evidence-before-a-write)).
13. **Write one payload** carrying the parts, the relationships, the flow, the
    views you decided at step 1 — a `sequence` view over a flow, and a
    `flowchart` view where its logic is the question — and the
    walkthrough an ordering needs, then claim the new board when more writes are
    coming ([Writes](#essentials), [Claims](#essentials)).
14. **Read the answer against those checks and look at the picture it draws**
    ([Verification](#essentials)).
15. **Compare a proposal against the current variant**
    ([variants](references/variants.md)); on a board nobody has built, against
    the draft it came from. The current variant, and the first draft of a board
    nobody has built, have nothing to compare against: say so instead.
16. **Run `archboard check semantics`** after a vocabulary edit or an answer that
    carried `warnings` ([Vocabulary](#essentials)), and
    `archboard check code` after a write that adds or changes an anchor or a
    binding's `symbol` ([Verification](#essentials)). `archboard check` runs
    both, and `check embeds`, which says which board pictures that the
    repository keeps are outdated; `archboard check --fix` draws them again
    ([a picture in documentation](references/sequences-views-walkthroughs.md#a-picture-in-documentation-that-stays-current)).
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
  write is refused, repair the payload from what the refusal says, never by
  editing the vault or inventing an id; a second
  attempt needs new evidence, not a retry. When no supported command can do
  what was asked, leave the board valid as it is and report the requirement
  you could not meet.
- **Environment.** `ARCHBOARD_URL` names the Archboard server, which defaults
  to port 3000. Every `archboard` command reads it. If nothing
  answers, the server starts itself. The server needs no vault to start. Inside
  the archboard checkout, `./bin/archboard` stands in for `archboard`.
- **Which vault a command uses.** A command finds its vault from the directory
  it runs in, as git finds a repository. Inside a git checkout, it uses the
  `.archboard/vault` at the checkout root, from any directory in the checkout.
  If the checkout has no such vault, the command refuses with `VAULT_NOT_FOUND`
  (exit 2). It never uses a vault above the root. Another repository can keep
  the boards of this checkout's code. If a vault that this machine knows holds
  such boards, the refusal names its directory and those boards. Run the
  command again with `-C` and that directory. Do not create a vault in the
  checkout for this. Outside any checkout, it
  uses the `.archboard/vault` of the nearest enclosing directory. If there is
  none, it refuses. `-C <dir>` starts the search at `<dir>` and applies the same
  rule. The commands that call a vault take it: `semantic`, `check`, `claim`,
  `release` and `browser show`. Write
  `archboard -C <dir> semantic show x` or `archboard semantic show x -C <dir>`.
  `-C` changes only where the vault is found. `--input` and `--out` still
  resolve against the working directory. These commands take no `-C` and need
  no vault: `start`, `stop`, `status`, `repo`, `install-skill`,
  `browser open`, `browser panes`, `browser close` and `semantic replay`. A JSON answer of a
  command that takes `-C` carries `vault: {path, origin}`. The origin is `-C`
  or `working-directory`. Read it to make sure that you wrote the
  vault you meant. If this machine does not know the checkout or untracked
  vault, the first command in it registers it. That answer carries
  `vault.registered`, and one line goes to stderr. No environment variable names
  a vault: give `-C`, or run the command in the directory that holds it. A thread of the Archboard workbench receives each
  board's vault directory in its board context. Pass it as `-C`. A workhorse
  works in the checkout of its vault. The voice coordinator works in a
  directory that holds no vault, so its commands without `-C` are refused.
- **Where the user reads.** One Archboard server serves every vault on the
  machine, and the user reads them all in one browser app at its address. The
  navigator lists every repository that has a vault, each with the boards of
  its chosen checkout. A link to one board is `/?paneA=<board>&repoA=<repository>`.
  The repository is its identity, such as `github.com/acme/shop`, or an
  untracked vault's registry name, and never a path.
- **Showing your board.** `archboard browser show <board> --pane <spec>` from
  a checkout that is not the chosen one of its repository, such as a worktree,
  makes your checkout the chosen one for the whole machine, before it shows the
  board. Every pane of that repository then reads your checkout. The answer
  then has `chose: {repository, checkout, replaced}`. `replaced` is the
  checkout that the user read before. Tell the user that the app reads your
  checkout now. A show from the chosen checkout has no `chose`. The only other
  board command that changes the choice is a finished `semantic move` into a
  checkout that is not chosen, and its answer has `chose` too. A show never
  changes the conversation that the person's agent dock shows: only the person
  changes that, in the page. `archboard browser panes` gives each pane its
  `repository`, its `checkout` and `own`. `own` is true for a pane that shows
  the vault of the directory that you run the command in.
- **Vocabulary.** Read the `configurationFile` that `archboard semantic config`
  names (`<vault>/.archboard/config.yaml`) once: it
  defines the board `levels`, the `nodeKinds`, the `relationshipKinds` and the
  `groups`. Use those keys; a new unknown key is refused. Extend the file only
  when the request is about vocabulary ([schemas](references/schemas.md)
  links its JSON Schema); then run `archboard check`.
- **Reads.** `archboard semantic show <board>` prints the whole family: every
  variant with its `lifecycle`, `parent`, `content` and the board `version`.
  `archboard semantic` lists the boards. `archboard semantic compare <board>
  [--variant <id|name>] [--against <id|name>]` reads one variant against the
  current one, or on a board nobody has built the one it came from
  ([answer from a saved board](references/read.md) says what it reports).
- **Writes.** `semantic new` needs `--doing "<present-tense line>"`. Every
  later write (`edit`, `branch`, `resolve`, `adopt`, `rename`) also needs
  `--expect-version <n>` with the version you read; a moved board refuses the
  write (exit 5) and you read again and redo the change on what is there now.
  One requested change is one batch. The answer to a write is the saved family
  with its new `version` and every minted id, so take ids and the version from
  it rather than reading again. `semantic move <board> --to <dir>` moves a
  board, with every variant, to another repository's vault
  ([edit](references/edit.md#moving-a-board-to-another-repository)). A person
  can make the same move from the pane's Move board control in the browser.
- **References.** Inside a payload, name a node by its `name` or its `id`; a
  relationship or step, which has no name, by `id` or by a same-write handle
  `as`. Every id is minted, so a new subject of any kind — a view, a flow or a
  beat as much as a node — leaves `id` out. A restated subject replaces its
  previous definition whole, so restate the fields you keep. A relationship
  restated without its `id` is a new relationship, however familiar its ends: to
  change a continuing relationship (including its ends, kind or several
  properties), restate it with the `id` you read. Explicit `removeEdges` plus
  an idless addition declares a replacement.
- **Verification.** Read the write's answer back against the checks you wrote
  down before writing (below). When the picture is the deliverable, pick its
  view from `semantic views <board>`, which lists what each view draws at a
  variant ([views](references/sequences-views-walkthroughs.md)), then draw it
  and look at it: `semantic rasterize <board> --out <file.png>` and open the
  PNG, or `semantic render <board> --out <file.svg>` and open the SVG in a
  viewer. Reading the SVG's text is not looking at a diagram. A picture the
  request names goes where it says; one you draw only to look at goes in a
  temporary directory, never into the checkout you are describing. A picture
  that a document embeds is drawn into its Git checkout with `--track`, so its
  board lists it, and committed, so `archboard check` there says when it is outdated
  ([a picture in documentation](references/sequences-views-walkthroughs.md#a-picture-in-documentation-that-stays-current)).
  On macOS, Chromium commands detect the host sandbox before starting a browser.
  If startup reports a macOS sandbox, request approved execution outside it for
  the same command. In Codex, use `sandbox_permissions="require_escalated"`.
  Wait for approval before retrying. This applies to rasterization, recording,
  and replay. SVG rendering needs no Chromium process.
  `archboard check` warns `NODE_UNCONNECTED` for a node with no connection to
  another node in a current or draft variant. Relationships, flow messages and
  containment count. A self call or presentation membership does not count.
  Add the missing connection, move the node to a board where it connects, or
  delete it.
  The check has no time limit. Cancel the command to stop waiting. The lines of
  each check start with its times, and the JSON part of each check carries those
  times in its `timings`.
  `archboard check code` holds every anchor and bound `symbol` of each
  board's current variant to the files on disk, or to the code of the branch or
  commit that its binding names when the checkout does not have it out. That
  code is read from Git without a checkout, in every check (anchors, bound
  paths and symbols, relationships, module interfaces). A language server
  reads files on disk, so there a use that no import resolves is not resolved
  (`ref-without-language-server`). A draft reads every part of a repository at
  its own branch, which holds the layers below it, except a part that pins a
  branch that one does not hold; a relationship whose ends are then read at
  different code is skipped (`refs-differ`). A ref the checkout cannot
  resolve is skipped (`ref-not-checked-out`, naming the ref). A file that is not there or
  does not hold the symbol is a warning that names its part, relationship or
  step, and exits 1. Repair the anchor or binding it names. A variant's
  document reference whose file is not at the version it names is
  `DOCUMENT_PATH_MISSING`. A binding or anchor
  into the repository whose checkout holds the vault is read in that checkout
  (a worktree reads its own files); one into any other repository is read in
  its chosen checkout. Code that one bound
  part runs in another, with no relationship between them, is a warning on the
  part it reaches (`RELATIONSHIP_UNDRAWN`): draw the relationship. A
  relationship with no anchor that the code runs the other way or does not show
  is information ([evidence](references/authoring.md#evidence-for-a-relationship)). For a draft whose
  code is written, add `--variant <draft>`. For a stack of pull requests, add
  `--every-draft`: each draft is read against its own branch, and a bound part
  that a draft dropped while its code is still on that branch is
  `INHERITED_PART_DROPPED` ([stack](references/variants.md#a-stack-of-pull-requests)). What it could not read (a
  repository this machine has not registered, a file Git ignores) is listed
  as skipped, never as a finding. If a checkout has no configured language
  server for a language, the answer says `language-server-missing`, and the
  check matches the names of that language by spelling only. To configure a
  server, read [setup](references/setup.md). Configure one only for a repository
  that you work in, because a configured server runs the code of that
  repository, as an editor does.
- **Open questions.** A question about the product (a field, a selector, what
  a refusal means, what a command accepts) is answered by the references
  below, the generated JSON Schemas under `references/generated/`, and
  `archboard <command> --help`. When none of them answers it, say so in your
  final message, naming the question; that report is how the skill gets the
  answer added.
- **Claims.** For work of several writes, `archboard claim --board <board>
  --reason "<campaign>"` first and `archboard release --board <board>` after; the
  reason is what the pane shows the user whose board you took, and a claim
  without one is refused. A claim is on a board the vault already holds, so a
  board you are creating is claimed after the write that makes it. A user can
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
   it. An implementation unavailable for inspection stays unbound. A planned
   part, which is only ever on a draft, binds to the path its code is to live
   at when the request states one, and stays unbound when it does not. Add
   `branch` when the code lives only on a branch that is not the default one,
   such as the branch of a pull request, and `commit` when the node describes
   one exact version; leave both out so the binding follows the default
   branch. An implementation in another checkout may bind after you inspect
   its owner and register that repository once with `archboard repo add`,
   whose answer is the identity a `binding` names. When the node stands for
   one definition in a file that holds others (a function of a module, a class
   or one of its methods, a component), name it in `symbol`, spelled as the
   language spells a qualified name (`Ledger.post`). When a node's
   responsibility spans files, narrow the responsibility or split the node
   rather than bind to the wrong one.
3. **Prove each relationship and step from source.** For every `edge` and
   every flow step keep a one-line record: `from` → `to`, the semantic kind,
   and the source file and function or symbol that prove the mechanism. Write
   the file and symbol into the payload as that subject's `anchor`:
   `{ "repo", "path", "symbol" }`, all three required, `repo` the identity a
   `binding` would use and no line number. The symbol is the name in that
   file that proves the mechanism: the function it calls, the component it
   renders, the value it passes, the event it emits. Restate a subject with its
   `anchor`, or the write drops it and says so. For a
   call (a function or method call, a hook, a component rendering another),
   `from` is the part whose body makes it and `to` is the part whose body runs,
   inside its `parent`. A board is the container of its own subject: no part
   stands for the board itself, and the parts of its subject are root parts
   beside its callers and dependencies. A module inside that subject is drawn
   as a container: a part with children, whatever its kind (a module with its
   functions, a class with its methods, a component with the components it
   defines). Its callers stay outside it. A call from outside lands on the
   entry point that the caller names: the exported function, public method,
   rendered component or handled route. The calls behind that entry point
   land inside the container, on the helpers that do the work. A
   relationship that ends on the container itself makes no entry point. Keep
   it for a dependency on the whole module, where the source names no part of
   it. When an existing part gets children, move each relationship that landed
   on it to the entry point that its caller names. That is where a
   relationship lands, not who takes part in an exchange; a flow's columns are
   chosen at step 7. For a return or a non-call relationship, state the
   directional claim in words and make the endpoints follow it (for example, A returns to B, A reads from B, A emits an event B
   handles, A resolves a promise B awaits, A passes B a callback or props, or
   A depends on B). Sibling calls are not a chain: when `apply()` calls
   `validate()` and then `persist()`, the source shows two relationships from
   `apply`, and none from `validate` to `persist`, whatever order they run in.
   For a sequence, check each step's order, return, branch and repeat count
   against the source as well (a branch as a decision, a loop of unknown
   length as a loop, a count the source fixes in `repeat`;
   [create a sequence diagram](references/create-sequence.md)).
4. **Turn the request into checks.** Before the payload, write down what a
   correct answer must show: the board and the `version` you read; the target
   variant (a write naming none edits the variant the board's name opens: the
   current architecture, or the draft of a board nobody has built; so on a
   board with a current variant a proposal-only request lands nothing there;
   [propose and compare](references/propose-compare.md) and
   [edit](references/edit.md) say how a write names a proposal); the ids and
   fields that must survive; and for a view, its exact `grammar` and `scope`
   selectors: naming `edges` isolates those relationships and
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

| Row            | Lands on                          |
| -------------- | --------------------------------- |
| `external`     | a node                            |
| `binding`      | a node                            |
| `containment`  | a node (`parent`)                 |
| `relationship` | a relationship (`edge`)           |
| `traffic`      | a relationship                    |
| `emphasis`     | a relationship                    |
| `repeat`       | a flow step                       |
| `note`         | a flow step                       |
| `groups`       | a node                            |
| `flow`         | the board, with a `sequence` view |
| `view`         | the board                         |
| `walkthrough`  | the board, as a beat              |
| `drillDown`    | a node                            |
| `description`  | a node or a relationship          |

What the source shows for each row, and what you author for it:

- `external`. _Shows:_ a caller, library, framework, runtime, shell or hosted
  service this codebase does not own. _Author:_ a node of kind `external`,
  unbound. Never for a part of this codebase a reader reaches through another
  board, and never for a part nobody has built yet: that is a proposal, drawn
  with the configured kind it will have on a draft
  ([planning](#planning-what-nobody-has-built)).
- `binding`. _Shows:_ the file whose body implements a part's responsibility.
  _Author:_ `binding: { repo, path }` to that file, with `symbol` when the part
  is one definition among others in it
  ([evidence rule 2](#evidence-before-a-write)).
- `containment`. _Shows:_ a part defined inside another (a function of a module,
  a method of a class, a component defined inside another, a closure inside its
  factory). _Author:_ `parent`. A module that the board describes is a
  container, bound to its directory or file. Its children are the entry
  points that its callers name and the hidden parts behind them, and its
  callers stay outside it ([evidence rule 3](#evidence-before-a-write)). An
  instance a part holds or renders is not its child: an object in a field, a
  value a closure captures, a dependency a function or component is handed (a
  constructor argument, props, context) or builds and keeps is a
  `relationship` from the holder, even when the request says the holder owns
  it.
- `relationship`. _Shows:_ a call, render, read, event, message, dependency or
  publication one body makes to another. _Author:_ an `edge` of the configured
  kind, its `label` the message or mechanism, its `anchor` the file and symbol
  that prove it ([evidence rule 3](#evidence-before-a-write)).
- `traffic`. _Shows:_ the forward path one request or event takes at runtime:
  the calls that run on every pass. _Author:_ `traffic` on those relationships
  only (`{}`, or `speed`/`volume` to contrast a hotter path), a call an error
  could skip but a normal pass always makes (the handler every request reaches)
  included; never on teardown or cleanup, an error or exception path, an
  optional hook most passes skip, startup, registration or a one-shot call.
  Traffic is authored intent chosen from what the source runs per request,
  never a measurement; a still picture shows the pulses where they are at time zero
  and proves nothing about motion.
- `emphasis`. _Shows:_ a spine: the path or backbone the board's question is
  about, and the lines that are only context. _Author:_ `emphasis: "hero"` on
  the spine — a third of the relationships, never past half — and `"muted"` on
  the context. A board with a spine and no `hero` at all leaves the reader to
  find it.
- `repeat`. _Shows:_ a loop over a list the source fixes, or a retry limit.
  _Author:_ `repeat` with that count on the step.
- `note`. _Shows:_ an environment variable, a caveat, a detail the label
  cannot carry. _Author:_ `note` on the step. A branch or a loop is a step of
  its own, never a note (the `flow` row).
- `groups`. _Shows:_ a part whose concern is a configured group id in
  `config.yaml` (read them before every write). _Author:_ `groups` on each
  member, explicit, across containers.
- `flow`. _Shows:_ a request that asks for the exchange itself — what happens,
  in what order, for one request, job, interaction or startup — on a new board
  or an existing one; a board owes no flow merely because what it draws runs in
  order ([which recipe](#which-recipe)). _Author:_ a `flow` and a `sequence`
  view over it, and a `flowchart` view as well when its decisions or loops are
  the question ([which view](#which-view)). An `if`, a `switch`, an early
  return or a `catch` that changes which messages follow is a `decision` step:
  the condition as its `question`, and one labelled alternative for each
  outcome, holding the steps that run on it. Steps that run again for each item
  of a list, or until a condition holds, are a `loop` step with that
  `condition`
  ([when a flow branches or repeats](references/create-sequence.md#when-a-flow-branches-or-repeats)).
- `view`. _Shows:_ a subset a reader wants alone: one path, one container's
  internals, the two sides of a change. _Author:_ a board `view`.
- `walkthrough`. _Shows:_ a why the code enforces (an ordering, an invariant, a
  lock held around a write). _Author:_ a walkthrough beat whose subjects are the
  parts, relationships or steps it explains.
- `drillDown`. _Shows:_ a part whose internals already have a board
  (`archboard semantic` lists them; check first). _Author:_ `drillDown` on that
  part instead of drawing its parts again, its `kind` the level of the board it
  opens (`system`, `service`, `module`) ([keep it true](#keep-it-true)). A board
  in another repository adds `repo`, the identity a binding names
  ([drill-down](references/authoring.md#drill-down)).
- `description`. _Shows:_ a mechanism a one-line responsibility cannot hold.
  _Author:_ `description` on the node or relationship.

A row the source does not support stays out: an added relationship without a
line of evidence is a wrong board, not a complete one.

`from`, `to`, `kind`, `label` and `anchor` mean the same on a message and a
relationship, and a message takes nothing else but `note` and `repeat`: `emphasis` or `traffic`
on one is refused by key name over the step it sits on
(`→ at flows[0].steps[0]`), so move it onto the relationship between the same
parts rather than dropping it from the payload.

## Planning what nobody has built

Whether an architecture exists is a fact about a variant, never about a node.
The current variant says what is built; a draft is a proposal. So a part nobody
has built never goes on the current variant, however the request words it:

- **A change to something that exists** is a proposal on the existing board:
  branch a draft and draw the new parts there
  ([propose and compare](references/propose-compare.md)).
- **An architecture nobody has built** is a board with no current variant:
  create it with `"lifecycle": "draft"` in the `semantic new` payload. Its first
  variant is a draft, the board designates no current variant, and its bare
  name opens that draft, so `render`, `edit` and `branch` naming no variant act
  on it. Asking for `--variant current` there is refused: nothing is built.

What stands in for a source line is the sentence that states the intent: in
the request, or in a design document it names. When a draft draws a design
document, an ADR or a task, name each in the draft's `documents`, at the
commit you drew from ([documents](references/variants.md#documents-a-variant-draws)).
To find the draft that draws a design, read the drafts' `documents` in
`semantic show`. Keep the same one-line record
per relationship and step ([evidence rule 3](#evidence-before-a-write)), citing
that sentence where you would cite a symbol. A sentence is not an anchor: give
a planned relationship an `anchor` only where the request names the code (the
function the call will be in), and put the intent in its `description`
otherwise. Leave out a mechanism nothing states: a plan that invents how a part works is as wrong as a board that
invents a call. Bind a planned part only to a path the request states; a
binding on a draft may name a file that does not exist yet, and `archboard
check` does not report it until the variant is adopted. When the code is built
and the request asks, adopt the draft: that is the moment the architecture
starts existing, and nothing becomes history
([variants](references/variants.md#adoption)).

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
  steps, on a new board or an existing one. It also covers a flow that
  branches or repeats, and its flowchart view.
- [edit an existing board](references/edit.md): change, extend, correct or
  repair what an existing board says, or give a board or a variant a better
  name.
- [propose and compare a change](references/propose-compare.md): propose a
  change as a variant, compare it, settle its disagreements, or adopt it.
  Competing drafts of one interface follow its
  [design it twice](references/propose-compare.md#design-it-twice): their
  measures side by side, and the drafts not kept shelved with a reason.
- [answer from a saved board](references/read.md): answer a question from a
  saved board, including which of its parts change most often in Git, and
  change nothing.

A new board is the architecture recipe first, whatever the request calls its
subject: a board that describes how a request travels is parts, containment
and the relationships between them, and the sequence recipe is read on top of
it when the request asks for the exchange itself or for its logic
([which view](#which-view)). A request that combines
workflows (extend the vocabulary, then create; link a detail board, then
propose) reads each recipe it needs, in the order the request runs them. A
request for a narrated video makes or finds the board with its recipe, then
[records a walkthrough](references/sequences-views-walkthroughs.md#recording-a-walkthrough);
a video for a pull request's reviewers follows
[a pull request's recording](references/sequences-views-walkthroughs.md#a-pull-requests-recording),
and an explanation for somebody new to the code follows
[a newcomer's walkthrough](references/sequences-views-walkthroughs.md#a-newcomers-walkthrough).

## Keep it true

- Reuse an existing detail board: link it with `drillDown` on a part the board
  draws anyway, never duplicating its parts. A node whose only reason to exist
  is the link is a button, and a diagram has no buttons. `archboard check` warns
  `SHARED_SYMBOL` when two parts bind the same symbol in the same file, on one
  board or two, unless one of them drills down to the board of the other.
- Use the configured vocabulary and levels; extend `config.yaml` only when the
  request is about vocabulary ([Vocabulary](#essentials)).
- Fewer, truer parts: every node has a responsibility the source supports.
- Give a board's subject structure. A board opens on its overview: the root
  parts, with every container closed. The board is the container of its
  subject, so never add a part that stands for the board itself. If the subject holds more than about a dozen
  parts, gather them into a few containers. Each container has a
  responsibility that the code supports, never a box for layout, and binds to
  the folder that holds its parts when the code has one.
  Add a view that opens each container. If its parts have no relationship
  between them, the view also names the parts outside the container that they
  work with, so that it draws lines ([which view](#which-view)). `archboard check` warns
  `OVERVIEW_CROWDED` when an overview draws more than 15 parts or 25 lines.
- Draw one relationship between two parts. It says that one part needs or uses
  the other, and its kind says how. The individual calls between them, in their
  order, are steps of a flow that a `sequence` view draws. A second
  relationship between the same two parts is a call, not a relationship.
- Never draw a relationship between a container and a part inside it. The
  nesting already says that the container holds the part. A call inside a
  container starts at the part that makes it and ends at the part that runs
  it. `archboard check` warns `CONTAINER_LINE_TO_OWN_PART` on such a line.

## When to read more

The recipe for the workflow at hand is in [which recipe](#which-recipe); these
are what a branch of one needs on top of it.

- [authoring](references/authoring.md): groups, bindings with branch/commit,
  drill-down, traffic, emphasis, removals and handles, refusals.
- [setup](references/setup.md): if the check says `language-server-missing` for a
  repository that you work in, read it. It configures a language server, and it
  says what a configured server runs and which TypeScript the check runs.
- [sequences, views and walkthroughs](references/sequences-views-walkthroughs.md):
  view scopes and grammars, message kinds, decisions and loops, repeat/note, a
  picture in documentation that `archboard check` keeps current, walkthrough beats and
  their identity, recording a walkthrough to a narrated video, and rendering a
  recording's kept talk again.
- [variants](references/variants.md): the documents a variant draws, what a
  comparison counts, edge identity,
  flow/step identity, reconciliation and `resolve`, adoption, claims.
- [schemas](references/schemas.md): the exact JSON Schemas of the payloads, the
  persisted document and `config.yaml`; vault setup and installation.
