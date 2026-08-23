# The test suite

What each check proves, and the constraints on running them. Read this when
changing tests or CI, or when a browser check fails.

`bun run test` is the whole suite: `bun run type-check` first — it is the only
thing that type-checks, so a type error still fails the suite — then every
check in `package.json`'s chain. `.github/workflows/ci.yml` runs `bun run test`
and nothing else (TASK-082), so a check added to `package.json` runs on main
without anybody touching the workflow. `bun run test:suites`
(`scripts/check-ci-suites.mjs`) fails when a `test:*` script is in neither the
chain nor its skip list. Keep that list empty.

The whole chain takes 171 seconds on a 13th-gen i7, of which the three browser
checks are 62 (11 fixed-point, 13 typed-text, 38 live-session); of the rest,
`test:mcp`, `test:boards` and `test:side-by-side` are two thirds. Re-measure
rather than trust these.

## The three browser checks

Everything else in `scripts/` stands a WebSocket in for a pane, which cannot
catch a renderer disagreeing with us: a socket holds whatever it was sent.
Three checks drive a real browser instead, and all three:

- refuse to claim a pass without `agent-browser` on PATH — they exit 2,
  "I could not run";
- assert `navigator.userAgent` says headless, because a window that maps
  steals focus under Hyprland and these run on every push;
- run one after another, never at once. TASK-097 records that two of them
  sharing the machine is how one of them fails for no reason: contention
  stretches a round trip past `REPORT_DEBOUNCE_MS`, which is exactly the
  window live-session probes on purpose;
- skip the frontend build when `dist/frontend` is already newer than every
  source, so the three build once between them.

### `bun run test:browser` (`scripts/check-fixed-point.mjs`, TASK-071)

Writes a board, renders it, reads back what the pane is holding, and reports
every element and field Excalidraw changed. **It reports zero, and zero is
asserted** (TASK-072): what archboard writes is a document Excalidraw does not
change. About eleven seconds plus the build.

### `bun run test:live-session` (`scripts/check-live-session.mjs`, TASK-076)

Drives 42 cycles of interleaved agent and human writes against one board and
asserts the pane's document and the server's stay identical **after every
cycle**, naming the element, the field, both values and the cycle a divergence
first appeared on. That is what makes "the server is the truth" a property
rather than a claim: the bugs it exists to catch — a label multiplying, a
rename coming back — need a session to build up in. About forty seconds.

It also probes the delivery window on demand (TASK-099). The invariant under
test: an edit somebody made is either on the wire or still in the pane's diff,
and never neither. A delivery goes into the scene and the pane records what it
now believes the server holds — the record is taken at the moment of delivery,
in the same statement sequence as `updateScene`, where nothing can have
happened yet, and the suppression window drains itself: a report that comes
due while one is in flight, or inside that window, is re-armed rather than
dropped. The check patches `Scene.replaceAllElements` so the next delivery
schedules a human's edit in a microtask that runs after the pane's delivery
code and before the record. Four cases land in it every run: a resize, a
retype, a delete, and a move against a delivery naming something else.

The pane carries a loss canary (`frontend/src/canvas/loss-canary.ts`) that
names the element, the field and both values whenever the scene moves inside
that window, and says whether the record swallowed it or the edit is still
owed. It costs a walk of the scene per delivery, so it is off unless the page
has been given `window.__abLoss` — nothing in the frontend does; this check
sets it.

It also owns the half of the board mutex only a renderer can answer
(ADR 0016): the pane accepts a touch on a free board, refuses one the moment
somebody else takes the board, and — with the canvas killed under it —
assumes the board is held rather than free. That gate fails closed:
`!connected || heldByOther`.

### `bun run test:typing` (`scripts/check-typed-text.mjs`, TASK-098)

Draws a text element with the text tool and adds a label to a box with a
double-click, so **Excalidraw mints the ids**, types into both across a write
each with the editor still open, and asserts every character is on the board
and in the note. It is the only check in which a rename can happen at all.
Two halves close the typing-loss gap it guards: the element under a text
editor is withheld from the change report, so the server is never told a name
it would want to change; and the moment the editor is gone the pane renames
it, through the same `derivedId` the server would have called. Reverting the
withhold fails 9 of its checks and reverting the pane's rename fails 2.
`settleBlockIds` and the note writer's own rename stay, as the backstop for a
note archboard did not write. About fifteen seconds.

## Hot reload checks

- `bun run test:module-scope` parses the canvas's import graph and fails on
  module-scope state: a `new` that is not a frozen lookup table, a literal
  something writes to, a timer, a listener added without a paired removal, a
  bind, or a write to long-lived state with no presence guard. Waive a false
  positive with `// hot-safe: <reason>`. Both TASK-057 bugs are fixtures under
  `scripts/fixtures/module-scope/`, so the check proves itself on every run.
- Every reload in dev mode runs a canary (`src/core/reload-canary.ts`) that
  compares which boards are open and where each one's note is, the pane
  registrations, the socket count and the feed's id and cursor across the
  reload, and shouts to the terminal **and** every open tab if anything moved.
  `bun run test:hot` breaks a reload on purpose to prove it fires. It does not
  count elements — a count is a fact about the vault, which a reload cannot
  touch — with one exception kept from TASK-079: a board that has stopped
  saving is the one board whose elements are in this process and in no note.

## Wire and lock checks

- `bun run test:one-write` counts writes on the wire through a proxy, so a
  loop cannot pass itself off as a batch (TASK-068).
- `bun run test:lock` proves the exclusion with two processes over one vault,
  which is the one thing an in-process mutex could not do (ADR 0016).
- `scripts/check-repos.mjs` runs against a registry in a temp file via
  `ARCHBOARD_REPOS`, which is how the tests keep off the real one.
- `check-obsidian-md` pins the four historical id renames measured in
  `docs/design/server-is-the-truth.md` as golden values, so a board already in
  the vault keeps the ids it has.
