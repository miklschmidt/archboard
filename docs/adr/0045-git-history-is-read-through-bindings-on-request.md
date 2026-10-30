---
status: accepted
---

# Git history is read through bindings, on request, and never stored

TASK-369.01 tracks this decision, accepted on 2026-10-06 after an independent
review. It serves TASK-369, its subtasks TASK-369.02
to TASK-369.07, and Proposal 3 of `docs/design/design-checks.md`.

TASK-369.04 amended this ADR on 2026-10-06. A flow step joins two coupled
parts, and a container counts as at an end inside it. The amendment after the
section on hotspots and change coupling gives the reasons.

TASK-448 amended this ADR on 2026-10-07. Locality and footprint now use bound
declarations when the code-facts adapters resolve them.

Amended by TASK-526.01 (2026-10-24): behind is read by
`archboard check code`, and by `archboard check` and `archboard check all`,
which run the code check. The plain `archboard check` is now
`archboard check semantics`, the check that the canvases poll. Behind stays
information and never fails the check.
[ADR 0057](0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md)
decides the split.

[ADR 0059](0059-a-chosen-design-question-lights-its-answer.md) (TASK-537.02)
amends the section "Derived on request, never stored, never drawn": a design
question that a person chose can light the subjects that it names. The reading
itself still shows only in words.

The history lens maps commits through bindings to give four readings.
A board is behind its code by the commits that changed its parts after the
board last changed. A footprint says what a branch changed, against what its
proposal named. Hotspots say which parts change
often, and change coupling says which parts change together. `CONTEXT.md`
defines the four terms and large commit. This ADR decides how the lens reads
Git and where each reading answers.

The measurements of 2026-09-29 (`048312ee`) shaped it. Board viewer was 10
commits behind its bound files. Architecture painter and Sequence painter
changed together in 6 commits, and no relationship joins them. Two traps showed
up. A part that drills into its own board and binds a whole directory adds
hundreds of commits. Commits of 50 to 864 files make Claims and Panes look
coupled.

## A commit changes a part through its bound files

A part's bound files are the file that its binding names, or every file below
the directory that its binding names. If a commit changes one of a part's
bound files, it changes the part. Git records files, so the mapping needs no
parser and works in every language, infrastructure and Nix included.
Behind keeps this path mapping. Locality and footprint use the declaration
mapping below when a binding names a symbol.

A `.csproj` binding names every file below its project directory, as the code
check reads it. Both readings use the same binding file selection. A change
to project source or settings counts even when the project file stays unchanged
(TASK-436.13).

The mapping follows renames. A commit that renames a bound file changes the
part, and the commits before the rename count under the former path. Git's own
rename detection decides what a rename is.

A merge commit counts for nothing of its own. The commits that it brings in
count.

A large commit is a commit that changes more than 30 files, bound or not. The
number is code-maat's default for the largest change set that it counts
(`--max-changeset-size`).

The lens reads the current variant, because only the current variant says that
its architecture is built (ADR 0031). `semantic locality` and
`semantic footprint` read a named draft with `--variant`, as the code check
does. Behind never reads a draft. The lens never reads a historical or a
shelved variant.

The lens skips these parts:

- A part with no binding.
- A part that carries a drill-down, upward, downward or sideways. The board it
  opens carries its history. Archboard server binds its Semantic renderer card
  to a whole directory, and counting that card adds 259 commits.
- A part bound into a repository that this machine has not registered.
- A part pinned to a branch or a commit that its checkout does not have out.

A skipped part is in no count and in no list of a reading. The answers of
`semantic locality` and `semantic footprint` list the parts that they skipped,
with the reason. A part that the lens did not read must never look like a part
that no commit changed.

## Symbols narrow locality and footprint

Locality and footprint share one declaration mapping (TASK-448). The existing
code-facts adapters read immutable Git sources before and after each commit.
A commit counts when the bound declaration changes its source text or file path.
An addition or deletion counts too. An absent declaration before its creation
counts for nothing. Unrelated declarations in the same file do not count.

Every language adapter can supply declaration ranges through this same source
reader. The reader never uses uncommitted checkout files. Unsupported formats,
unparsed code, and ambiguous definitions use path-wide fallback. A symbol that
no revision resolves also uses path-wide fallback. Each listed part reports
`attribution.mode`: `symbol`, `path`, or `mixed`. `symbol` means declaration
precision throughout the reading. `mixed` means that some revisions resolve
the declaration and others need fallback. It does not require a changed
declaration in the range. `path` means path-wide attribution throughout.
The `symbol` field names the bound symbol. The `fallback` field groups commit
ids by reason: `unsupported` or `unresolved`. A binding without a symbol keeps
path mapping.

A Terraform binding keeps its root-module path and complete module address.
Local module calls resolve against each revision, including nested calls and
shared definitions outside the root directory. A shared definition change
counts for every bound instance that reads it. Remote modules remain unsupported.
The reader follows Git file renames and reads deleted declarations from parents.
It does not infer identity between renamed symbols.

Coupling excludes duplicate declaration ownership. Distinct resolved symbols
can pair even when their bound paths overlap. Aliases of a shared definition
cannot pair. Path-wide attribution keeps the existing overlap exclusion.
Locality still excludes large commits. Footprint still keeps and marks them.

## Each repository is read at the HEAD of its checkout

The lens reads each repository in the checkout that the checkout registry
names for it, at that checkout's HEAD. It never fetches. A ref resolves only
from what the checkout already has. The lens answers about the code that this
machine has, which is the code that "open the code" opens.

A repository with no registered checkout stays silent: its parts get no
diagnostic, as `BINDING_PATH_MISSING` gives them none. The answer of
`archboard check code` only says that it did not read them. So a reader
never takes them for parts that no commit changed.

A binding can be pinned to a branch or a commit (TASK-311). If its checkout has
that ref out, the lens reads the part. If the checkout has another ref out, the
lens skips the part and names both refs. This is the match that decides where
the code of the part opens. A pin says that the part describes the code at that
ref, and the commits on another ref say nothing about it.

The repositories of one vault share no commits. So change coupling pairs only
two parts bound into one repository. The next section says how behind carries
the commit that it counts from into each repository.

## A board is behind by the commits after its last change

A board's last change is the last commit that changed its current variant. The
board is behind its code by the commits that changed a part's bound files after
its last change.

The lens finds the last change in the board file's own Git history. It walks
the commits of the board file, newest first, and follows the renames of the
file. It stops at the first commit that changed the current variant. In that
commit, another variant became current, or the current variant itself changed.
To find a change, the lens compares the variant with its state before the
commit. A part, a relationship, a flow or a step with the comparison status
added, changed or removed is a change. The commit that created the board
changed it.

So an adoption counts, and so does an edit in place that changes a part, a
relationship, a flow or a step. A binding is part of its node, so a new binding
counts. A draft edit, a shelving, a rename, a change to the views, a
walkthrough edit and a migration write do not count. None of them says
anything new about whether the parts match the code. A walkthrough explains the
architecture and changes none of it, and a change to its words alone badges no
part (ADR 0023). If a walkthrough edit counts, a walkthrough that an agent
writes for a pull request recording hides the commits of that pull request.

Historical board bytes pass through the board store's pure decoder, which
applies its registered schema migrations in memory and validates the result.
It reads no vault file and persists nothing. A schema-only migration commit
therefore compares equal to the old document's meaning (TASK-436.14).

The last change carries into each bound repository in one of two ways:

- If the checkout has the commit, the board is behind by the commits on its
  HEAD that are not in the history of that commit. A vault in the repository
  that it describes, as `.archboard/vault` is here, reads that repository this
  way. A commit that carries a board change and its code together then counts
  for nothing.
- If the checkout does not have the commit, the board is behind by the commits
  on its HEAD that were committed after the time of that commit. A vault in a
  repository of its own reads the other repositories this way. Time is the
  only order that two repositories share.

If the board file holds a change to its current variant that no commit has
yet, the last change is now, and no commit counts. A new board file that Git
does not track yet, and does not ignore, is such a change.

If the vault is not in a Git repository, or Git ignores the board file, the
lens cannot find the last change. The answer says so, and it never reports zero
commits for such a board. `INSTALL.md` lets a person ignore the vault or keep
it outside every repository. Such a vault still gets hotspots, change coupling
and footprints, which need no history of the board file. A time stored in the
board can carry behind to such a vault. The options rejected below say why
the lens stores none, and nothing yet shows a need for it.

A board with no current variant has no last change, and the answer says so.
Its drafts are ahead of the code (ADR 0031).

The commits that a board is behind by include large commits, and the answer
says which ones are large. A large commit can change what a board says. A
commit that moves a module is an example.

Archboard adds no way to say that a board was checked. If an agent reads the
code and finds the board right, it writes nothing, and the board stays behind.
Such a statement is an authored claim that nothing verifies, and somebody keeps
it by hand. It also adds a field or a command that every reader must learn.
The code check (TASK-367) says whether a board is right. Behind only says
where to look. Each commit in the answer carries its subject, so a reader
passes over a fix quickly. Behind is information (below), so a count that
grows never blocks a clean check. A binding's `confirmedAt` is part of its
node. So restating it is an edit like any other, and it moves the last change
of the whole board.

## Hotspots and change coupling read a period with code-maat's filters

A period is the commits on a checkout's HEAD that were committed in the year
before the commit time of HEAD. `--since <date>` names another start. The
period ends at HEAD and not at the clock, so one HEAD always gives one answer.

The default is one year. A shorter period leaves most parts below the
thresholds that follow. In a longer one, the history of code that was rewritten
long ago decides the answer. On this repository a year holds every commit that
changed the parts that the design note measured.

Both readings leave out large commits, and each answer says how many it left
out. Without that filter, Claims and Panes look coupled, and 10 of their 12
shared commits are large.

The hotspots of a board are its parts ranked by the number of commits in the
period that changed them. The answer lists each part's commits, newest first.
A hotspot counts commits only. Tornhill also weighs a hotspot by the complexity
of its code, and the lens measures no complexity. A count of changed lines
grows with moved and generated files, so the lens counts no lines either.

These two rules decide whether two parts of one board have change coupling.
The values are code-maat's defaults (`--min-shared-revs` and `--min-coupling`),
and code-maat calls a commit a revision:

- The two parts changed together in at least 5 commits of the period.
- The degree is at least 30%. The degree is the number of shared commits
  divided by the mean of the two parts' commit counts.

code-maat also requires a mean of at least 5 commits (`--min-revs`). The first
rule makes it always hold, because each part has at least as many commits as
the two share.

For path-wide attribution, the lens leaves out a pair whose bound paths overlap:
one path, or one path below the other. Each shared commit of such a pair is one
change counted twice. With precise declaration attribution, distinct symbols
can pair within the same file. Shared declaration ownership is still excluded.
Command dispatch binds Interruptible run and runCliWith to one file. Browser
application binds Tab session to a file below the directory of Pane session.

A relationship joins the two parts at its ends, in either direction. A part
inside an end counts as at that end. A relationship that ends on a container is
a dependency drawn at a higher level (ADR 0044), so it joins the parts inside.

If no relationship of the variant joins two coupled parts, and neither part is
inside the other, the answer lists the pair as unjoined. An unjoined pair is
what the reading is for. It points to a dependency that the board does not
draw, or to one decision that two parts carry (Ousterhout's information
leakage).

The thresholds are fixed, and the period is the one option. Fixed thresholds
keep two answers comparable and keep the measurement of the design note
reproducible.

## Amendment of 2026-10-06: what joins two coupled parts

TASK-369.04 amended the rule above for an unjoined pair. Two more things join
two coupled parts. Everything else stands.

A flow step joins the two parts at its ends, in either direction, as a
relationship does. The board holds the message, and the flow's data-flow view
draws it. The architecture picture draws it as a step line only on a board with
no relationships. So the board does not miss that dependency. ADR 0044 leaves steps out of a container's interface,
because a return travels against the dependency. Change coupling has no
direction, so that reason does not apply here.

A container counts as at an end inside it. ADR 0044 counts a relationship
that starts inside a container and ends outside it as an outgoing relationship
of the container. A relationship from outside to a part inside makes its
source a caller of the container. So the board draws that dependency for the
container too. On Command interface on 2026-10-06, Commands and Server client
changed together in 34 commits (35%). Five commands inside Commands call
Server client. Without this rule, the pair read as unjoined, although the board
draws the dependency.

So one end of the relationship or step must be the first part, a container
above it or a part inside it. The other end must be the second part, a
container above it or a part inside it. Then the two parts are joined.

## Footprint sets a range of commits against a proposal

A footprint reads the commits from the merge base of a named ref and HEAD up to
HEAD, in each checkout. The ref is anything that Git resolves in the checkout,
such as `main`, `origin/main` or a commit. With `--head <ref>`, the commits run
up to that ref instead of HEAD, read from Git without a checkout, for a layer of
a pull-request stack that is not checked out. The head resolves as the code
check resolves a ref a draft pins: the name, else the branch of that name on
`origin`. A checkout where it does not resolve is not read, as for the base.
When it resolves in none, the request is refused with `HEAD_UNRESOLVED`. If the
ref does not resolve in a checkout, the lens does not read that checkout, and
the answer says so. The
footprint lists the parts that those commits changed, with each part's
commits, and it says which commits are large. It uses no period, and it leaves
no large commit out.

With `--variant <proposal>`, the footprint reads the parts of the variant that
the proposal is read against and of the proposal. That variant is the current
variant, unless `--against <variant>` names another. It must be a current
variant or a draft, and not the proposal (`AGAINST_NOT_LIVE`,
`NOTHING_TO_COMPARE`). A board with no current variant reads a proposal against
its parent. A proposal with no parent is read against nothing, so it names every
part it holds, as added. Without `--variant`, a board with no current variant is
refused with `NO_CURRENT_VARIANT`, unless `--against` names the variant to
read. A removed part is only on the variant read against, and an added part is
only on the proposal. The footprint splits the parts into
three lists: named and changed, changed but not named, and named but not
changed. A skipped part is in none of the three lists.

The proposal names each part whose comparison status is added, changed or
removed. It also names each part at an end of a relationship or a step with one
of those statuses. A new relationship changes the code at its ends, although
the comparison does not badge them (ADR 0023). Both ends count, because the
direction of a relationship does not say which end's code changes, and
relationship kinds belong to the vault (ADR 0024). The answer says why it names
each part. So a reader can tell a part that
the proposal changed from a part at the far end of a new relationship.

## Where each reading answers

| Reading         | Where it answers                                    | Severity    |
| --------------- | --------------------------------------------------- | ----------- |
| Behind          | `archboard check code`, per board and per part      | information |
| Hotspots        | `archboard semantic locality <board>`               | information |
| Change coupling | `archboard semantic locality <board>`               | information |
| Footprint       | `archboard semantic footprint <board> --base <ref>` | information |

`archboard check code` reads every board. Its `code` part keeps behind apart from
its diagnostics. Both `semantic` commands take `--variant` for a draft, and
`semantic footprint` takes it for the proposal that it sets the commits
against.

Behind answers in the code check, because TASK-369.02 asks the check for it.
The code check also reads every board against its code: the files of each
checkout as they are on disk, with uncommitted edits (ADR 0046). Behind counts
the commits on HEAD. One command then says how each board stands against its
code: the findings say what is wrong, and behind says where to look.

`semantic locality` answers hotspots and change coupling together, because one
walk of one period gives both and the pane inspector shows both for one part.
Locality is the word of the codebase-design skill for where change
concentrates, and the design note uses it for these two readings.
`semantic footprint` answers the reading that it is named for. The two commands
read different ranges with different options: a period for locality, and a
base ref for a footprint. One command for both has two modes.

Information means that a reading is not a vault diagnostic. It has no warning
or error severity, it changes no exit status, and it puts no dot on the
diagnostics bell (ADR 0026). The canvas draws nothing for it.

Behind is information, for three reasons:

- Most commits to a bound file change no architecture. A board that is right
  falls behind with every fix.
- Right work cannot clear it. Only a change to the current variant moves the
  last change, and a board that is right has nothing to change.
- ADR 0031 refused a warning that every correct planning board raises, because
  a clean check is then out of reach for right work and the warning stops
  meaning anything. As a warning, behind puts every board on the bell, and the
  bell is never clear.

Hotspots and change coupling describe the code. An unjoined pair asks the
board a question and proves no fault in it. A footprint helps a review. What a
maintainer does with a footprint is a rule of the archboard-dev skill
(TASK-369.06), not a severity.

## Derived on request, never stored, never drawn

Each reading is derived on request, from Git and the board. Nothing writes a
reading into a board, into the vault or into any file (ADR 0015). A reading
answers what Git did to the bound declarations or paths. Only the note answers
what is on a board.

No reading changes the picture. Traffic is authored illustration and never
measurement (ADR 0027), so no reading sets traffic. No reading sets emphasis, a
colour or a mark, because every visual channel is taken (ADR 0025, ADR 0031).
The pane inspector is the one place where a user sees a reading (TASK-369.07). A
design question that a person chose can light the subjects that it names, as
attention (ADR 0059).

The Archboard server derives the readings, because the pane inspector needs a
route and the CLI talks to the server. One walk of each repository's log serves
every board of one request. The server keeps each answer of behind and of
locality in memory. Its key is everything that the answer derives from. That is
the options, the version of each board, and the checkout of each repository
with its HEAD. For behind, the key also holds the HEAD of the vault's checkout.
A request reads those HEADs first and reuses an answer whose key still holds.
The memory goes with the process. It answers no question about what is on a
board, so it is not a second copy of one.

The server keeps no footprint (TASK-369.05). No pane asks for one, and an agent
asks once for a branch. Also, a ref such as `origin/main` can move while every
HEAD stays. The key of a footprint then needs the commit of the ref in each
checkout, and to find that is most of the work.

No reading runs inside `/api/vault/check`, the check that every open canvas
polls every 5 seconds (`VAULT_CHECK_POLL_MS`). The plain `archboard check`
stays as it is.

If a user selects a part, the pane inspector asks the route of
`semantic locality`. It never asks on a timer. The first selection on a board
at one HEAD starts one walk. A request that arrives while that walk runs waits
for it and starts no second walk. The answer covers every part of the board, so
a later selection reads the server's memory. On this repository on 2026-10-06,
a walk of one year (about 3,300 commits) took 0.4 seconds. The Git history of
one board file took less than 0.1 seconds.

TASK-367.24 says that a pane never starts a code pass itself. A walk is not a
code pass. It reads only Git, and it took less than a second here. Also, every
commit can change its answer. A pane that only reads what an agent left then
shows nothing most of the time. This decision does not change the
rule of TASK-367.24 for the code pass.

## What this assumes about the code check

ADR 0046 decides the code check of TASK-367 at the same time as this decision.
This decision assumes the following. ADR 0046 keeps or changes it.

- `archboard check code` runs on a route of its own that only a request
  starts, never inside the polled check.
- The server keeps its answer in memory, keyed on the HEAD of each checkout it
  read.
- It reads each registered checkout at its HEAD, and a repository that this
  machine has not registered stays silent.
- It reads the current variant of every board, and a named draft with
  `--variant`.
- Its exit status follows `archboard check`, so only a warning or an error
  fails it.
- It skips a part pinned to a ref that its checkout does not have out, as this
  decision does.

Behind joins the answer of `archboard check code` as information. If ADR 0046
puts the code check somewhere else, behind keeps every rule above, and ADR 0046
names where it answers.

## Names

The tasks call the first reading staleness. This decision says that a board is
behind its code, as in "10 commits behind". "Stale" already means three other
things here. A stale server runs older source (ADR 0014, the `stale` field of
`archboard status`). A stale README asset is older than its sources
(TASK-396). A write that names a stale version is refused. ADR 0031 already
says "behind" for a binding against the code.

The tasks call a large commit a sweep. The archboard-dev skill already calls
its pass after a removal or a rename a sweep.

The tasks call the range of hotspots a window. `CONTEXT.md` uses "window" for a
browser window, so this decision says period.

The co-change measure is change coupling. Temporal coupling means three
different things in three books.

## Considered and rejected

**Count from the board's last write**, its `updatedAt` or the last commit of
its file. A draft edit, a shelving, a rename and a migration write all move it,
and none of them says anything new about the built architecture. A draft is
ahead of the code (ADR 0031), so its edits cannot bring the board up to its
code.

**Count from the time of the last adoption.** The time is in the board, and it
needs no Git. But the current variant is also edited in place. Board viewer
adopted TASK-387 on 2026-10-03, and commit `2779dff27` rebound one of its parts
on 2026-10-05. A board that was created current has no adoption at all. And a
time counts the commit that carries a board change with its code: commit
`e88465230` carried that adoption 75 seconds after its time, and it changed two
bound files of Board viewer.

**Store a time on each variant.** It works for a vault outside Git. It adds a
field that every write must stamp, and it is still a time, so it counts that
same commit.

**Count from a last change for each part**, the last commit that changed that
part. An adoption says that the whole variant is right. A part that an agent
read and left alone then looks behind for ever.

**Stamp each binding.** An agent records on each binding the commit that it
last read the code at. Since TASK-311, a binding's `commit` pins the ref that
its code opens at. A stamp on each part is an authored answer that goes out of
date and that somebody keeps by hand on every part. ADR 0031 refused that split
for existence.

**A way to say that a board was checked.** Nothing verifies such a claim. The
code check says whether a board is right. The section on behind gives the other
reasons.

**Let a walkthrough edit move the last change.** A walkthrough changes no part.
A walkthrough for a pull request recording then hides that pull request.

**Read the remote's default branch.** It needs a fetch and the network, and it
answers about code that this machine does not have.

**Read every branch**, as code-maat's guide does with `--all`. Unmerged work
then counts against the variant that says what is built.

**Read a pinned ref that the checkout does not have out.** The lens then reads
code that the checkout does not show. "Open the code" sends a part of a GitHub
repository to GitHub at that ref.

**Require a parser for every binding.** File mapping remains available for
all languages. TASK-448 adds declaration mapping through the existing adapters
and labels path-wide fallback when they cannot resolve a symbol.

**Leave out the size filter.** Claims and Panes then look coupled through 10
large commits.

**Apply the size filter to behind and footprint.** A large commit can move what
a board says. A branch's large commit did change its parts. Those two readings
keep large commits and say which ones are large.

**Count changed lines in a hotspot.** Moved and generated files then rank first,
and the lens still reads no complexity.

**Make the thresholds options.** Then two answers with other thresholds do not
compare, and the measurement no longer reproduces. The period is the one
option.

**End the period at the clock.** The answer then changes while HEAD stays, and
an answer kept for one HEAD lies.

**Name only the source end of a changed relationship.** The vault defines each
relationship kind. Its direction does not say which end's code changes.

**Answer in the plain `archboard check`.** Every open canvas polls it every 5
seconds, and agents run it after board work (ADR 0026). A walk there runs for
every pane and every check. Hotspots, change coupling and footprint also need a
board and options.

**Answer in `semantic inspect`.** It is the reading that a pane runs over the
same document, and it needs only the board and the policy. Git and checkouts
change that contract.

**One command for all four readings.** The four read different ranges with
different options, so one command has four modes. Its natural name, history,
already means historical variants and adoption history here.

**Make behind a warning.** See the three reasons above.

**Let the pane read only answers that an agent left**, as TASK-367.24 plans
for the code pass. The inspector is then empty until an agent asks, and every
commit empties it again. A walk for one board takes less than a second here,
and a selection is a request.

**Push a new answer after a HEAD moves.** That needs a watcher on every
checkout. The next selection reads the HEADs anyway.

**Draw the readings**, as heat or as traffic. Every visual channel is taken
(ADR 0025), and traffic is authored illustration (ADR 0027).

## Consequences

- TASK-369.02 builds the walk, the mapping and behind in
  `archboard check code`. It depends on the code check's route of
  TASK-367.05, or it builds that route first.
- The default period is a duration, so it lives in
  `packages/timing/src/shared/constants/timing.ts`.
- TASK-369.03 creates `archboard semantic locality` with hotspots, and
  TASK-369.04 adds change coupling to the same answer. TASK-369.04 compares
  with the design note over the default period, which covers the commits that
  the note measured.
- TASK-369.05 creates `archboard semantic footprint` and gives its answer a
  schema.
- If a task commits on `main`, TASK-369.06 names the commit that the task
  started from as `--base`. The commits of other work in that range count too,
  and the closing step tells them apart by their subjects. A board that no
  proposal of the task names is still behind by the task's commits. So the
  closing step reads both.
- TASK-369.07 asks the locality route on selection and never on a timer. Its
  list of recent commits is the part's commits in the period. On a draft it
  asks for that draft. On a historical or a shelved variant it says that the
  lens does not read that variant.
- Behind depends on a committed vault. A vault outside Git gets the other
  three readings only.
- A shallow clone answers from the commits that it has.
