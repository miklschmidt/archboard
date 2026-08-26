# The test suite

What each check proves, and the constraints on running them. Read this when
changing tests or CI, or when a browser check fails.

`bun run test` is the whole suite: `bun run type-check` first — it is the only
thing that type-checks, so a type error still fails the suite — then every
check in `package.json`'s chain. `.github/workflows/ci.yml` runs `bun run check`,
which enforces Oxlint (including the custom boundary rules), formatting, and
then that complete test chain. A check added to `package.json` therefore runs
on main without anybody touching the workflow. `bun run test:suites`
(`scripts/check-ci-suites.mjs`) fails when a `test:*` script is in neither the
chain nor its skip list. Keep that list empty.

The whole chain's duration is machine-dependent. The four browser checks run
sequentially; re-measure their contribution rather than trusting an old total.
Of the rest, `test:boards` and `test:side-by-side` have historically dominated.
Re-measure rather than trust that split.

## The four browser checks

Everything else in `scripts/` stands a WebSocket in for a pane, which cannot
catch a renderer disagreeing with us: a socket holds whatever it was sent.
Four checks drive a real browser instead, and all four:

- refuse to claim a pass without `agent-browser` on PATH — they exit 2,
  "I could not run";
- assert `navigator.userAgent` says headless, because a window that maps
  steals focus under Hyprland and these run on every push;
- run one after another, never at once. TASK-097 records that two of them
  sharing the machine is how one of them fails for no reason: contention
  stretches request and frame observations that the checks probe on purpose;
- skip the frontend build when `dist/frontend` is already newer than every
  source, so the four build once between them.

### `bun run test:human-performance` (`scripts/check-human-edit-performance.mjs`, TASK-118)

Keeps the measured 10,000-element human-only reproduction that attributed the
stall to a multi-megabyte normal response and its whole-document browser
reconciliation. It seeds a throwaway vault through the human report route,
uses no agent-origin write in the measured window, delays report delivery so
trusted drag, resize and typing overlap persistence, and records request body
and response sizes, JSON work, frame gaps, hold/report/release counts and
server fsync counts. A normal acknowledgement must be compact and
document-free; a no-correction acknowledgement must perform no scene
replacement.

Its frame assertion is relative to the same run's median and deliberately
loose. Do not replace it with a fixed millisecond gate: browser and runner speed
are not the contract. The structural response/reconciliation assertions and
the locally visible edits are the gate; timings remain diagnostic evidence.

### `bun run test:browser` (`scripts/check-fixed-point.mjs`, TASK-071)

Writes a board, renders it, reads back what the pane is holding, and reports
every element and field Excalidraw changed. **It reports zero, and zero is
asserted** (TASK-072): what archboard writes is a document Excalidraw does not
change. About eleven seconds plus the build.

It also owns the renderer half of malformed-geometry recovery (TASK-117). The
check starts with malformed auto-resizing Helvetica text in the persisted
scratch note. It proves the server still listens, the shell shows the board
error, the note bytes stay unchanged, and none of the malformed elements enter
Excalidraw. It then checks the same legacy shape through the shipped board
atlas, restores valid note bytes, and proves the board renders with finite zoom
and pane telemetry.

The pane recovery check uses `PANE_DEBOUNCE_MS` and observable publication
conditions rather than fixed browser sleeps. It forces the measured rectangle
non-finite, waits beyond the debounce by a named margin, and proves no pane POST
left the browser. It then restores the exact rounded rectangle and viewport
that were already published and requires the same payload to be posted and
recorded again. That same-key retry is the proof that the invalid branch clears
its publication key. The server's pathful 400 for invalid telemetry stays in
`test:boards`; this browser check does not send malformed telemetry just to test
the server again.

### `bun run test:live-session` (`scripts/check-live-session.mjs`, TASK-076)

Drives 42 cycles of interleaved agent and human writes against one board and
asserts the pane's document and the server's stay identical **after every
cycle**, naming the element, the field, both values and the cycle a divergence
first appeared on. That is what makes "the server is the truth" a property
rather than a claim: the bugs it exists to catch — a label multiplying, a
rename coming back — need a session to build up in. About forty seconds.

It also probes the server-update ordering from TASK-099. A user edit must be in
a report in flight or a report that is scheduled. The pane records a server
update in the same statement sequence as `updateScene`. A report that becomes
due while another report is in flight is scheduled again rather than dropped.
The check patches `Scene.replaceAllElements` so the next server update schedules
a user edit in a microtask after the pane applies the update but before it
records the new baseline. Four cases produce that ordering in every run: a
resize, a retype, a delete, and a move while the server updates another
element. Each case asserts that the pane and server documents agree and that
the server contains the user's exact edit.

It also owns the half of the board mutex only a renderer can answer
(ADR 0016): a connected pane remains locally editable while another writer
holds or claims the board, one single-flight hold retry eventually persists the
edit, content revokes a claim, camera movement does not, and a disconnected
pane still assumes the board is held rather than free.

Its hold-generation scenario delays hold A1, switches the pane from board A to
board B and back to A, then starts delayed hold A2. Releasing A1 first must
leave A2 owned, schedule no stale retry, and persist A2's edit. This is the
browser-level guard that board adoption advances the hold generation and that
late promise completion cannot clear a newer same-board attempt.

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
- Every reload in dev mode runs a canary (`src/runtime/engine/reload-canary.ts`) that
  compares which boards are open and where each one's note is, the pane
  registrations, the socket count and the feed's id and cursor across the
  reload, and shouts to the terminal **and** every open tab if anything moved.
  `bun run test:hot` breaks a reload on purpose to prove it fires. It does not
  count elements — a count is a fact about the vault, which a reload cannot
  touch — with one exception kept from TASK-079: a board that has stopped
  saving is the one board whose elements are in this process and in no note.

## Source boundary check

- `bun run test:boundaries` creates temporary deep modules under `src/` and
  invokes Oxlint with the repository's real config and custom plugin. It proves
  allowed module-root imports and thin process entrypoints pass, while root
  entrypoint implementation, domain-to-transformer imports, flat
  area files, extensionless directory deep imports and Vite resource-query deep
  imports fail under the expected Archboard rules. It also proves static
  `require()` deep imports fail both the built-in TypeScript rule and the custom
  entrypoint rule, co-located test files are rejected, and test/spec files under
  a module's `tests/` directory are accepted. The check removes every temporary
  path before it exits.

## Board inspection check

- `bun run test:inspection` drives the pure raw-record inspector and the real package binary. It pins
  the dense whole-board reroute, the exact 1,516,200 below-limit comparison count, and the
  2,000,001 limit attempt. Its package checks run with no canvas process, parse JSON through the
  exported schema, cover text and strict exits 6/7/8, and compare vault paths, bytes, and mtimes
  before and after every read. Performance cases import the module-root `diagnostics.ts` entrypoint
  to count every profile snapshot/trie step, exact-index update/tree-query/exclusion probe, bucket
  test, hierarchy predicate, bucket lookup/update/delete, hierarchy path/subtree/summary/index step,
  eligible visit, expiry, and path check. Peak counters total both live cross-set indexes and pin
  retained buckets, profiles, exclusions, exact-index nodes and summaries, query and index
  references, all simultaneously live sweep-owned state, and selected hierarchy parents. Sparse,
  partial-complement, distinct-profile, shared-ancestor, and dense 1k/2k/4k/8k cases pin
  cleanup, time, and memory independently of the public comparison count. Separate boundary-node
  and dense hierarchy matrices cover model preprocessing. Mutable-set reuse proves snapshots use
  exact current content. These counters are development evidence and do not appear in the product
  report or package CLI.

## Wire and lock checks

- `bun run test:contracts` tests the Archboard-owned command-contract interface.
  Its parser fake returns a prepared invocation and contains no parsing logic.
  The tests reject malformed public results and private file artifacts before
  stdout or a local write, pin command-specific held presentation, and prove
  generated introspection omits private execution and artifact data. The
  canonical command audit is the authored
  `docs/design/cli-command-audit.json`; the Markdown audit and JSON/Markdown
  proofs are derived views. The gate renders and validates them in memory, then
  invokes `bun run generate:cli-contract -- --output-dir <temporary-directory>`
  twice from absent output directories and compares exact bytes. It removes
  the temporary outputs and proves the checkout status is unchanged. For a
  local readable copy, `bun run generate:cli-contract` writes the three views
  to ignored `docs/design/generated/`. The
  black-box argv cases in `test:cli` continue through the real Commander
  adapter and the package binary.
- `bun run test:cli` resolves `bin.archboard` from `package.json` and drives
  that executable from outside the checkout. It covers no-argument help and
  every command/subcommand topic exposed by production `cliSurface()` data. A
  local HTTP double also pins the public write contract: `--document` on add,
  update and delete, global board/`--doing` routing, clean success streams,
  structured refusal and usage exits, and CLI-owned import path resolution.
- `bun run test:one-write` counts writes on the wire through a proxy, so a
  loop cannot pass itself off as a batch (TASK-068).
- `bun run test:changes` owns injection routing as well as the change feed. It
  proves injection refuses a non-loopback canvas, stays off without its switch,
  declines to arm without `ARCHBOARD_INJECT_THREAD`, and targets exactly the
  configured task when it is set.
- `bun run test:lock` proves the exclusion with two processes over one vault,
  which is the one thing an in-process mutex could not do (ADR 0016).
- `scripts/check-repos.mjs` runs against a registry in a temp file via
  `ARCHBOARD_REPOS`, which is how the tests keep off the real one.
- `check-obsidian-md` pins the four historical id renames measured in
  `docs/design/server-is-the-truth.md` as golden values, so a board already in
  the vault keeps the ids it has.
