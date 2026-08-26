---
status: draft
implements: 0015, 0016
---

# Getting to a server that is the truth

> Historical measurement record (2026-08-20). Source paths below identify the
> pre-deep-module tree that was measured and are not current navigation. The
> staged implementation plan is complete. Archboard is now CLI-only; current
> validation and suite names live in `docs/agents/test-suite.md`.

ADR 0015 decided that the vault is the truth and the agent-friendly shape is an
input format. ADR 0016 decided that a board has a mutex. This plans the work
against those decisions and puts numbers on what it costs.

Everything below was measured on 2026-08-20 against the running code, on a
throwaway server on port 41537 with a throwaway vault, and in a browser tab I
opened myself. The canvas on port 3000 was read but never written and its two
panes were not touched. Where a number is missing I say so.

**Short version.** Dropping `convertToExcalidrawElements` leaves us with one
converter, which is necessary. It is not sufficient. Excalidraw is still the
renderer, and it silently corrects anything it disagrees with: I measured one
render of a saved note changing 13 of its 15 elements. Our converter and
Excalidraw's disagree on fifteen fields, thirteen of which are constants we
picked differently and can just change. The other two are the measured width and
height of every piece of text, and I could not find a way to compute them
correctly outside a browser. That is the largest risk in this plan and section 3
is about nothing else.

The rest is cheaper than expected. Applying a whole 300-element document costs
0.8 ms in the browser and 0.16 ms to serialise. A document applied under a
human's finger does no harm, and I tried hard to make it. The one thing that does
harm is changing an element id while a text editor is open on it, which discards
the human's typing with no error at all.

---

## 1. The divergence, field by field

One board of nine agent-authored elements, covering every type an agent can
create. Dumped from the store, rendered in a real browser, forced through a full
change report, dumped again. And separately run through
`expandElementsForExport`, which is what writes the note.

There are three shapes in play today, not two.

| Path                               | What it holds                                                     |
| ---------------------------------- | ----------------------------------------------------------------- |
| An agent wrote it, no browser open | Seeds. `label`, `start`, `end`, no bound text elements.           |
| A browser has rendered it          | Excalidraw-native, **plus** the seeds, which are still there.     |
| It was saved and reopened          | Our exporter's output. No seeds. `rawText` on every text element. |

The middle row is the worst, because it is a mixture. After one human drag of one
box, my nine-element board held four elements in seed form and five in native
form, in the same map, with nothing recording which was which.

### A. Fields the store does not have

A rectangle created through the API has nine keys. After one browser render it
has thirty-one.

Added to every element: `angle`, `strokeColor`, `backgroundColor`, `fillStyle`,
`strokeWidth`, `strokeStyle`, `roughness`, `opacity`, `groupIds`, `frameId`,
`index`, `roundness`, `seed`, `version`, `versionNonce`, `isDeleted`,
`boundElements`, `updated`, `link`, `locked`.

Added to text: `originalText`, `fontFamily`, `fontSize`, `textAlign`,
`verticalAlign`, `autoResize`, `lineHeight`, `containerId`, and a measured
`width` and `height`.

Added to arrows and lines: `points`, `lastCommittedPoint`, `startBinding`,
`endBinding`, `startArrowhead`, `endArrowhead`, `elbowed`.

Added to freedraw: `lastCommittedPoint`.

None of these is contentious. They are defaults and the converter fills them in.

### B. Two spellings of one fact, both kept

- `label: {text: "AuthService"}` on the container, **and** a bound text element,
  **and** a `boundElements` entry pointing at it. All three survive the
  round-trip. The seed is not cleared when the text exists, because
  `labelStatements` deliberately re-states it (TASK-028) so an agent's rename can
  still win.
- `start: {id}` and `end: {id}` on an arrow, **and** `startBinding` and
  `endBinding` carrying `elementId`, `focus` and `gap`. Both survive. The first
  is what `resolveArrowBindings` reads, the second is what Excalidraw reads.
- `text` on a non-text element, an older client alias for `label`, now spent by
  `applyElementInput` before the element reaches the board map.

Under ADR 0015 all three disappear, because the seed is consumed at the write
boundary and never stored.

### C. Where our converter and Excalidraw disagree

This table is the acceptance specification for stage 1. Given the same nine
elements, these are the fields on which `expandElementsForExport` and
`convertToExcalidrawElements` produce different documents.

| Field                              | Ours                | Excalidraw's          | Kind                             |
| ---------------------------------- | ------------------- | --------------------- | -------------------------------- |
| `fontFamily` on any text           | 1 (Virgil)          | 5 (Excalifont)        | constant                         |
| `fontSize` of a shape's label      | 16                  | 20                    | constant                         |
| `fontSize` of an arrow's label     | 14                  | 20                    | constant                         |
| `strokeWidth` of a bound text      | 1                   | 2                     | constant                         |
| `textAlign` of standalone text     | `center`            | `left`                | constant                         |
| `verticalAlign` of standalone text | `middle`            | `top`                 | constant                         |
| `roundness` on a rectangle         | `{type: 3}`         | `null`                | constant                         |
| `strokeWidth` on freedraw          | 2                   | 1                     | constant                         |
| `strokeColor` on freedraw          | `#1e1e1e`           | absent                | constant                         |
| `elbowed` on a line                | `false`             | absent                | constant                         |
| `lastCommittedPoint` on freedraw   | absent              | `null`                | constant                         |
| Arrow `points`                     | `[[0,0],[84,0]]`    | `[[0.5,0],[83.5,0]]`  | constant (half the stroke width) |
| Bound text id                      | `<container>-label` | a 21-character nanoid | see section 4                    |
| Text `width`                       | estimated           | **measured**          | section 3                        |
| Text `height`                      | estimated           | **measured**          | section 3                        |

Twelve constants, an id scheme, and two measured fields. The constants are a
morning's work. The measured fields are the whole problem.

Concretely, on this board: our estimator says the "AuthService" label is 220 x 60
and the truth is 90.54 x 20. It says a twenty-character caption at size 20 is 240
wide and the truth is 163.27. Every label height it writes is three times too
tall.

### D. What the estimate costs on disk

The note is what the estimate gets written into, so the note is wrong. I saved a
15-element board, opened it, rendered it once in a real browser, and diffed what
came back against what the note held.

**13 of the 15 elements changed on a single render.** Five text elements were
re-measured. Three arrows gained a `width` and `height` the note did not carry
and had their points inset by half a pixel. Ten had `index` rewritten. One
freedraw gained `lastCommittedPoint`. Three containers got a `label` seed added
back, by `labelStatements`.

### E. The document Excalidraw agrees with is a fixed point

The same test the other way round is why this is worth doing at all. I took a
board already in Excalidraw's native form, handed it back through `updateScene`,
and diffed.

| Board                 | Elements | Elements Excalidraw changed | Fields       |
| --------------------- | -------- | --------------------------- | ------------ |
| Real 13-element board | 13       | **0**                       | none         |
| Synthetic 55          | 55       | 42                          | `index` only |
| Synthetic 300         | 300      | 287                         | `index` only |

The synthetic boards are mine, built by cloning one scene 23 times, so 300
elements shared 13 distinct `index` values and Excalidraw repaired the
duplicates. That is correct behaviour on malformed input.

The real board changed nothing at all. Once the document is what Excalidraw
renders, handing it back is free and silent. Every bounce we have ever seen comes
from handing it something else.

**So the target for our converter is not "one implementation". It is "output
inside Excalidraw's fixed-point set".** One implementation is how you get there
and it does not get you there by itself.

---

## 2. What ADR 0015 does not yet buy

Worth stating plainly, because it changes how stage 1 has to be checked.

Dropping `convertToExcalidrawElements` removes a converter we do not control.
It does not remove Excalidraw. Excalidraw is still the renderer, it still holds
the document while a human edits it, and it still corrects anything it disagrees
with, silently, at render time. Section 1E is the evidence: a note that says a
label is 220 x 60 becomes 90.54 x 20 the moment a browser opens it, and the
correction comes back up as a change report.

Under ADR 0015 that correction is a write. It takes the lock, rewrites the note,
and echoes. So a board an agent draws headlessly is rewritten the first time
somebody looks at it, and "the note is the truth" is briefly untrue in a way
nobody can see.

That is survivable. It is deterministic, it converges after one render, and it
happens on a path that is now explicitly a write rather than a hidden drift. But
it means stage 1's check cannot be "there is one converter". It has to be
"convert a board, render it in a real browser, and assert the browser reports
nothing back".

---

## 3. Text measurement is the risk

I spent the most time here because it decides whether stage 1 is a morning or a
month.

**Excalidraw's width is exactly what `measureText` returns.** I ran
`convertToExcalidrawElements` headless under bun with a shimmed DOM, with a
deliberately fake measurer fixed at 7 px per character. A twenty-character string
came out 140 px wide and "AuthService" came out 77. There is no estimation and no
correction anywhere in the path. Whatever measures, decides.

That rules out getting it right by being cleverer about estimating. Our current
0.6 x fontSize per character is not a bad estimate that needs tuning, it is the
wrong kind of answer.

**A pure-JavaScript advance-width sum does not reproduce Chrome.** Excalidraw
ships Excalifont in its own package as seven woff2 subsets. I read them with
fontkit, summed the advance widths, and compared against five strings whose
widths I had read out of a live Excalidraw at fontSize 20.

| String                 | Chrome  | fontkit, best subset | Off by |
| ---------------------- | ------- | -------------------- | ------ |
| `a standalone caption` | 163.271 | 203.660              | 40.4   |
| `AuthService`          | 99.971  | 114.500              | 14.5   |
| `Queue`                | 52.197  | 58.760               | 6.6    |
| `Gate`                 | 37.754  | 48.920               | 11.2   |
| `gRPC`                 | 47.803  | 52.360               | 4.6    |

Six of the seven subsets do not carry the Latin glyphs at all and fall back to
`.notdef`, which puts them out by up to 183 px. The 217-glyph subset is the right
one and is still out by 4.6 to 40.4 px. The ratio is not constant, so it is not a
units-per-em mistake.

I do not know why. Three candidates I did not test: Chrome fell back to a system
font because Excalifont had not finished loading when those elements were
measured, Excalidraw applies something on top of the raw advance, or fontkit is
picking different glyphs than the browser's shaper. Resolving this is the first
thing stage 1 should do, and it is small: load Excalifont explicitly in a page,
measure the same five strings, and see whether Chrome's numbers move.

**What each outcome means.**

- If Chrome's numbers move to match fontkit, the font had not loaded, a pure-JS
  measurer works, and stage 1 has no native dependency. Best case.
- If they do not, the server needs a real canvas with Excalifont registered
  (`@napi-rs/canvas` or similar), which is a native dependency on a box that
  currently has none. Then the check is whether its metrics match Chrome's to the
  pixel, which I also have not tested.
- If neither works, the honest fallback is that the server writes the geometry it
  can compute and the first browser corrects the text. That is section 2's
  behaviour made permanent rather than transitional, and it is a real second
  representation confined to two fields on one element type. I would take it over
  shipping widths that are 76 px wrong, but I would not pretend it satisfies ADR 0015.

---

## 4. Ids

`regenerateIds: true` at `frontend/src/canvas/useCanvasSession.ts:624` is only on
the mermaid path, where it is correct: mermaid emits ids like "A" that would
collide with an earlier conversion. The delivery path at
`frontend/src/canvas/elements.ts:287` already passes `regenerateIds: false`, and
container ids do survive it. Under ADR 0015 both calls go away with the converter
they belong to, so the flag stops being a question.

What does not go away by itself is the note writer. `wrapSceneAsObsidianMd`
renames any text element whose id is not one to eight characters from Obsidian's
block-id alphabet, because a block reference cannot hold anything longer, and
rewires every reference to it. I saved a board with five text elements and four
of the five were renamed:

```
text-plain               -> Koh9JpWT
0fiCOql98KV5AVNsb7yti    -> QO4jtmur
M0uzDDmr3XAuPV1LLV0qO    -> vbJqUUt6
GOThTByyWuX7VIo4b-EbG    -> ct9GeNvu
AbCd1234                 -> AbCd1234   (already eight characters)
```

Today that is harmless, because the rename lands in the note and the store keeps
its own ids. Under ADR 0015 the note is the store, so the rename is what the
browser gets back.

### Why an id change is the most dangerous thing here

I measured it. With a text editor open on a bound label, I applied a document in
which that text element had been renamed. The textarea stayed on screen, stayed
focused, and kept its value. The scene no longer held the id the editor was bound
to. I typed five characters and pressed Escape.

**The five characters were discarded. Nothing errored, nothing warned, and the
label kept its old text.**

No amount of timing helps. Holding the echo until the gesture ends does not fix
it, because the human's next keystroke still goes to an element that is gone.

**So every id the server mints is one to eight characters from Obsidian's block
alphabet, minted once, at the write boundary.** Then the note writer has nothing
to rename and an echo can never rename an element out from under a cursor.
`stableId8`'s collision handling moves from the writing site to the minting
site, which is where it belongs.

This is worth doing on its own, before stage 1, because it removes silent data
loss from the code as it stands today.

**Correction, from doing it (TASK-069).** This section claimed `generateId`
already produced eight-character ids. It did not: it was
`Date.now().toString(36) + Math.random().toString(36).substring(2)`, 18 or 19
characters, so every id the server minted needed renaming on the way into a
note. `expandElementsForExport` was a third renaming site the section missed,
naming a bound text `${container}-label`. Everything else here stands, including
the four measured renames, which `check-obsidian-md` now pins as golden values.

**The other half, from TASK-098.** The measurement above was made by applying a
renamed document by hand. It happens on its own for anything a person draws,
because Excalidraw names a text element with a 21-character nanoid and the note
writer cannot keep one. Measured in a real browser, on the build that had
TASK-069 in it: a hand-drawn text typed "hello", left across one write, then
" world" came back as `"hello"`; a hand-added label typed "ABCDE", left across
one write, then "FGHIJ" came back as `""`. Six characters and then all ten,
with `appState.editingTextElement` still naming the id Excalidraw minted while
the scene held the settled one.

Nothing on the server can fix that, so the pane does. The element under a text
editor is withheld from the change report, and the pane renames it itself once
the editor closes, through the same `derivedId`. Reverting the withhold fails 9
of `check-typed-text`'s checks and leaves the board holding three copies of one
text element; reverting the pane's rename fails 2, which are the two that read
the ids off the wire.

---

## 5. What the echo costs

Measured on a 13-element real board, a 55-element board and a 300-element board.
Medians over 200 to 300 iterations for the server, 30 for the browser.

**On the server, and over loopback from a node client.**

|                                          | 13 elements | 55 elements | 300 elements |
| ---------------------------------------- | ----------- | ----------- | ------------ |
| Bytes of the elements array              | 10,675      | 41,848      | 229,551      |
| `JSON.stringify` the response            | 0.01 ms     | 0.04 ms     | 0.16 ms      |
| Whole-board GET, round trip              | 0.10 ms     | 0.19 ms     | 0.40 ms      |
| Today's one-element write, tiny response | 0.19 ms     | 0.19 ms     | 0.11 ms      |

**In the browser, through a real Excalidraw instance.**

|                            | 13 elements | 55 elements | 300 elements |
| -------------------------- | ----------- | ----------- | ------------ |
| `fetch` of the whole board | 3.3 ms      | 6.2 ms      | 16.1 ms      |
| `JSON.parse`               | 0.0 ms      | 0.1 ms      | 0.4 ms       |
| `updateScene`              | 0.1 ms      | 0.2 ms      | 0.8 ms       |

The echo rides back on a response that is already being sent, so there is no
extra round trip and the fixed cost is already paid. The marginal cost is the
extra bytes plus parse plus apply, which against the 13-element baseline is
**3.4 ms at 55 elements and 14.0 ms at 300**.

I want to be honest about the 16.1 ms. From a node client the same 229 KB moves
in 0.40 ms. The gap is browser and Chrome-extension overhead I did not isolate,
and the tab was backgrounded while I measured, so 14.0 ms is pessimistic rather
than real. I did not measure time to paint, because `requestAnimationFrame` does
not fire in a backgrounded tab and I would rather report nothing than a number I
faked.

**Does it change the felt latency of a drag?** No, and it cannot. A pane reports
400 ms after the finger lifts, so no echo is triggered by the drag itself. The
echo arrives after the gesture is over, on a path the pointer handler is not
waiting for.

**Against the measured write rate.** `docs/design/stateless-server.md` counted 370
human change reports over 25 hours: median gap 3.87 s, busiest second 7, busiest
minute 75. Seven echoes in the busiest second is 98 ms of browser main-thread
work at 300 elements and 24 ms at 55. Real vault boards run 18 KB to 55 KB today,
so 55 elements is the honest size and 300 is four times larger than anything
real.

---

## 6. What a full document does to a human mid-gesture

The browser already does this. `applyServerElements` at
`frontend/src/canvas/useCanvasSession.ts:289` builds the whole merged scene,
converts all of it, and hands the entire array to `updateScene` on every single
agent element update. The echo changes where the array comes from, not that there
is one, so the risk exists today and I could measure it today.

Three experiments, all with real trusted mouse input. Synthetic pointer events
do not work: a dispatched `pointerdown` never reached Excalidraw's handler and
`cursorButton` stayed `up`.

**A drag interrupted by 70 writes to a different element.** One write every
120 ms for 8.4 seconds, with a labelled box being dragged through it. The box
landed exactly where I dropped it, its bound label came with it, the other
element reached version 73. Nothing snapped.

**A drag interrupted by 40 writes to the element being dragged.** The agent
repeatedly set the box to (200, 200). The human won: the box ended at the drop
point, version 46, stamped `frontend_sync`. Excalidraw recomputes a dragged
element's position from a snapshot taken at pointerdown plus the pointer delta
and rewrites it on every pointermove, so an intervening `updateScene` is simply
overwritten by the next move.

**A text editor open while the whole document was applied 18 times over 9
seconds.** The textarea stayed present, stayed focused, and kept every character
I typed, including across applies that carried the old text for that element.

So the answer to "when is the echo applied" is **immediately, on arrival, with no
gate**. I tried to make it fight a human and could not, as long as ids hold
still. The mechanism that protects the drag is Excalidraw's own. We did not build
it and it does not depend on our timing.

This is worth reading alongside ADR 0016. The lock's job is to stop two writers
losing each other's work, and it does. The lock is not needed to make the echo
safe to apply, because the echo already is. That matters for sequencing: stage 2
does not have to wait for the mutex.

Two things still need care and neither is about gestures.

**The echo must not bounce.** `updateScene` fires `onChange`, which schedules a
report. The `suppressRef` counter in `settle()` already covers this, and once the
document is native the diff is empty anyway (section 1E), so this is belt and
braces rather than new machinery.

**The echo must not undo an edit the server has not heard about.** A pane holding
400 ms of undelivered drag that receives a document computed without it would
lose the drag. Apply the full document only from the response to _this pane's
own_ write, and keep merging another writer's broadcast by id as
`applyServerElements` does today. That keeps "render the persisted document" for
the pane that wrote, without letting a third party's echo overwrite local work in
flight.

---

## 7. The agent path

ADR 0015 settles the direction: reads return native, and `describe` is how an
agent gets a summary. The remaining question is whether a CLI write should
return the whole board, and the answer is no, for a reason that has nothing to do
with correctness.

At 300 elements the board is 229,551 bytes of JSON, roughly 60,000 tokens. An
agent running `update` twenty times in a loop, as `align` does today, would pull
1.2 million tokens of board through its context to move twenty boxes. At 55
elements it is 41,848 bytes per call, around 11,000 tokens, still ruinous in a
loop.

So the agent gets the same guarantee in a shape it can afford:

- **The elements the write touched, in their resulting form.** Not the payload
  that was sent, the record as it now stands, including the ids the server
  minted, the bound text it expanded and the arrows it re-routed. `PUT
/api/elements/:id` already returns the updated element; this extends it to the
  side effects, which today are only broadcast.
- **A board fingerprint.** Element count plus the sha-256 of the note bytes,
  which costs 0.11 ms at 300 elements. An agent holding the previous fingerprint
  can tell in one comparison whether anything it did not expect has changed, and
  call `describe` if so.
- **The whole document behind an explicit flag**, for callers that want it.

The failure this whole change exists to prevent, a client accumulating divergence
over hundreds of patches, does not apply to the CLI at all. Every CLI invocation
is a fresh process holding nothing between calls, so there is no long-lived copy
to diverge.

---

## 8. The plan

Four stages. Each leaves the suite green and the tool usable.

This was the suite inventory when the plan was written. MCP and parity suites
were retired with the MCP transport; the CLI contract and surviving checks are
documented in `docs/agents/test-suite.md` and all run through `bun run check`.

### Stage 0. One batched write

ADR 0015 says "`apply` already exists for it". **It does not, and this is worth
correcting in the ADR.** `src/cli/commands/elements.ts:54` loops over the update
list and issues one `PUT /api/elements/:id` per entry, then one `DELETE` per
delete. Only `create` is batched. `apply` is one call from the caller's side and
N writes on the wire.

The route that does already batch is `POST /api/elements/changes`, which takes
`upserts` and `deletes` and applies them in one pass. It is the browser's route
and it is exactly the right shape.

Measured, over 20 elements on a 300-element board:

|                                           | Time    |
| ----------------------------------------- | ------- |
| 20 concurrent PUTs, as `align` does today | 2.87 ms |
| The same intent as one batched write      | 0.13 ms |

Twenty times the requests for twenty-two times the latency is a nuisance today.
Against a note that is the truth it is twenty read-modify-write cycles racing on
one file.

Two changes before an agent can use that route: it hardcodes
`source: 'frontend_sync'`, and it calls `noteChange(..., 'human')`, which would
make an agent's own drawing eligible for injection back at the agent. Both want
an origin parameter.

Then `apply`, `align`, `distribute`, `lock`, `group` and `ungroup` route through
it, and `apply` becomes the batch primitive it is already described as.

Historical risk inventory: `geometry`, `changes`, and `boards`, plus the
now-retired `parity` and `mcp` suites that covered the former MCP surface.

### Stage 1. One converter, and it has to land in the fixed-point set

Sequenced: the font spike, then the ids, then the conversion.

**The spike.** Load Excalifont explicitly in a page, measure the five strings in
section 3, and see whether Chrome's numbers move to match fontkit's. Timebox it.
Its outcome picks between "no native dependency", "a native canvas", and "text
geometry stays browser-corrected", and those are three different amounts of work.

**The ids**, per section 4. Eight characters from Obsidian's alphabet, minted at
the write boundary. Shippable on its own, ahead of everything else, because it
removes silent data loss from today's code.

**The conversion.** `src/core/expand-elements.ts` becomes the one converter, its
twelve constants corrected against the table in section 1C, imported directly by
the frontend the way `src/core/labels` and `src/core/appearance` already are.
`frontend/src/canvas/elements.ts` stops converting on read, and with it go
`restoreBindings`, `planLabelExpansion`, `adoptReusedLabelIds`,
`dropSpentLabelSeeds`, `recenterBoundShapeTextElements` and
`rescueStrayBoundTextElements`, all of which exist to correct a conversion that
no longer happens.

`labelStatements` and `labelClearances` go too. A human retyping a label edits a
text element, and the text element is the label. There is no seed to keep in
step, so TASK-028 and TASK-029 stop being possible rather than staying fixed.

The check that matters is not "there is one converter". It is: convert a board,
render it in a real browser, and assert the browser reports nothing back. That is
section 2's point and it is the only check that catches a converter which is
single and still wrong.

Threatens, badly: `labels` (128 checks, most of them about machinery being
deleted), `obsidian` (108 checks), `geometry`, `changes`, `boards`, `branch`,
`side-by-side`. Expect to rewrite `check-labels.mjs` rather than keep it passing.
Its subject moves from "the seed and the text stay in step" to "there is one
representation, and here is the proof".

### Stage 2. A write returns the document

Small, and it does not depend on the mutex (section 6).

- `POST /api/elements/changes` returns the board's elements alongside its counts.
- The pane applies the response to its own write through `applyServerScene`,
  inside the existing `settle()` suppression.
- Another writer's broadcast keeps merging by id.
- A check drives a long session of mixed agent and human writes and asserts the
  pane's document and the server's document stay byte-identical. That is
  acceptance criterion 5 on TASK-065 and it is what makes the whole thing worth
  having.

Threatens: `boards`, `side-by-side`, `changes`, `labels`.

### Stage 3. The vault is the truth, behind the mutex

Now the process can stop holding a board. TASK-067 owns the mutex and TASK-066
owns the timing constants, so this stage is the persistence half.

Measured cost of a full read-modify-write against a note, with a
tmp-write-fsync-rename:

|                             | 55 elements | 300 elements |
| --------------------------- | ----------- | ------------ |
| Note bytes                  | 47,240      | 257,825      |
| Read and parse the note     | 0.21 ms     | 0.85 ms      |
| Render the note             | 0.85 ms     | 3.65 ms      |
| Write with fsync and rename | 5.15 ms     | 5.25 ms      |
| **Whole cycle**             | **6.21 ms** | **9.75 ms**  |

Slightly cheaper than the 11.89 ms ADR 0015 quotes, on the same hardware, because
that figure came from a different measurement path. Either way `fsync` is over
half of it and does not vary with size.

Against the busiest measured second of 7 writes, 9.75 ms each is 68 ms, or 7% of
that second, on a board four times larger than anything real.

**What it cost when it landed** (2026-08-21, TASK-078, same machine, medians
over 200 cycles against a note in a tmpfile vault):

|                                                | 56 elements    | 300 elements    |
| ---------------------------------------------- | -------------- | --------------- |
| Note bytes                                     | 40,406         | 216,346         |
| Read and parse the note                        | 0.23 ms        | 1.10 ms         |
| Render the note                                | 0.78 ms        | 3.80 ms         |
| Re-read the destination for the ADR 0006 check | 0.02 ms        | 0.13 ms         |
| Write with fsync and rename                    | 9.7 to 12.6 ms | 9.7 ms          |
| **Whole cycle**                                | **15.6 ms**    | **18 to 23 ms** |

The parse and the render came in where they were predicted, which is the part
that depends on the board and on our code. The estimate was low on the one part
that depends on neither: the fsync measured 9.7 to 12.6 ms rather than 5.15 to
5.25, and it still does not vary with the size of the board, so the shape of the
prediction held and its constant was about half of what this box gives now. The
whole cycle is therefore two to two and a half times the estimate.

Against the busiest measured second of 7 writes, that is 162 ms at 300 elements
(16% of the second) and 110 ms at 56 (11%). Still comfortable, and the headroom
is smaller than the estimate suggested. The fsync is now over 60% of a write, so
it is the only thing worth attacking if this ever becomes a problem, and
ADR 0015 is what would have to be reopened to attack it.

What has to be true:

- **Stage 0 is done.** Without batching, one `align` is 20 cycles and 195 ms,
  concurrently.
- **The handlers stay synchronous**, so express serialises them and there is no
  interleaved read-modify-write within one process. The mutex handles the
  cross-process case that ADR 0016 is about.
- **Scratch gets a home** at `<vault>/.archboard/scratch.excalidraw.md`,
  following the library's precedent at `src/core/library.ts:56`.

Threatens: `boards`, `obsidian`, `hot`, `changes`, `branch`, `side-by-side`,
`repos`, and `install` for the documentation.

---

## 9. Two things in the ADRs that the code contradicts

Both are decisions made from a conversation. These are notes from the code, not
objections to the decisions.

**ADR 0015: "`apply` already exists for it."** It does not batch. See stage 0.
The sentence should point at `POST /api/elements/changes` instead, which is
already exactly the batched write the ADR wants and is already in use by the
browser.

**ADR 0016: "the first change of a gesture takes it."** Nothing reaches the
server at the first change today. `REPORT_DEBOUNCE_MS` is a 400 ms trailing
debounce with no maximum wait, so a continuous drag posts nothing at all until
400 ms after the finger lifts. The closest thing to an immediate signal is the
selection publish on a 150 ms debounce, which is a different route and does not
fire for every gesture. Taking the lock at first change needs a new, cheap,
immediate message from the pane. It is small, but it is not free, and it belongs
in TASK-067's interface rather than being discovered during it.

One smaller note on the same ADR. Lock state is broadcast to panes over the
socket, and a pane whose socket has dropped will not receive it. Change reports
are deliberately not gated on the socket (`scheduleReport` says so in a comment,
so that a dropped socket does not stop a human's edits reaching the server), so a
disconnected pane can still write while believing the board is free. The write
will be refused, which is exactly the yank ADR 0016 wants to avoid. Whatever
handles that should be decided in TASK-067 rather than found later.

---

## 10. What I could not determine

- **Why fontkit's advance widths do not match Chrome's**, off by 4.6 to 40.4 px
  on five strings. This is the largest open question and stage 1's shape depends
  on it.
- **Whether a native canvas would match Chrome to the pixel.** I did not install
  one.
- **Time to paint after `updateScene`.** `requestAnimationFrame` does not fire in
  a backgrounded tab, and the tab was backgrounded throughout. I have the cost of
  the call, not of the frame.
- **Why a browser fetch of 229 KB takes 16.1 ms when node takes 0.40 ms.** A 40x
  gap through the extension's isolated world that I did not explain.
- **How finely an echo interleaves with a gesture.** Synthetic pointer events do
  not drive Excalidraw, so every gesture result in section 6 comes from trusted
  input, which is better evidence but coarser in time.
- **What an Obsidian sync client does with hundreds of writes a day to one
  note.** Same gap as `stateless-server.md`.
- **`fsync` on anything but local ext4.**

---

## 11. What should be filed

TASK-065 is the parent. TASK-066 and TASK-067 are already filed and are not
restated here.

1. **Route every multi-element write through `POST /api/elements/changes`.**
   `align`, `distribute`, `lock`, `group`, `ungroup` and `apply`. Give the route
   an origin so an agent write is not stamped `frontend_sync` and not classified
   as human by `noteChange`. Prerequisite for everything after it.
2. **Correct ADR 0015's claim that `apply` batches**, and fix the CLI help, which
   says the same thing.
3. **Spike: reproduce Chrome's Excalifont metrics outside a browser.** Timeboxed.
   Decides stage 1.
4. **Mint every id at the write boundary, in eight characters from Obsidian's
   block alphabet.** Independently shippable, and it removes the silent loss in
   section 4 from today's code.
5. **One converter, corrected against the table in section 1C**, imported by the
   frontend, with Excalidraw's dropped from our path.
6. **Delete the label seed.** `labelStatements`, `labelClearances`,
   `planLabelExpansion`, `adoptReusedLabelIds`, `dropSpentLabelSeeds`. Rewrite
   `check-labels.mjs` around one representation.
7. **A check that converts a board, renders it in a real browser, and asserts the
   browser reports nothing back.** The only check that catches a converter that
   is single and still wrong.
8. **A write returns the resulting document, and the pane renders it.**
9. **A check that drives a long mixed session and asserts the two documents stay
   byte-identical.**
10. **The vault is the truth.** Atomic writes, a home for scratch, ADR 0006's
    hash check kept for foreign writers.

---

## Appendix: how these numbers were produced

A throwaway canvas server on port 41537, checked free first, with a throwaway
vault under the session scratchpad. The canvas on port 3000 was read for its
health endpoint and never written, and its two panes were not touched. Browser
work happened in a temporary browser-automation tab that I closed afterwards.

The divergence tables come from a nine-element board covering rectangle, ellipse,
diamond, text, line, freedraw, a bound arrow and a labelled bound arrow, created
through `POST /api/elements` and `POST /api/elements/batch`, dumped, rendered in
a real browser, forced through a full change report with select-all and an arrow
key, and dumped again. The exporter's output for the same board came from calling
`expandElementsForExport` directly with `deterministic: true`.

The note round-trip used a second board saved with `POST /api/boards/save` and
reopened with `reload: true`.

The fixed-point test applied each board through the real Excalidraw instance's
`updateScene` and diffed the scene against what was sent, ignoring `version`,
`versionNonce`, `updated` and the server's own timestamps.

The 55 and 300-element boards were built by cloning the 13-element rendered scene
with rewritten ids and offsets, so they carry real containers, real bound texts
and real bound arrows. Their duplicated `index` values are an artefact of that
construction and are called out where they matter.

Server timings are medians over 200 to 300 iterations in bun on ext4, i7-13700K.
Browser timings are medians over 30 iterations through the page's own
`performance.now()`, in a backgrounded tab.

The headless converter ran under happy-dom in a throwaway project outside the
repo, with hand-written `FontFace`, `document.fonts` and canvas-2D shims, and a
`measureText` fixed at 7 px per character so its influence on the output could be
read directly. The font metrics came from fontkit 2.0.4 reading the seven
Excalifont woff2 subsets that ship in the Excalidraw package.

Nothing under `src/`, `frontend/` or `scripts/` was modified.
