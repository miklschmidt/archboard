---
status: draft
implements: 0015, 0016
---

# The plan

ADR 0015 decided that the vault is the truth and the agent-friendly shape is an
input format. ADR 0016 decided that a board has a mutex, and that an agent may
claim one for longer than a single write. This is the order the code moves in to
get there, what each step risks, and what is still open.

Three documents, three jobs. This one is the order. `server-is-the-truth.md` is
the measurement: every number quoted below comes from there and was taken on
2026-08-20 against the running code. `stateless-server.md` is the earlier
investigation whose measurements stand and whose recommendation was overruled;
it argued for memory staying authoritative with an autosave timer, and the user
chose statelessness instead. Read it for the write-rate figures, not for the
verdict.

Nine stages. Each leaves `bun run test` green and the tool usable, so the work
can stop at any boundary without leaving the canvas in a state nobody can use.

## The order, at a glance

| Stage | What | Tasks | After |
|---|---|---|---|
| 1 | Batch the fan-out | TASK-068, TASK-064 | nothing |
| 2 | Mint every id once | TASK-069 | nothing |
| 3 | Find out how text can be measured | TASK-070 | nothing |
| 4 | Build the check that can tell | TASK-071 | nothing |
| 5 | One converter | TASK-072 | 2, 3, 4 |
| 6 | Delete the label seed | TASK-073 | 5 |
| 7 | A write returns the document | TASK-074, TASK-075, TASK-076 | 5 |
| 8 | The vault is the truth | TASK-061, TASK-060, TASK-077, TASK-078, TASK-063, TASK-079 | 1, 7 |
| 9 | One writer at a time | TASK-066, TASK-067, TASK-080, TASK-081, TASK-062 | 1, 8 |

Stages 1 to 4 have no dependencies and can run at the same time. Everything
after stage 5 is a chain.

The suites are `type-check`, `module-scope`, `mcp`, `bind`, `obsidian`,
`changes`, `geometry`, `labels`, `library`, `boards`, `branch`, `side-by-side`,
`install`, `repos`, `parity` and `hot`. The risk lines below name them. Stage 1
added a sixteenth, `one-write`, which counts the writes an intent costs on the
wire.

## Stage 1. Batch the fan-out

**TASK-068**, and **TASK-064** behind it.

Five operations in `src/core/element-ops.ts` turn one intent into one HTTP write
per element: `alignElements` and `lockElements` and `groupElements` and
`ungroupElements` through `Promise.all`, `distributeElements` sequentially. And
`apply`, which `src/cli/run.ts:35` calls "in one call" and which
`src/cli/commands/elements.ts:54` implements as one `PUT` per update and one
`DELETE` per delete. Only creates are batched.

Twenty concurrent PUTs over a 300-element board cost 2.87 ms. The same intent as
one batched write costs 0.13 ms. That is a nuisance today. Under stage 8 it is
twenty read-modify-write cycles racing on one file, which is lost updates. Under
stage 9 it is twenty separate acquisitions of the board lock, with nineteen gaps
between them.

The route exists. `POST /api/elements/changes` at `src/server.ts:1204` takes
`upserts` and `deletes` and applies both in one pass, and the browser already
reports through it. Two lines stop an agent using it: `src/server.ts:1235`
hardcodes `source: 'frontend_sync'`, and `src/server.ts:1264` calls
`noteChange(..., 'human')`, which would classify an agent's own drawing as human
and make it eligible for injection back at the agent (ADR 0005). Both want an
origin on the request, defaulting to today's behaviour so the frontend does not
have to move in the same commit.

TASK-064 follows immediately, because it becomes cheap the moment this lands.
The MCP process holds its own `sceneState.groups` map at
`src/core/canvas-state.ts:22`, outside `kept()`, so two MCP clients disagree
about what is grouped and a group dies with the client. Its one hard consumer is
the `knownMemberIds` seed `ungroupElements` accepts for legacy MCP groups. Route
group and ungroup through the batched write and that seed has nothing to seed
from, so the map is deleted rather than migrated. `groupIds` is a native
Excalidraw field that already round-trips through the note, which is why the CLI
never had this bug.

**Risks:** `geometry` is the suite whose whole subject is align and distribute.
`parity` moves because both surfaces change. `mcp` because grouping is an MCP
tool. `changes` because the origin parameter changes what the feed is told.
`boards` because every element write names a board.

## Stage 2. Mint every id once

**TASK-069.** No dependencies. Ship it early, on its own, because it removes
silent data loss from the code as it stands today.

With a text editor open on a bound label in a real browser, a document was
applied in which that text element had been renamed. The textarea stayed on
screen, stayed focused, and kept its value, but the scene no longer held the id
the editor was bound to. Five characters were typed and Escape was pressed. The
five characters were discarded, with no error, no warning, and no visible sign
that anything had happened.

That is the hard constraint of this whole plan, and it is not a performance
question. No amount of timing helps: holding an echo until a gesture ends does
not fix it, because the next keystroke still goes to an element that is gone.

Two places rename ids the server did not choose. `wrapSceneAsObsidianMd` at
`src/core/obsidian-md.ts:396` renames any text element whose id is not one to
eight characters from Obsidian's block-id alphabet, because a block reference
cannot hold anything longer; measured on a five-text board, four of five were
renamed. And `convertToExcalidrawElements` mints a fresh 21-character nanoid for
the text element it expands from a `label` seed, which is the mechanism behind
TASK-024 and the reason `adoptReusedLabelIds` exists.

Today both are harmless, because the note holds one set of ids and the store
holds another. Under stage 8 the note is the store, and the rename is what the
browser gets back. So every id is minted once, at the write boundary, in a form
the note writer never touches. `generateId` already produces eight-character
ids; `stableId8`'s collision handling moves from the writing site to the minting
site, which is where a property of the id space belongs.

Boards already in the vault need no migration. The rename is deterministic, so
they keep the ids they have.

**Risks:** `obsidian` (108 checks, and the note writer is its subject), `labels`,
`boards`, `branch`.

## Stage 3. Find out how text can be measured

**TASK-070.** A spike, timeboxed, and a gate on stage 5 rather than part of it.

Excalidraw's width for a piece of text is exactly what `measureText` returns.
That was proved by running the converter headless with a measurer deliberately
fixed at 7 px per character: a twenty-character string came out 140 px wide.
There is no estimation and no correction anywhere in that path, so whatever
measures, decides.

Our estimate is 0.6 x fontSize per character. It is not a bad estimate that
needs tuning, it is the wrong kind of answer. On "AuthService" it is 76.7 px too
wide and every label height it writes is three times the truth.

Reading Excalifont's woff2 subsets with fontkit and summing advance widths does
not reproduce Chrome either, and is out by 4.6 to 40.4 px across five strings
with a ratio that is not constant. The cheapest hypothesis, untested, is that
Chrome fell back to a system font because Excalifont had not finished loading
when the reference numbers were taken. Testing it is small: load the font
explicitly, await `document.fonts.ready`, measure the same five strings.

Three outcomes, and they are three different amounts of work for stage 5:
a pure-JavaScript measurer with no native dependency, a native canvas on a box
that currently has none, or the server writing the geometry it can compute and
the first browser correcting the text. The third is a real second
representation, confined to two fields on one element type instead of fifteen
fields on all of them. It is better than shipping widths that are 76 px wrong,
and it does not satisfy ADR 0015, so if it is taken the ADR says so rather than
being quietly weakened.

**Risks:** none. No production code changes.

## Stage 4. Build the check that can tell

**TASK-071.** No dependencies. Build it before the thing it checks.

Dropping `convertToExcalidrawElements` removes a converter we do not control. It
does not remove Excalidraw. Excalidraw is still the renderer, it holds the
document while a human edits it, and it silently corrects anything it disagrees
with. A saved 15-element board, opened and rendered once, came back with 13 of
its 15 elements changed. The same board already in native form, handed back
through `updateScene`, changed 0 of 13.

So the property that matters is not "there is one converter", which a converter
that is single and still wrong would satisfy. It is that what we write is a
fixed point: a document Excalidraw does not change. The only check that proves
it is a real browser reporting nothing back.

That check needs infrastructure the repo does not have. No script in `scripts/`
drives a browser. `check-boards.mjs` and `check-side-by-side.mjs` stand sockets
in for panes and say so in their headers. Adding a headless browser to the check
suite is a dependency decision, and it should be settled here rather than
discovered in the middle of stage 5.

Land it asserting today's measured baseline rather than zero, and leave it out
of `bun run test` until stage 5 can flip it. That way it lands without breaking
anything and the converter work has an unambiguous target.

**Landed** as `scripts/check-fixed-point.mjs`, run with `bun run test:browser`.
Its board is eight agent-drawn elements, twelve once the note writer has
expanded the labels, and **8 of those 12 come back changed**: four texts
re-measured and moved, `rawText` dropped from all five, `index` rewritten on
four, both arrows inset by half a stroke width, and freedraw handed
`lastCommittedPoint`, `pressures` and `simulatePressure`. It asserts field
names rather than values, so the text measurements can move without the check
crying wolf, and it plants a width Excalidraw must correct at the end to prove
a zero would be a real zero rather than a broken read-back.

**Risks:** none to the existing suites, because it is not wired into them yet.
The risk was that a browser cannot be driven from a check at all. It can.

## Stage 5. One converter

**TASK-072.** After stages 2, 3 and 4.

`src/core/expand-elements.ts` becomes the only converter, imported directly by
the frontend the way `src/core/labels` and `src/core/appearance` already are.
The agent-friendly shape is accepted at the API boundary, converted once on
write, and never seen again. Reads return native, because a conversion on read
is a second converter.

Its twelve constants are corrected against the table in
`server-is-the-truth.md` section 1C: `fontFamily` 1 to 5, label `fontSize` 16
and 14 to 20, bound text `strokeWidth` 1 to 2, standalone text `textAlign` and
`verticalAlign`, rectangle `roundness`, freedraw `strokeWidth` and
`strokeColor`, `elbowed` on a line, `lastCommittedPoint` on freedraw, and arrow
points inset by half the stroke width. Twelve constants are a morning. The two
measured fields are whatever stage 3 said they are.

`frontend/src/canvas/elements.ts` stops converting on read, and with it go
`restoreBindings`, `planLabelExpansion`, `adoptReusedLabelIds`,
`dropSpentLabelSeeds`, `recenterBoundShapeTextElements` and
`rescueStrayBoundTextElements`, every one of which exists to correct a
conversion that no longer happens.

**Risks:** the worst in the plan. `labels` has 128 checks and most are about
machinery being deleted; expect to rewrite `check-labels.mjs` rather than keep
it passing, with its subject moving from "the seed and the text stay in step" to
"there is one representation, and here is the proof". `obsidian` has 108.
`geometry`, `changes`, `boards`, `branch` and `side-by-side` all read element
shape and all move.

## Stage 6. Delete the label seed

**TASK-073.** After stage 5.

Once conversion happens once on write, the seed has nothing left to do, and
keeping it keeps the bug alive. A labelled rectangle currently carries
`label: {text}` on the container, a bound text element, and a `boundElements`
entry, all three stored. `labelStatements` re-states the seed on purpose
(TASK-028) so an agent's rename can win. Two spellings need a rule for which
wins, the rule runs every cycle, and TASK-024, TASK-028 and TASK-029 were each
that rule being wrong in a new way.

`labelStatements` and `labelClearances` go. After that a human retyping a label
edits a text element, and the text element is the label. TASK-028 and TASK-029
stop being possible rather than staying fixed.

The seed stays as input. An agent still writes `{"label": {"text": "..."}}`, and
`describe` still folds a container and its bound text into one line, so nothing
an agent does gets harder.

**Risks:** `labels` again, `changes` and `branch` because `compare` reads labels
to name nodes, `obsidian`.

## Stage 7. A write returns the document

**TASK-074**, then **TASK-075** and **TASK-076**. After stage 5.

`POST /api/elements/changes` returns the board's elements alongside the counts
it already returns. A pane applies the response to its own write as the whole
document, inside the existing `settle()` suppression, and keeps merging another
writer's broadcast by id. The reason for that split is concrete: a pane holding
400 ms of undelivered drag that received a full document computed without it
would lose the drag, and the response to a pane's own write cannot be missing
what that pane just sent.

The browser still sends a delta upward. The baseline is what stops a stale tab
claiming a deletion for an element it never received (TASK-016), and that is not
being given up.

Four things are settled and should not be redesigned. The echo is applied
immediately on arrival with no gate: a drag survived 70 writes to another
element and 40 to itself, and a text editor survived 18 full-document applies
with focus and every typed character intact. It does not need the mutex, so this
stage runs before stage 9. It costs 3.4 ms at 55 elements and 14.0 ms at 300, on
a response that was already being sent, and it cannot touch drag latency because
the report is a trailing debounce and the echo arrives after the gesture is
over. And the one thing that does harm is an id changing, which is stage 2.

TASK-075 is the agent's half, and it is deliberately not the same thing. A
300-element board is 229,551 bytes, roughly 60,000 tokens; `align` in a loop
would pull 1.2 million tokens through an agent's context to move twenty boxes.
So an agent gets the elements its write touched in their resulting form,
including ones the server created and it never named, plus a board fingerprint
of element count and the sha-256 of the note bytes, which costs 0.11 ms. The
whole document only behind an explicit flag.

TASK-076 is the check that makes the whole change worth having: a long session
of interleaved agent and human writes, asserting the two documents stay
byte-identical after every cycle rather than at the end. TASK-024 took many
round-trips to reach 42 copies of one label, so a three-cycle check proves
nothing.

**Risks:** `boards`, `side-by-side`, `changes`, `labels`, `parity` for TASK-075.

## Stage 8. The vault is the truth

**TASK-061** and **TASK-060** and **TASK-077** first, then **TASK-078**, which
carries **TASK-063**, then **TASK-079**. After stages 1 and 7.

Three things have to be true before the note can be the only copy, and each is
a bug that is survivable today and not survivable after.

`src/server.ts:2691` writes a note with a bare `writeFileSync`. Today a torn
write loses the last save while the canvas still holds the work. Under this
stage it loses the board. The pattern is already in the codebase, at
`src/core/repo-registry.ts:116`. The cost is not small and is not negotiable
afterwards: the fsync-and-rename is 5.15 to 5.25 ms of a 6.21 ms cycle at 55
elements, and it does not vary with size.

`src/server.ts:2679` builds a note's `filesObj` from the process-global `files`
map with no board filter, so saving board A writes board B's images into A's
note, and `ingestSceneElements` at `src/server.ts:2393` never restores
`scene.files` on the way back. Today that fires on the 9 explicit saves a day
`stateless-server.md` measured. After this stage it fires on all 370 writes, and
the read half moves onto the hot path, where dropping `scene.files` would delete
the images rather than merely fail to render them.

And the scratch board is seeded in memory at `src/core/board-store.ts:72-76`
with `vaultBacked: false`. It gets a home at
`<vault>/.archboard/scratch.excalidraw.md`, following the library's precedent at
`src/core/library.ts:56`, or it is the one board ADR 0015 does not cover.

Then TASK-078. Every request that reads or writes a board reads the note, and a
write writes it back. 6.21 ms at 55 elements and 9.75 ms at 300, which against
the busiest measured second of 7 writes is 68 ms, or 7% of that second, on a
board four times larger than anything real. `BoardState.note` goes with the rest
(TASK-063), and `BoardState.baseline` becomes a fresh read of the file rather
than a hash remembered from the session start, which is what keeps ADR 0006's
overwrite and save-elsewhere outcomes meaningful: the question becomes "did this
change in the last two milliseconds", not "did this change since the session
began".

TASK-079 closes the stage. ADR 0006 survives ADR 0015, but the moment it fires
moves from `board save`, which somebody chose, to 400 ms after a human lifts
their finger, which nobody did. A modal whose best offer is "discard what you
just drew", arriving mid-thought, is worse than the problem it reports. So a
refused write stops persisting the board, marks it, holds further changes, and
offers ADR 0006's three outcomes when the human asks for them. The pane keeps
its scene either way, so nothing is lost while it waits.

**Risks:** `boards` and `obsidian` most of all. `hot`, because `kept()` is the
registry of what survives a reload and this changes what is in it. `changes`,
`branch`, `side-by-side`, `repos`, and `install` for the documentation. CLAUDE.md
says the board store is "not a cache of the vault, and nothing here is written to
disk until a save", and `src/core/board-store.ts` opens with a header saying the
same; both become wrong.

## Stage 9. One writer at a time

**TASK-066**, then **TASK-067**, then **TASK-080** and **TASK-081**, and
**TASK-062** last. After stages 1 and 8.

TASK-066 goes first and touches no behaviour. The constants that govern
flushing, settling, retrying and locking are scattered across
`frontend/src/canvas/useCanvasSession.ts` lines 34, 35, 40 and 47 and
`src/core/change-feed.ts` lines 62 and 63, and the lease, the renewal interval
and the wait cap are about to join them. Defining those in the file that
implements the mutex is exactly the scattering the task exists to stop.

TASK-067 builds the mutex as one interface: ask to write a board, and either
write it or learn who holds it. The lock file lives beside the note rather than
in a process, because under stage 8 two canvas servers over one vault would not
see each other's memory. It is a lease that expires, so a holder that dies costs
one lease rather than the board. And it is a broadcast as well as a guard,
because Excalidraw applies a drag locally the instant a finger moves, so a pane
whose board is held elsewhere disables interaction before the touch rather than
refusing the write afterwards.

Two things the ADR assumes that the code does not currently support, both now
recorded on the task. ADR 0016 says the first change of a gesture takes the
lock; nothing reaches the server at the first change, because `scheduleReport`
at `useCanvasSession.ts:390` is a 400 ms trailing debounce with no maximum wait,
restarted on every change, so a continuous drag posts nothing until 400 ms after
the finger lifts. Taking the lock needs a new immediate message. And change
reports are deliberately not gated on the socket, so a pane whose socket has
dropped never hears the lock broadcast and would keep letting a human draw into
a write that will be refused. The claim has to fail closed.

TASK-080 is the long claim, split out because it is a different amount of work.
An agent that knows it is about to redraw a board claims it with a reason and an
expected duration, renews while it works, loses it in seconds if it dies, and
loses it immediately if a human touches the board. A lock excludes writers from
each other; it must not lock a person out of their own wall. The pane shows who
holds it and why, because a 75-inch display that stops responding for minutes
with no explanation is worse than one that is visibly busy. TASK-081 teaches the
skill when to claim, which is judgement the code cannot supply: claim for a
redraw, do not claim to move one box.

TASK-062 lands last, because what the indicator says depends on both the store
and the lock. Under stage 8 there is no unsaved board, so half of what it was
asked to distinguish stops existing. What survives is the other half and it gets
more important: a note can still be ahead of what a pane holds, because the lock
stops archboard processes and not Obsidian, a sync client, or a text editor.

**Risks:** `side-by-side` and `boards`, because the lock broadcast is a new
message on the same socket protocol panes use. `changes`, because the settle
window and the report debounce end up in one module. `parity`, because claiming
is a new agent-facing action on both surfaces. `install`, for the documentation.

## What has to be decided before a stage can start

Six things are open. Four of them gate a stage and are on the task that owns
them.

**How text is measured outside a browser.** Gates stage 5, owned by TASK-070.
The three outcomes are three different amounts of work and one of them puts a
documented hole in ADR 0015. Nothing in stage 5 should start before this
reports.

**How a check drives a browser.** Settled by TASK-071, and it costs no
dependency: `agent-browser` is already on PATH, and two of its commands carry
the whole check. `open` points a headless Chrome of its own at the throwaway
canvas, and `eval` runs the read-back in the page. Nothing is added to
`package.json` and no browser is bundled, which is why the check exits 2 rather
than failing when it cannot find either — a fresh CI runner has neither, and
that is TASK-082.

The read-back is the part that could have gone wrong. The frontend exposes no
handle on the Excalidraw API, so `scripts/check-fixed-point.mjs` walks the
React fiber up from the `.excalidraw` node to the App instance and asks its
scene. That is an internal, and it is still better than the alternative:
forcing a change report needs a keystroke to arm the pane, and the keystroke
edits the board, so the report would mix Excalidraw's corrections with the
check's own typing.

This was open because no script in `scripts/` drove a browser: all fifteen
stood WebSocket clients in for panes and said so. That showed nobody had done
it, not that it could not be done, and stage 5 keeps its acceptance test.

**What a canvas with no vault does.** Answered by the user: it refuses to
start, and the refusal points at the install step that chooses a vault.
Choosing one is already an explicit part of installing archboard into a
repository, so the ordinary path is unaffected. Recorded in ADR 0015 with
both rejected alternatives. Owned by TASK-077.

**What is allowed to stay in memory.** Gates stage 8, owned by TASK-078. ADR
0015's carve-out names sockets, pane registrations, focus and selection. It does
not name the change feed's `baseline` and `checkpoints` at
`src/core/change-feed.ts:89,119`, or `snapshots` at `src/types.ts:362`, and all
three hold copies of a board. The argument for keeping them is that they hold
the board as it stood at a past moment and the disk holds it as it stands now,
so the vault never held them and statelessness does not move them anywhere.
That argument is good and it is not written in the ADR, which is where somebody
will look for it.

**How a human's gesture takes the lock.** Gates stage 9, recorded on TASK-067.
The trailing debounce means the choice is between a new immediate message from
the pane and a different definition of when a human's hold begins.

**What happens to an agent's in-flight work when a human revokes a claim.**
Owned by TASK-080. ADR 0016 says the agent is told and stops, which is clear
about the agent and silent about the half-drawn board it leaves behind.

## Where the ten open tasks land

| Task | Verdict | Stage |
|---|---|---|
| TASK-065 | Changed: it is the parent, and the plan is here | all |
| TASK-064 | Stands; ADR 0015 closes the alternative it offered | 1 |
| TASK-060 | Still real; the fix moves to the note boundary and gets urgent | 8 |
| TASK-061 | Was tidy-up, now a prerequisite | 8 |
| TASK-063 | Superseded; it is a line item in TASK-078 | 8 |
| TASK-066 | Stands; now explicitly before TASK-067 | 9 |
| TASK-067 | Stands; the long claim split out, two assumptions corrected | 9 |
| TASK-062 | Half superseded; the other half survives and grows | 9 |
| TASK-056 | Stands; one stale file reference corrected | outside |
| TASK-058 | Stands | outside |

TASK-056 and TASK-058 are outside the order on purpose. Neither ADR touches
them, they do not depend on anything here, and nothing here depends on them.
They share the file `src/server.ts` with this work and nothing else, so they can
be picked up whenever somebody wants a small win.

## What is explicitly not being done

**Autosave with memory authoritative.** This is option C from
`stateless-server.md`, and it was the recommendation of that investigation. The
user overruled it in favour of statelessness. Its two blockers were the fan-out,
which stage 1 removes, and ADR 0006's second copy, which stage 8 answers by
re-reading the note per write instead of per session.

**A queue that orders writes instead of excluding them.** ADR 0016 rejected it
in its second paragraph. Ordering an agent's redraw against a human's drag
produces a clean interleaving of two intentions that nobody asked to combine.
Exclusion says only one of you is editing this board, which is what is actually
true.

**Gating or delaying the echo.** Measured unnecessary. A drag survived 70 writes
to another element and 40 to itself; a text editor survived 18 full-document
applies. The protection is Excalidraw's own, not something we would be adding,
and a queue that held the echo until a gesture ended would not help with the one
real failure, because the next keystroke still goes to a renamed element.

**Returning the whole board to an agent by default.** 60,000 tokens at 300
elements, and 1.2 million through a twenty-step loop. TASK-075 gives the same
guarantee in a shape an agent can afford.

**Merging two Excalidraw scenes on conflict.** ADR 0006 already rejected
file-watch-and-reload for this reason: scenes do not merge meaningfully, so a
merge swaps which side loses work silently rather than fixing anything.

**Making the lock stop Obsidian.** It cannot. A lock file stops archboard
processes and not the Excalidraw plugin, a sync client, or a text editor. ADR
0006's hash check stays for exactly those writers, and the convention stays too:
keep a board open in one editor at a time.

**Moving the change feed, snapshots or session state to disk.** See the open
question above. The change feed's baseline is the board as it stood at the last
emitted event, which the vault never held, so a stateless server still keeps
memory a restart destroys. It moves the boundary rather than removing it, and
that is the honest description.

**A better estimate of text width.** Excalidraw writes exactly what
`measureText` returns, so an estimate is the wrong kind of answer regardless of
how good it is. Stage 3 looks for a measurement or a documented fallback, not a
better guess.

**Migrating boards already in the vault.** The eight-character rename is
deterministic, so boards keep the ids they have and nothing needs rewriting.

## What this plan does not cover

Named so nobody assumes it was considered.

`fsync` was measured on local ext4 only, and every write budget here assumes a
local vault. What an Obsidian sync client does with hundreds of writes a day to
one note is unknown, and it is the one thing that could push the write pattern
around enough to change stage 8's shape.

Time to paint after `updateScene` was never measured, because
`requestAnimationFrame` does not fire in a backgrounded tab. The cost of the
call is known; the cost of the frame is not.

And the browser transfer figure has a 40x gap against the same bytes from a node
client that nobody explained. 14.0 ms at 300 elements is a pessimistic number
carried through this plan on purpose.
