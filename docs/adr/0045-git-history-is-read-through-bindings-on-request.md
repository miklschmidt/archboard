---
status: accepted
---

# Git history is read through bindings, on request, and never stored

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) replaces the live board selectors
below with canonical locality and footprint. The Git reading below holds.
[ADR 0065](0065-checkpoints-retain-architecture-without-selecting-current.md) governs retained
canonical architecture. This decision governs the separate source-history lens.

The history lens maps commits through bindings to give four readings.
A board is behind its code by the commits that changed its parts after the
board last changed. A footprint says what a branch changed, against what its
proposal named. Hotspots say which parts change
often, and change coupling says which parts change together. `CONTEXT.md`
defines the four terms and large commit. This ADR decides how the lens reads
Git and where each reading answers.

## A commit changes a part through its bound files

A part's bound files are the file that its binding names, or every file below
the directory that its binding names. If a commit changes one of a part's
bound files, it changes the part. Git records files, so the mapping needs no
parser and works in every language, infrastructure and Nix included.
Behind keeps this path mapping. Locality and footprint use the declaration
mapping below when a binding names a symbol.

The lens reads the current variant, because only the current variant says that
its architecture is built (ADR 0031). Locality and footprint can read a named
draft, as the code check does. Behind never reads a draft. The lens never
reads a historical or a shelved variant.

A footprint sets a draft against its predecessor. It sets a current state that
the branch adopted against the current state at the merge base, which the vault
at that commit holds. A branch adopts its proposal before it merges, so its plan
must survive the adoption.

The lens skips a part with no binding, a part that carries a drill-down, a part
bound into a repository that this machine has not registered, and a part pinned
to a ref that its checkout does not have out. The board that a drill-down opens
carries its own history. A skipped part is in no count and in no list of a
reading, and each answer lists the parts that it skipped. A part that the lens
did not read must never look like a part that no commit changed.

## Symbols narrow locality and footprint

Locality and footprint share one declaration mapping. The existing
code-facts adapters read immutable Git sources before and after each commit.
A commit counts when the bound declaration changes its source text or file path.
Unrelated declarations in the same file do not count. The reader uses
uncommitted checkout files only for a footprint whose caller names the working
tree as its head. Unsupported formats, unparsed code, and ambiguous
definitions use path-wide fallback, and the answer labels it. The reader does
not infer identity between renamed symbols.

## Each repository is read at the HEAD of its checkout

The lens reads each repository in the checkout that the checkout registry
names for it, at that checkout's HEAD. It never fetches. A ref resolves only
from what the checkout already has. The lens answers about the code that this
machine has, which is the code that "open the code" opens.

The repositories of one vault share no commits. So change coupling pairs only
two parts bound into one repository.

## A board is behind by the commits after its last change

A board's last change is the last commit that changed its current variant. The
board is behind its code by the commits that changed a part's bound files after
its last change. The lens finds the last change in the board file's own Git
history.

An adoption counts, and so does an edit in place that changes a part, a
relationship, a flow or a step. A draft edit, a shelving, a rename, a change to
the views, a walkthrough edit and a migration write do not count. None of them
says anything new about whether the parts match the code. If a walkthrough edit
counts, a walkthrough that an agent writes for a pull request recording hides
the commits of that pull request.

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

If the vault is not in a Git repository, or Git ignores the board file, the
lens cannot find the last change. The answer says so, and it never reports zero
commits for such a board.

Archboard adds no way to say that a board was checked. If an agent reads the
code and finds the board right, it writes nothing, and the board stays behind.
Such a statement is an authored claim that nothing verifies, and somebody keeps
it by hand. The code check says whether a board is right. Behind only says
where to look.

## Hotspots and change coupling read a period with code-maat's filters

A period is the commits on a checkout's HEAD that were committed in the year
before the commit time of HEAD. The period ends at HEAD and not at the clock,
so one HEAD always gives one answer.

Both readings leave out large commits, and each answer says how many it left
out. Without that filter, unrelated parts look coupled through large commits.

A hotspot counts commits only. Tornhill also weighs a hotspot by the complexity
of its code, and the lens measures no complexity. A count of changed lines
grows with moved and generated files, so the lens counts no lines either.

Change coupling uses code-maat's default thresholds for shared commits and
degree. The thresholds are fixed, and the period is the one option. Fixed
thresholds keep two answers comparable.

A relationship or a flow step joins the two parts at its ends, in either
direction. ADR 0044 leaves steps out of a container's interface, because a
return travels against the dependency. Change coupling has no direction, so
that reason does not apply here. A part inside an end counts as at that end,
and a container counts as at an end inside it, because the board draws that
dependency for the container too (ADR 0044).

If nothing joins two coupled parts, and neither part is inside the other, the
answer lists the pair as unjoined. An unjoined pair is what the reading is for.
It points to a dependency that the board does not draw, or to one decision that
two parts carry (Ousterhout's information leakage).

## Footprint sets a range of commits against a proposal

A footprint reads the commits from the merge base of a named ref and HEAD up to
HEAD, in each checkout.

A caller can name the working tree as the head (TASK-646.02), so that a gate
run before a commit sees the change it judges. The lens then reads the
uncommitted changes, untracked files included and ignored files left out, as
one more commit on top of HEAD. It writes that commit with a copy of the index
into objects of its own, and removes them after the read. The checkout gains no
object, and its index stays as it was.

A part changed when its bound declarations or paths differ between the merge
base and the head.

The proposal names each part whose comparison status is added, changed or
removed. It also names each part at an end of a relationship or a step with one
of those statuses. A new relationship changes the code at its ends, although
the comparison does not badge them (ADR 0023). Both ends count, because the
direction of a relationship does not say which end's code changes, and
relationship kinds belong to the vault (ADR 0024).

## Where each reading answers

Behind answers in the code check. One command then says how each board stands
against its code: the findings say what is wrong, and behind says where to
look.

Every reading is information. It is not a vault diagnostic (ADR 0026), it
changes no exit status, and it puts no dot on the diagnostics bell.

Behind is information, for three reasons:

- Most commits to a bound file change no architecture. A board that is right
  falls behind with every fix.
- Right work cannot clear it. Only a change to the current variant moves the
  last change, and a board that is right has nothing to change.
- ADR 0031 refused a warning that every correct planning board raises, because
  a clean check is then out of reach for right work and the warning stops
  meaning anything. As a warning, behind puts every board on the bell, and the
  bell is never clear.

## Derived on request, never stored, never drawn

Each reading is derived on request, from Git and the board. Nothing writes a
reading into a board, into the vault or into any file (ADR 0015). A reading
answers what Git did to the bound declarations or paths. Only the note answers
what is on a board.

No reading changes the picture. Traffic is authored illustration and never
measurement (ADR 0027), so no reading sets traffic. No reading sets emphasis, a
colour or a mark, because every visual channel is taken (ADR 0025, ADR 0031).
The pane inspector and `Measures` are the only places where a user sees a
reading.

The Archboard server derives the readings, because the pane inspector needs a
route and the CLI talks to the server. The server keeps each answer of behind
and of locality in memory. Its key is everything that the answer derives from.
The memory goes with the process. It answers no question about what is on a
board, so it is not a second copy of one. The server keeps no footprint,
because a ref such as `origin/main` can move while every HEAD stays.

No reading runs inside the check that every open canvas polls, because a walk
there runs for every pane and every check. The reader asks for a reading on a
selection, and when `Measures` opens. It never asks on a timer. A pane never starts a code pass itself, but a walk is not a code pass. It
reads only Git, and every commit can change its answer, so a pane that only
reads what an agent left shows nothing most of the time.

The browser passes no abort signal to the read. Each selection mounts its own
subscriber, and the last subscriber of a read leaves before the next one mounts.
A signal then stops a read that the next selection needs, and a reader who moves
from module to module never gets an answer. An obsolete read ends on the server
and its answer stays in the memory.

## Considered and rejected

**Count from the time of the last adoption.** The time is in the board, and it
needs no Git. But the current variant is also edited in place. A board that was
created current has no adoption at all. And a time counts the commit that
carries a board change with its code.

**Store a time on each variant.** It works for a vault outside Git. It adds a
field that every write must stamp, and it is still a time, so it counts that
same commit.

**Count from a last change for each part**, the last commit that changed that
part. An adoption says that the whole variant is right. A part that an agent
read and left alone then looks behind for ever.

**Read every branch**, as code-maat's guide does with `--all`. Unmerged work
then counts against the variant that says what is built.

**Read a pinned ref that the checkout does not have out.** The lens then reads
code that the checkout does not show. A pin says that the part describes the
code at that ref, and the commits on another ref say nothing about it.

**Count each commit in a footprint**, as behind and locality do. In a stack
that merges instead of rebasing, two layers can make the same change. The
upper layer's own commit then changes the part, but its pull request changes
nothing there. The same holds for a change and its revert. A footprint answers
what a branch changes, so it reads the two ends of the range.

**Apply the size filter to behind and footprint.** A large commit can move what
a board says. A branch's large commit did change its parts. Those two readings
keep large commits and say which ones are large.

**One command for all four readings.** The four read different ranges with
different options, so one command has four modes. Its natural name, history,
already means historical variants and adoption history here.

## Consequences

- A shallow clone answers from the commits that it has.
