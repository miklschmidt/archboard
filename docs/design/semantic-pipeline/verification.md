# What was checked, and what is still true afterwards

TASK-180 asks for the example to be verified rather than asserted. This is what
was run, what it produced, and what it does not cover.

## The example builds from tracked source

`bun scripts/build-pipeline-example.ts`, with `ARCHBOARD_VAULT` naming an empty
directory, produces:

| board                  | variants                                                         | views                                              |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| `archboard/write-path` | `One write, as it is`                                            | `The parts` (architecture), `In order` (data-flow) |
| `archboard/pipeline`   | `Drawing is the board` (current), `Meaning is the board` (draft) | `The parts`, `The write path`                      |

`archboard/pipeline`'s _Write boundary_ drills down into `archboard/write-path`,
which is the linked level the example is meant to show. The proposal is derived
through the ordinary branch command and then says what it proposes through the
ordinary edit command — the same two writes an agent makes.

Running the script again over a vault it has already built changes nothing: it
says so and leaves both boards alone. Identities are minted once and never
rewritten, so a second run that rebuilt them would break every drill-down and
every comparison that points at them.

## The drawn artifacts

`docs/design/generated/pipeline-example/` holds one SVG per view per variant,
drawn through the same owner the render route uses — the view cut out first, and
for the proposal its content plus what its change took away, marked with how each
subject stands. The proposal's whole-variant picture carries 6 added, 1 changed
and 6 removed marks; its scoped view carries 1 changed and 4 removed, because a
view shows what its own corner lost and stays silent about the rest.

**Reproducible, with a limit worth stating.** Drawing the same boards twice
produces byte-identical files. Building into a _fresh_ vault and drawing again
does not: every subject is minted a new identity, and identities appear in the
markup as `data-semantic-id`. That is the intended trade — there is one minting
site and it never reuses an id (ADR 0023) — so the artifacts are reproducible
from the boards, not from the statements.

## The lifecycle, exercised through the real command line

Against a running canvas over the example vault, in order, each command through
`archboard semantic …` and each result read back off the board:

1. Two competing proposals from the current state, and a third derived from one
   of them. Ancestry recorded, `current` unmoved.
2. A safe edit to the current state — a new _Change feed_ module — reached all
   three drafts in one write and one version.
3. Two incompatible edits to one field: the proposal says the write "applies a
   semantic transition and reconciles every draft under it", the current state
   says it "copies the scene, settles geometry, persists, then notifies". The
   edit's own answer named the draft, the field, both values and what to do —
   and said what each of the other two drafts did: the competing sibling took
   the change, and the draft derived from the conflicted one was **blocked**,
   its content left untouched, naming the ancestor whose decision it waits for.
   A draft is not merged against a state that is itself in dispute, because
   that would be choosing on its behalf which side of the argument to build on.
4. A proposal derived from the one in dispute, made while it was in dispute,
   was told so the moment it existed: it records the same standing the
   propagation would have given it, naming the decision it is waiting for
   rather than the state it came from. A new proposal that looks settled when
   what it is built on is not is the one thing a board must not show.
5. The canvas was stopped and started. The disagreement was still there, with
   the state it was measured from still held: nothing about it lived in memory.
6. Settling it with `side: "mine"` kept the proposal's answer, cleared the
   standing, and freed the drafts below it — the one derived before the
   disagreement and the one derived during it — both merged in the same write.
   Settling the blocked draft instead is refused by name: answering there would
   decide one argument twice.
7. Adopting the competing proposal moved `current`, froze what it replaced under
   its own name, recorded the move with its reason, and left ancestry alone.
8. The frozen state refused an ordinary edit — "what was true then does not
   change: branch a proposal from it if you want to say something different" —
   and the new current took one, which its own draft then followed.

## Seen, not only asserted

Both boards were opened in the running app at 1920×1080 and read:

- `archboard/write-path` draws as a legible vertical chain, offers `Everything`,
  `The parts` and `In order`, and offers no choice of variant, because it has
  one and a choice between one thing and nothing is furniture. It still says
  which state that is — _One write, as it is_, current — because what else could
  be read and what is being read are two questions, and somebody who followed a
  link into a board has only asked the second.
- Its walkthrough _Why a write is shaped like this_ reads as prose beside the
  picture. Moving to its third beat switched the picture to the sequence grammar,
  marked _Version check_ and _Validation_ — exactly the beat's two subjects — and
  fitted the camera to them.
- A proposal with an unsettled disagreement says so above the picture, in the
  reconciliation's own words, with the subject and the field named.
- A proposal that was never brought forward says that instead, and names the
  state whose decision it is waiting for by the name on the variant bar rather
  than by its id. That was wrong when it was first looked at — the sentence
  asked the function that names nodes and steps what a variant is called, and
  got the id back — and the pane now asks the board's own family.

## What the answer carries

Every one of those commands answered with the same envelope the HTTP route uses
— the board, the version it landed at, and either `reconciliation: null` or every
draft the change reached with what each of them did. A draft that was blocked is
named with the state whose decision it waits for, by the name that state goes by
rather than by its id — the command reads its own answer, so an outcome the
answer can carry and the reader cannot parse is a write nobody is told about.
The prose on standard error says the same thing for a person, and neither is
derived from the other.

## What this does not cover

- Nothing outside the example's own boards is read, written or migrated. A
  vault the example builds into keeps everything else it holds untouched.
- The boards describe archboard's own pipeline, which is a system being changed
  as this is written. The bindings point at files that exist today; the _Board
  write_ responsibility on the proposal is what the semantic write actually does,
  not a prediction.
- Reconciliation is exercised on fields. A disagreement about order, or one that
  is structural rather than about a field, is covered by the store's own owners
  rather than by this example.
