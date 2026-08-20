---
status: draft
candidate-adr: 0015
---

# Can the canvas server be stateless?

The question came from a design intent that was never written down:

> I never really intended the server to hold unsaved changes or state that
> isn't persisted to disk, that was why I initially asked whether the Obsidian
> vault could be used as our persistence layer.

This investigates whether a canvas server can hold no authoritative board
content of its own, with the vault on disk as the truth and memory as a cache
that can be dropped at any moment. Everything below was measured against the
running code on 2026-08-20, on a throwaway server on port 39117 with a
throwaway vault. Where a number is missing I say so.

**Short answer.** The vault can carry the truth. The note is a fixed point:
open then save is byte-identical over three cycles, and two saves of an
unchanged board produce the same bytes. Latency is not the obstacle either.
A full read-modify-write on a board four times larger than any real one costs
11.89 ms, against 0.14 ms today, and a human cannot see the difference.

Two things rule out the strict version. ADR 0006 offers a human three ways out
of a write conflict and two of them need a second copy of the board to exist,
so a server holding no copy can only ever say "reload and lose your work". And
four routes fan one logical operation out into twenty concurrent writes, so
persisting per request turns an `align` over 20 elements from 2.1 ms into
twenty rewrites of the same note.

I recommend option C below: memory stays authoritative, and every board flushes
to its note about half a second after it goes quiet. That gives the principle
what it was actually after, which is a bounded and small window of loss. Today
that window is a whole session, and on 2026-08-20 it was a whole day.

---

## 1. What the server holds today

Every holder in the canvas server process, read out of the source rather than
guessed. The `kept()` names are the registry keys in `src/core/hot.ts`, which
is the complete list of things a hot reload deliberately preserves.

| What | Where | Holds |
|---|---|---|
| `boards` | `src/core/board-store.ts:62` | Every board opened this session, keyed by address. |
| `BoardState.elements` | `src/core/board-store.ts:35` | The elements. This is the authoritative copy, and the only one when the board is unsaved. |
| `BoardState.identity` | `board-store.ts:34` | Board name, variant, level, display casing. Comes from the note and the address. |
| `BoardState.vaultBacked`, `.file` | `board-store.ts:38,39` | Whether the board has a home, and where. |
| `BoardState.note` | `board-store.ts:43` | The last note bytes. Written at `server.ts:2511` and `2707`, **read nowhere**. See finding F1. |
| `BoardState.baseline` | `board-store.ts:54` | Path plus sha-256 plus timestamp. The ADR 0006 conflict check. |
| `BoardState.loadedAt`, `.savedAt` | `board-store.ts:55,56` | Timestamps the shell's dirty indicator reads. |
| scratch board | seeded at `board-store.ts:72,76` | A board with no file. Exists only in memory, by design. |
| `snapshots` | `src/types.ts:362` | Named deep copies of a board, process-lifetime only. |
| `selectionState.current` | `src/types.ts:375` | What the human last picked, canvas-wide. |
| `selectionState.byClient` | `src/types.ts:375` | What each pane has picked. |
| `BoardState.files` | `board-store.ts` | Image blobs as data URLs, per board since TASK-060. It was one process-global map when this was measured, which was finding F2. |
| library `cache.state` | `src/core/library.ts:147` | The stencil palette. Already write-through to `<vault>/.archboard/library.excalidrawlib`. |
| `injector` | `src/core/injection.ts:489` | Config, control socket, observed Codex threads, pending events, debounce timer, counters (`injection.ts:130-141`). |
| `clients` | `src/server.ts:151` | Open WebSockets. |
| `clientIds` | `src/server.ts:155` | Browser client id per socket. |
| `panes` | `src/server.ts:161` | One registration per pane on screen: rect, viewport, focus, element count. |
| `paneBoards` | `src/server.ts:173` | Which board each pane was pointed at. The authority, and it outlives the socket on purpose. |
| `pendingPaneOpens` | `src/server.ts:1580` | In-flight request promises. |
| `pendingPaneCloses` | `src/server.ts:1588` | In-flight request promises. |
| `pendingExports` | `src/server.ts:1817` | In-flight image export promises. |
| `pendingViewports` | `src/server.ts:1976` | In-flight camera-move promises. |
| `changeFeed` | `src/core/change-feed.ts:339` | See the four rows below. |
| `ChangeFeed.watches[].baseline` | `change-feed.ts:89` | The board as of the last emitted event. A deep copy. |
| `ChangeFeed.events`, `.checkpoints` | `change-feed.ts:118,119` | Ring of 200 events and 24 past board states. |
| `ChangeFeed.id`, `.nextCursor` | `change-feed.ts:116,120` | Feed identity and cursor. A hook holds a cursor across turns. |
| `wiring` | `src/server.ts:120` | The bound port, the HTTP server, the WebSocket server. |

One holder is worth naming because it is *not* in the canvas server:
`sceneState` at `src/core/canvas-state.ts:19` lives in the MCP process, holds
`theme`, `viewport` and a `groups` map, and is not behind `kept()`. Group
membership recorded by `group_elements` is therefore lost when the MCP process
exits, and differs between two MCP clients talking to one canvas
(`mcp-dispatch.ts:334`).

### 2. Classified

**Board content, which a note could hold.** `BoardState.elements`,
`.identity`, `.vaultBacked`, `.file`, the scratch board, `files`, and the
`groups` map in the MCP process. This is what the principle is actually about.
Only this list can be lost in a way that costs a human their work.

**Session and display state, meaningless on disk.** `clients`, `clientIds`,
`panes`, `selectionState`, the four `pending*` maps, `wiring`. A socket cannot
be persisted, and a pane that is not on screen is not a pane
(`src/core/panes.ts:15`). Any definition of "stateless" that includes these is
not worth arguing for.

`paneBoards` sits between the two. It is not board content, but it is not
per-socket either: it is the arrangement a human made on the wall, and it
already outlives a dropped connection on purpose. If a reload took it out, two
panes would come back holding the wrong boards, which is a real cost even
though nothing is lost.

**Derived state, rebuildable from the vault.** `BoardState.baseline` (re-read
the file), `BoardState.note` (already re-read at save time, `server.ts:2636`),
the library cache (already write-through), `.loadedAt` and `.savedAt`.

**Derived state that is NOT rebuildable from the vault.** The change feed's
`baseline`, `checkpoints`, `events` and `nextCursor`. The baseline is the board
*as it stood at the last event*, and the disk holds the board as it stands now.
Making the server stateless does not move this to disk, because the disk never
held it. Same for `snapshots`, whose whole point is to be a past state, and for
the injector's thread observations. So a stateless server still keeps memory
that a restart destroys. It just moves the boundary.

### 3. What ADR 0004 actually says

ADR 0004 is about *location*, not authority. Its sentence is "Boards are stored
as `.excalidraw.md` notes in a single Obsidian vault that spans every repository
we work on, rather than inside any one repo", and its reasoning is drill-down,
backlinks and prose. It never says the vault is the live truth.

ADR 0006 answers the question the other way, out loud: "archboard holds the
canvas in memory, the Obsidian Excalidraw plugin holds scene state in memory
when a board is open, and a synced vault is effectively a third writer." The
whole conflict design assumes archboard is one of three memory-holding writers.

So the stateless principle was never recorded, and the one ADR that touches it
assumes its opposite. That is not a contradiction anybody smuggled in. It is a
decision that was made implicitly and is now up for review.

---

## 4. What breaks

### Write frequency, measured

I pulled every human change report out of the canvas log
(`~/.local/state/excalidraw-mcp/excalidraw.log`), 370 of them across 25 hours of
real use.

| | |
|---|---|
| Human change reports logged | 370 |
| Median gap between reports | 3.87 s |
| p10 gap | 0.43 s |
| Gaps under 1 s | 121 (33%) |
| Busiest 1-second window | 7 reports |
| Busiest 10-second window | 22 reports |
| Busiest 60-second window | 75 reports |
| Explicit saves into the real vault, same period | **9** |

The last row is the problem stated as a number. The human touched the board 370
times and the vault learned about it 9 times.

The browser already coalesces. `REPORT_DEBOUNCE_MS` is 400 ms
(`frontend/src/canvas/useCanvasSession.ts:34`), and it is a trailing debounce
with no maximum wait, so a continuous drag posts nothing until 400 ms after the
finger lifts. The 370 reports above are what survived that.

Then I replayed the change feed's own windowing over those 370 timestamps, at
its real settings of `SETTLE_MS` 1200 and `MAX_PENDING_MS` 6000
(`change-feed.ts:62,63`):

| Window | Writes over the same 25 hours |
|---|---|
| 100 ms | 366 |
| 250 ms | 363 |
| 500 ms | 322 |
| 1200 ms (the feed's setting today) | **208** |
| 2000 ms | 202 |
| 3000 ms | 200 |
| 5000 ms | 189 |

This surprised me, and it changes the shape of the answer. The feed's 1200 ms
window removes 44% of the writes and nothing more, and raising it to 5 seconds
only gets to 49%. Real human editing on a wall is already sparse, so there is
almost nothing left for a window to coalesce. The coalescing that matters
happens inside a gesture, and the browser's 400 ms debounce already did it.

So autosave-on-settle and write-through differ by a factor of 1.8 in write
count, not by an order of magnitude. Whatever you think about 370 writes a day,
you should think roughly the same about 208. If write count were the only thing
separating the options, there would be nothing to choose between them.

What a window *does* buy, at any size above about 10 ms, is collapsing an
agent's fan-out. Twenty concurrent `PUT`s from one `align` arrive inside 2.1 ms
(measured below), so even a 100 ms window turns them into one write. That
benefit is available without pushing the window anywhere near a second.

In bytes, one real board is 54,856 bytes for 55 elements, so 322 flushes at a
500 ms window is about 18 MB of rewrites a day against one note. I did not
measure what an Obsidian sync client does with that, and I should not guess.

### ADR 0006 keeps a subject, and loses an outcome

The refusal exists because two copies can diverge. If the server never holds a
divergent copy, the note is still a shared document that Obsidian, a sync
client, or a second archboard can write, so the check still has work to do. The
reason changes from "my copy and yours disagree" to "these bytes are not the
bytes I last saw".

What does not survive is the menu. ADR 0006 offers three outcomes and refuses to
pick between them:

| Outcome | Needs |
|---|---|
| Reload, take the note | nothing |
| Overwrite, keep the canvas | a canvas copy to write |
| Save elsewhere, keep both | a canvas copy to write |

Two of the three need a second copy of the board to exist somewhere. A
genuinely stateless server has none, so it can only offer reload. That is the
single strongest argument against the strict version, and it is an argument
from the ADR the user already accepted.

There is a second, sharper problem. Today a conflict surfaces at save, which is
a moment a human chose. Under write-through or full statelessness it surfaces at
the next write, which is 400 ms after a human lifts their finger. A conflict
dialog that interrupts a drag, and whose only offer is "discard what you just
drew", is worse than the situation it replaces.

### What `board save` would be for

Under any of the persisting options, `board save --board X` with no other
argument becomes a no-op, because the note already holds the board. Good
riddance: it is currently the button that has to be pressed and was pressed 9
times against 370 edits.

The other two things `board save` does keep their meaning exactly, and they are
already named in the code. `classifyBoardSave` (`src/core/board.ts:320`) knows
three kinds, and only one of them dies:

- `same-board` becomes automatic. Delete the act, keep a `--force` flush for
  scripts that want a barrier.
- `named` stays. Giving the scratch board a home is a real act.
- `branch` stays, and becomes the main event. `save --as payments@option-a` is
  how a proposal is created, and `restampVariant` (`server.ts:2675`) is exactly
  the copy-on-branch semantics you want when the source is continuously
  persisted.

So yes, branching becomes the only interesting write, and the current/variant
workflow survives intact. If anything it gets clearer, because "save" stops
meaning two unrelated things.

### The scratch board

The precedent already exists in this codebase. The library has the same problem
(no board, needs a home, must not clutter the vault's note list) and solves it
with `<vault>/.archboard/library.excalidrawlib`, a dot-directory Obsidian hides
(`src/core/library.ts:56-57`). Scratch gets
`<vault>/.archboard/scratch.excalidraw.md` by the same reasoning, and
`board save --as <name>` moves it into the vault proper and deletes the
placeholder.

With no vault configured there is nothing to write to, and scratch stays
memory-only. The library already accepts exactly that deal
(`library.ts:67`, `library.ts:175`), so this is not a new exception.

### The change feed baseline

It cannot come from disk, cheaply or otherwise, because disk holds the present
and the baseline is the past. Under every option below, including the strictly
stateless one, the feed keeps its baseline, its 24 checkpoints and its cursor in
memory, and a restart still means `feedId` changes and every consumer starts
over. That is already documented at `change-feed.ts:108-115`.

Persisting it is possible and I do not recommend it. It would mean the vault
carrying archboard's diff bookkeeping, which is our jargon in the human's notes
directory, and the value is one restart's worth of narration.

For scale: on a 300-element board the feed already spends 2.04 ms cloning the
baseline and 5.16 ms diffing per settle. A flush costs 11.70 ms on top of that.
The feed is not the cheap part of a settle today.

### Latency and cost, measured

Two boards. A synthetic 300-element board at 293,467 bytes, which is larger than
anything in the real vault. And a copy of the user's real
`common-weblib/architecture` note, 55 elements at 54,856 bytes. Real vault
boards today run 18,875 to 54,856 bytes.

Medians over 100 to 300 iterations, ext4, i7-13700K.

**Reading a note into live elements**

| Step | 300 elements | 55 elements |
|---|---|---|
| `fs.readFileSync` | 0.02 ms | 0.02 ms |
| sha-256 of the bytes | 0.11 ms | 0.02 ms |
| utf-8 decode | 0.03 ms | 0.02 ms |
| Locate the Drawing block (regex) | 0.70 ms | 0.15 ms |
| `JSON.parse` | 0.40 ms | 0.09 ms |
| **Whole read, file to element map** | **1.27 ms** | **0.25 ms** |

**Writing a board back**

| Step | 300 elements | 55 elements |
|---|---|---|
| `buildScene` (expand for export) | 0.61 ms | 0.12 ms |
| `renderBoardNote` (clone, canonicalise, stringify) | 2.76 ms | 0.53 ms |
| `fs.writeFileSync`, as today | 0.03 ms | 0.01 ms |
| write + `fsync` | 6.22 ms | 6.19 ms |
| tmp + `fsync` + rename | 6.62 ms | 6.28 ms |

**End to end**

| | 300 elements | 55 elements |
|---|---|---|
| Read-modify-write, one mutation, atomic + fsync | **11.89 ms** | **11.07 ms** |
| Write only (memory authoritative), atomic + fsync | **11.70 ms** | **8.99 ms** |

**Over HTTP against a real server, as it behaves today**

| | |
|---|---|
| `POST /api/elements/changes`, 1 upsert | 0.14 ms |
| `PUT /api/elements/:id` | 0.14 ms |
| `GET /api/elements` (300 elements) | 0.31 ms |
| `POST /api/boards/save` (300 elements, no fsync) | 5.12 ms |

Three things fall out of this.

`fsync` is the whole cost, and it does not care how big the board is. 6.2 ms at
55 elements, 6.6 ms at 300. Everything else together is under 4 ms even on a
board four times larger than any real one. If you drop `fsync` and rely on the
page cache, a full read-modify-write is about 5 ms and the numbers stop
mattering at all. I would keep the `fsync`, because the point of this exercise
is durability, and 6 ms of it is cheap.

**A full read-modify-write costs barely more than a write.** 11.89 ms against
11.70 ms on the big board. The read is 1.27 ms out of 11.89. So the choice
between "stateless" and "write-through" is not a performance choice at all. It
is entirely a semantics choice, and section 4.2 already decided it.

Adding roughly 12 ms to a mutation that costs 0.14 ms today is an 85-fold
increase and still invisible to a human. Even the worst observed second, 7
reports, is 84 ms of blocking work.

One caveat I did measure. The Obsidian Excalidraw plugin writes its Drawing
block as `compressed-json` by default, and our decompressor is inlined pure
JavaScript (`obsidian-md.ts:483`). If the human opens a board in Obsidian and
the plugin re-saves it, every subsequent read pays 4.07 ms instead of 1.10 ms on
the 300-element board, and 1.40 ms instead of 0.24 ms on the real one. Under a
read-per-operation design that penalty lands on every call. Under a
memory-authoritative design it lands once, at open.

### Crash and concurrency

**The save is not atomic today.** `server.ts:2690` is a bare
`fs.writeFileSync(file, bytes)`, which truncates and then writes. A crash or a
full disk between those two leaves a torn note. I checked what a torn note does:
truncating at 10%, 50%, 95% and 99.9% all fail with "No Drawing block found",
so it fails loudly rather than silently losing elements, but the board is gone
from disk either way.

I tried to measure how often a concurrent reader catches the gap, with a writer
process looping and a reader process calling `stat`, and got 0 out of 8.4
million samples for both the plain write and tmp+rename. That measurement
proves nothing: `stat` size is the wrong probe for a window that is a single
`write(2)` behind the page cache. I am reporting the hazard from the mechanism,
not from a measurement. Frequency multiplies exposure, so any option that writes
208 or 370 times a day should switch to tmp + fsync + rename first.
`src/core/repo-registry.ts:116` already does exactly that, so the pattern is in
the codebase.

**Two writers.** Nothing changes for the Obsidian case: the hash check catches
it, and it catches it at a worse moment under the persisting options, as
described above. Within archboard, the current handlers use synchronous `fs`,
so express serialises them and there is no interleaved read-modify-write to
worry about. Keep it that way. Going async here would introduce a lost-update
race that does not exist today, and 12 ms of blocking at 7 writes/second is 8%
of one core.

**Four routes fan out, and this is the real break.** `align`, `distribute`,
`lock` and `group` issue one `PUT /api/elements/:id` per element through
`Promise.all` (`src/core/element-ops.ts:88, 131, 145, 158, 184, 227`). I measured an
align over 20 elements at **2.1 ms** today. Persisting per request turns that
into 20 full note rewrites: about 110 ms without `fsync`, about 240 ms with it,
and 20 separate mtime bumps for a sync client to chase. One logical operation,
twenty files on the wire. A windowed flush collapses all twenty into one write.
Nothing else does.

### Two things that must be true, and are

I checked both, because a stateless design is impossible without them.

**The note is idempotent.** Two saves of an unchanged 300-element board produce
identical bytes (md5 `ba8b6269…` twice). This means a flush can render, compare
against the file, and skip the write when nothing changed. That is worth doing:
it keeps a no-op flush from touching mtime.

**The note is a fixed point.** Open then save, three times in a row, all
byte-identical (md5 `808ae28c…`). The vault note is a lossless carrier of a
board.

One caveat. The round-trip flattens the agent authoring format. A rectangle
created with `label: {text: "AuthService"}` comes back as a container plus a
bound text element with no `label` field, and the board goes from 180 elements
in memory to 300. `describe` folds it correctly and reports "120 bound labels
folded in", and `customData` and `link` both survive intact. But under a design
that persists on every operation, that flattening happens immediately rather
than at save, so any caller that writes `label` and reads it back gets a
different shape than it does today.

---

## 5. Options

### A. Fully stateless, read-modify-write per operation

Memory holds nothing authoritative. Every call reads the note, applies its
change, writes the note.

- **Cost.** 11.89 ms per mutation on a 300-element board, against 0.14 ms today.
  Invisible to a human.
- **Buys.** The whole class of bugs behind TASK-042, TASK-048 and TASK-052 stops
  existing, because there are no long-lived in-memory element objects to share.
  TASK-059's main hazard evaporates: a hot reload cannot lose a board that lives
  on disk. There is exactly one place to look when the canvas and the vault
  disagree, because they cannot.
- **Breaks.** ADR 0006 loses two of its three outcomes and can only offer
  reload. Conflicts surface mid-gesture instead of at a save. The four fan-out
  routes become 20 writes per operation. The change feed still needs memory, so
  the server is not actually stateless, only board-stateless. Scratch needs a
  file. The agent element format flattens on first write. Every `panes` call,
  which an agent makes every turn, becomes a disk read per pane.
- **Size.** Large. `resolveBoard` (`board-store.ts:90`) stops meaning "is it
  open" and starts meaning "does the vault have it", which touches every route.
  `board open` stops changing server state. The dirty indicator disappears.
  `boards`, `BoardState`, `snapshots`, `files` all move or go.

### B. Write-through cache

Memory mirrors disk. Every mutation persists before it is acknowledged.

- **Cost.** About 11.7 ms per mutation. 370 note writes a day.
- **Buys.** Zero window of loss. Reads stay in memory, so the compressed-note
  penalty is paid once and `panes` stays free.
- **Breaks.** The same fan-out problem as A, and the same mid-gesture conflict
  problem. It keeps every in-memory copy that caused TASK-042, TASK-048 and
  TASK-052, so it buys none of A's structural benefit. It has A's costs and
  keeps A's bugs.
- **Size.** Medium. One flush call after every mutating route.

I do not think B is worth building. It is A's write pattern without A's payoff.

### C. Autosave on a settle window

Memory stays authoritative. Every board flushes to its note when it goes quiet.

- **Cost.** 322 writes a day at a 500 ms window, or 208 at 1200 ms, about
  11.7 ms each. Window of loss bounded by the flush timer, plus a 6 s ceiling if
  it borrows the feed's `MAX_PENDING_MS` behaviour.
- **Buys.** The fan-out collapses: 20 aligned elements are one write. A refused
  write costs nothing, because memory still holds the board, so all three of
  ADR 0006's outcomes stay available and the conflict can wait for a moment the
  human chose. Everything on the read side is unchanged. `board save` becomes
  branching only.
- **Breaks.** The user's stated principle, strictly read. The server does hold
  unsaved changes, for the length of the window. All three shared-object bug
  classes stay possible. TASK-059's hazard shrinks from "a whole session" to
  "half a second" but does not vanish.
- **Size.** Small. A `flushBoard(key)` called from the same place `noteChange`
  is called (`server.ts:270`), on its own timer. Plus atomic writes, plus a home
  for scratch, plus the conflict path at flush time.

### D. Option C with a git-backed vault

C, plus the vault is a git repo and archboard commits on a longer window, say
every 5 minutes and on every branch.

- **Cost.** C's cost plus a commit. Not measured.
- **Buys.** Every ADR 0006 outcome gets a place to put the losing copy, so
  "overwrite" stops being destructive and becomes recoverable. It also makes A
  viable later, because A's fatal problem is having nowhere to keep a second
  copy.
- **Breaks.** The vault becomes a repo the human has to not fight with. Obsidian
  git plugins exist and are their own problem.
- **Size.** Small on top of C, and orthogonal to it.

---

## 6. Recommendation

**Build C. Treat D as the thing that makes A possible later, and do not build
A yet.**

The reasoning, in order of weight:

1. ADR 0006 is the blocker, not performance. Two of its three outcomes need a
   second copy of the board, and the user has already accepted that archboard
   must never pick between them. A server with no copy of its own can only say
   "reload and lose your work", which is exactly the silent-loss failure that
   ADR was written to prevent. C keeps the copy and therefore keeps the menu.

2. The fan-out routes decide the write pattern. One align is twenty writes under
   A or B and one write under C. That is a property of the API shape, and no
   amount of persistence discipline fixes it. A windowed flush does.

3. The measured gap in write count is small, and I want to be clear that it is
   not the argument. C at a 500 ms window writes 322 times a day, B writes 370.
   C is barely quieter than B. What it buys is the two points above.

4. C closes the incident that prompted this. A canvas holding 45 and 34 elements
   against notes holding 55 and 50 is a session-length divergence. C bounds it
   at half a second and makes the disagreement impossible to sit in unnoticed.

What C should include, all of it small:

- Flush when a board goes quiet, on a timer of its own rather than the change
  feed's. The feed's window answers "is there something worth *saying*", and
  persistence answers "is there something worth *keeping*". Those are different
  questions and the second one wants a shorter window. I would start at 500 ms
  and treat the number as tunable.
- Render, compare against the file, skip the write when the bytes match. Proved
  safe by the idempotence measurement.
- Write tmp + fsync + rename, following `repo-registry.ts:116`. At 322 writes a
  day the torn-note window stops being theoretical.
- Flush on shutdown, on `board open` of the same pane, and before any read that
  another process will make.
- Give scratch a home at `<vault>/.archboard/scratch.excalidraw.md`, following
  the library.
- Keep the conflict at a moment the human chose. When a flush finds the note
  changed underneath, stop autosaving that board, mark it, and put up the
  existing three-outcome dialog. Do not refuse the human's drag.
- Change the dirty indicator to compare rendered bytes against the note, not
  timestamps against timestamps. The current version
  (`frontend/src/shell/Shell.tsx:202`) can only ever say "changed since save",
  and it says nothing at all when the note is *ahead* of the canvas, which is
  the direction the reported incident went.
- Keep the handlers synchronous. Async `fs` would add a lost-update race that
  does not exist today.

### What would change my mind

- **If the fan-out routes became one batch call.** `align`, `distribute`, `lock`
  and `group` are the only reason per-operation persistence is expensive. Fix
  those four and B's write count drops to roughly C's, at which point B's zero
  window of loss makes it the better answer.
- **If the vault were git-backed.** That gives "overwrite" and "save elsewhere"
  somewhere to put the losing copy without archboard holding it in memory, which
  is A's one fatal problem. Build D and A becomes a real option.
- **If the agent element format went away.** If `label`, `start` and `end` were
  expanded at creation rather than at export, memory and note would hold the
  same shape and A would stop being a behaviour change.
- **If an Obsidian sync client chokes on 322 writes a day to one note.** I did
  not measure this and it could push the window from 500 ms up to several
  seconds. It would not change the recommendation, only a constant.
- **If the numbers move by 20x.** Everything here assumes a local ext4 vault. On
  a network filesystem, `fsync` at 6 ms could become 200 ms and the whole
  analysis needs redoing.

---

## 7. Findings worth filing separately

These turned up while reading and are independent of which option is chosen.

**F1. `BoardState.note` is dead state.** Written at `server.ts:2511` and
`server.ts:2707`, read nowhere. The save re-reads the destination file itself at
`server.ts:2636`, which is the correct thing to do. Each open board is holding
19 KB to 55 KB for nothing.

**F2. Every board's save embeds every image in the process.**
`server.ts:2678-2679` builds `filesObj` from the whole `files` map with no
filter by board, so a save of board A writes board B's images into A's note.
And `ingestSceneElements` (`server.ts:2392`) never restores `scene.files` on
open, so images do not survive a reopen at all.

*Fixed, TASK-060.* The process-global map is gone. `BoardState.files` holds a
board's own images, `buildScene` narrows them to the ones the elements it is
writing actually draw, and `ingestSceneElements` takes `scene.files` back off
the note. `/api/files` is board-scoped like every other content route.

**F3. The dirty indicator cannot see the case that prompted this.**
`frontend/src/shell/Shell.tsx:202` compares `status.lastChangeAt` against
`boardInfo.savedAt`. It reports "changed since save" and nothing else, so a note
that is *ahead* of the canvas shows as clean.

**F4. The save is not atomic.** `server.ts:2690`. Low probability today at 9
saves a day, and worth fixing regardless.

*Fixed, TASK-061.* `src/core/atomic-write.ts`: temp file, fsync, rename, and a
best-effort fsync of the directory. Every writer of a vault note uses it, and so
does the checkout registry, whose own rename it replaced.

**F5. MCP group membership is not persisted anywhere.** `sceneState.groups` at
`canvas-state.ts:22` lives in the MCP process, is not behind `kept()`, and is
not shared between two MCP clients on one canvas.

---

## Appendix: how these numbers were produced

A throwaway canvas server on port 39117, checked free first, with a throwaway
vault. The running server on port 3000 was read but never written and its two
panes were not touched.

The 300-element board was built through the real API: 120 labelled rectangles
with `customData` and `link`, 60 arrows, saved through
`POST /api/boards/save`, giving 300 elements on export at 293,467 bytes. The
55-element board is a copy of the user's `common-weblib/architecture` note.

Timings are medians over 100 to 300 iterations after 10 to 20 warm-up runs,
using the real modules (`src/core/board.ts`, `src/core/obsidian-md.ts`,
`src/core/scene-io.ts`, `src/core/changes.ts`) rather than reimplementations.
The write-frequency figures come from 370 real log entries spanning
2026-08-19T19:14Z to 2026-08-20T20:35Z. The window simulation replays the
algorithm in `change-feed.ts:170-197` over those timestamps, varying the quiet
window and holding `MAX_PENDING_MS` at 6000.

Not measured: Obsidian sync behaviour under repeated writes, the Obsidian
Excalidraw plugin's reaction to a note changing while it has the board open,
`fsync` cost on anything but local ext4, and the raw Excalidraw `onChange` rate
before the browser's 400 ms debounce.
