# The test suite

What each check proves, and the constraints on running them. Read this when
changing tests or CI, or when a browser check fails.

`bun run test` type-checks first, then runs four native lanes in this order:

- `test:modules`: isolated module-owned tests discovered under `src/`;
- `test:system`: system owners under the seven explicit non-browser directories,
  with `--max-concurrency=1` because they own real processes and hot-reload source edits;
- `test:repository`: isolated repository-policy tests, including inventory and no-MJS policy;
- `test:serial-browser`: the 13 canonical browser owners through the strict adapter.

`.github/workflows/ci.yml` runs `bun run check`, which runs lint, formatting, and
that complete test chain. The repository inventory rejects a native test with
no lane, more than one lane, no push path, a browser owner outside the serial
adapter, recursive browser discovery, or any transitional `test:*` key.

The whole chain's duration is machine-dependent. Browser owners run one at a
time. Re-measure before making a timing claim.

## Focused commands

Run one module, system, or repository file with:

```bash
bun test path/to/owner.test.ts
bun test path/to/owner.test.ts --test-name-pattern "part of the test name"
```

Run browser diagnosis only through the adapter:

```bash
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts
```

The module-scope owner mutates source fixtures only inside its repository-policy
test. The hot-reload owner temporarily edits real source and restores bytes and
mtimes in `finally`; keep both isolated from formatter, type checker, browser,
and other hot-reload processes. System and browser owners must reap children,
listeners, sockets, vaults, and temporary roots on success, failure, or signal.

## Former check inventory

Every transitional package check now has one final owner lane:

| Former key                                                                     | Final lane         | Native owner selector                                                                                                |
| ------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `test:suites`, `test:boundaries`, `test:module-scope`                          | repository         | `tests/system/repository-policy/`                                                                                    |
| `test:contracts`                                                               | modules and system | `src/cli/command-contract/tests/`, `src/cli/finding-rendering/tests/`, `tests/system/cli/`                           |
| `test:inspection`                                                              | modules and system | `src/runtime/board-inspection/tests/`, `tests/system/board-inspection/`                                              |
| `test:bind`                                                                    | system             | `tests/system/process-contracts/`                                                                                    |
| `test:obsidian`, `test:changes`, `test:reporting`, `test:lock`, `test:version` | modules and system | `src/runtime/engine/tests/`, `src/ui/canvas/tests/`, `tests/system/canvas-state/`, `tests/system/process-contracts/` |
| `test:cli`, `test:install`, `test:repos`                                       | system             | `tests/system/cli/`                                                                                                  |
| `test:one-write`                                                               | system             | `tests/system/process-contracts/*one-write.test.ts`, `write-boundary-policy.test.ts`                                 |
| `test:doing`, `test:branch`, `test:side-by-side`, `test:staleness`, `test:hot` | system             | `tests/system/canvas-state/`                                                                                         |
| `test:geometry`, `test:labels`                                                 | modules and system | `src/runtime/engine/tests/`, `tests/system/label-geometry/`                                                          |
| `test:text`, `test:library`                                                    | modules            | `src/runtime/engine/tests/`                                                                                          |
| `test:boards`                                                                  | system             | `tests/system/support/`, `tests/system/boards/`                                                                      |
| `test:browser`                                                                 | serial-browser     | the 13 literal owners below                                                                                          |

## The serial browser lane

Everything else in `scripts/` stands a WebSocket in for a pane, which cannot
catch a renderer disagreeing with us: a socket holds whatever it was sent. The
13 owners under `tests/system/browser/` drive a real browser through one strict
adapter instead. The lane:

- refuses to claim a pass without `agent-browser` on PATH, or without `strace`
  when human-edit performance is selected — it exits 2 before building or
  starting an owner;
- assert `navigator.userAgent` says headless, because a window that maps
  steals focus under Hyprland and these run on every push;
- runs one literal file child at a time, never concurrently. TASK-097 records that two owners
  sharing the machine is how one of them fails for no reason: contention
  stretches request and frame observations that the checks probe on purpose;
- checks frontend freshness once and builds at most once before the first
  owner;
- bounds retained browser and build children with `TEST_BROWSER_COMMAND_TIMEOUT_MS`,
  polls cleanup with `TEST_BROWSER_POLL_MS`, and treats spawn errors, signals,
  prerequisite failures, and nonzero preflight statuses as could-not-run exit 2;
- gives every owner an isolated home, vault, temporary directory, browser
  namespace, socket, session, canvas listener, and headless allowlisted
  environment, and audits all of them during cleanup.

The package command is the canonical full lane. Focused diagnosis accepts only:

```bash
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts
```

One `--focus` may name multiple canonical owners in canonical order. Missing,
duplicate, reordered, unknown, recursive, changed-only, random, shard, and
extra arguments are rejected before prerequisites or build. Do not invoke an
owner directly: the adapter is what makes browser work serial, headless, and
clean after failures or interruption.

The full order is human edit performance; fixed-point document; malformed
geometry recovery; pane telemetry recovery; arrow-binding differential;
finding export; shell layout; typed text; live-session convergence; server
update ordering; hold generation; human-hold persistence; and claim
interaction.

### Human edit performance (TASK-118)

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

### Fixed-point and renderer contracts (TASK-071)

Writes a board, renders it, reads back what the pane is holding, and reports
every element and field Excalidraw changed. **It reports zero, and zero is
asserted** (TASK-072): what archboard writes is a document Excalidraw does not
change. About eleven seconds plus the build.

`@excalidraw/excalidraw` is pinned at 0.18.1 in `package.json` and `bun.lock`.
TASK-090 keeps the local arrow-binding port while one browser differential
agrees within 1.0 scene pixel. The real canvas adopts a human arrow end with
`focus: 0.9` and `gap: 15`, then trusted pointer input moves only its node while
the browser's change report is held before it reaches the server. That scene
read is Excalidraw's endpoint. A separate unopened board starts from the same
node and arrow geometry; an agent moves its node to the browser's exact target,
and the check compares the server endpoint with the captured browser endpoint.
The same comparison rejects an in-memory endpoint two pixels away. A failure
prints both endpoints, the coordinate deltas and total separation, the binding
numbers, and both node geometries. When the Excalidraw package changes, run
the focused arrow-geometry module test and then `bun run test:serial-browser`; do not replace the local
port or copy more Excalidraw internals before that differential shows a visible
mismatch.

The same fixed-point document includes one bridge created through the product route. Its mask and
redraw metadata, unbound line geometry, styling, and z-order therefore make the same single
sequential headless renderer round trip; TASK-120 adds no pixel or two-pane browser suite.

TASK-121 extends this same lane with one explicit off-screen board. It carries an embedded image,
one valid bridge crossing, and one unmarked crossing. The check renders its inspection findings
twice around a visible viewport change and proves identical PNG and manifest bytes, exact bridge
suppression, clipping to the inspection focus box, and no change to the visible pane's board,
scene, selection, viewport, or existing full-board screenshot. It uses the existing headless
browser and condition polling; there is no additional browser suite or two-pane matrix.

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
`test:system`; this browser owner does not send malformed telemetry just to test
the server again.

### Live-session contracts (TASK-076)

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

### Typed-text contracts (TASK-098)

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

- `bun test tests/system/repository-policy/module-scope-policy.test.ts` parses the canvas's import graph and fails on
  module-scope state: a `new` that is not a frozen lookup table, a literal
  something writes to, a timer, a listener added without a paired removal, a
  bind, or a write to long-lived state with no presence guard. Waive a false
  positive with `// hot-safe: <reason>`. Both TASK-057 bugs are parser fixtures
  under `tests/system/repository-policy/fixtures/module-scope/`, so the test
  proves itself on every run.
- Every reload in dev mode runs a canary (`src/runtime/engine/reload-canary.ts`) that
  compares which boards are open and where each one's note is, the pane
  registrations, the socket count and the feed's id and cursor across the
  reload, and shouts to the terminal **and** every open tab if anything moved.
  `bun test tests/system/canvas-state/hot-reload.test.ts` breaks a reload on purpose to prove it fires. It does not
  count elements — a count is a fact about the vault, which a reload cannot
  touch — with one exception kept from TASK-079: a board that has stopped
  saving is the one board whose elements are in this process and in no note.

## Source boundary check

- `bun test tests/system/repository-policy/boundaries.test.ts` creates disposable projects outside the checkout and
  invokes real Oxlint subprocesses with the repository's custom plugin. It proves
  allowed module-root imports and thin process entrypoints pass, while root
  entrypoint implementation, domain-to-transformer imports, flat
  area files, extensionless directory deep imports and Vite resource-query deep
  imports fail under the expected Archboard rules. It also proves static
  `require()` deep imports fail both the built-in TypeScript rule and the custom
  entrypoint rule, co-located test files are rejected, and test/spec files under
  a module's `tests/` directory are accepted. Each assertion removes its
  temporary project even when the assertion fails.

## Board inspection check

- The board-inspection owners under `src/runtime/board-inspection/tests/` and
  `tests/system/board-inspection/` drive the pure raw-record inspector and the real package binary. They pin
  the dense whole-board reroute, the exact 1,516,200 below-limit comparison count, and the
  2,000,001 limit attempt. Its package checks run with no canvas process, parse JSON through the
  exported schema, cover text and strict exits 6/7/8, and compare vault paths, bytes, and mtimes
  before and after every read. The inert input snapshot matrix covers proxies, revoked proxies,
  accessors, cycles, custom prototypes, unsafe scalar values, holes, sparse arrays, exact string and
  array boundaries, and large supported paths. The module-root `diagnostics.ts` entrypoint supplies
  coarse noncontractual algorithm counters for focused regressions. Alternating exact-exclusion and
  hierarchy fixtures retain their pair-set, ordering, and semantic-exclusion checks without claiming
  a general complexity bound. Direct and persisted package cases prove the input and broad-phase
  comparison limit findings, strict/non-strict exits, deterministic rendering, preservation of
  completed findings at the comparison stop, and the absence of diagnostic counters from product
  output. TASK-120 adds the schema-v2 bridge matrix: strict metadata, incomplete/stale provenance,
  exact one-crossing suppression, a second unmarked crossing, and unchanged architecture/compare/
  describe bytes for valid decoration parts.

## Wire and lock checks

- The command-contract owners under `src/cli/command-contract/tests/` and
  `tests/system/cli/` test the Archboard-owned command-contract interface.
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
  black-box argv cases in `test:system` continue through the real Commander
  adapter and the package binary.
- The CLI owners in `test:system` resolve `bin.archboard` from `package.json` and drive
  that executable from outside the checkout. It covers no-argument help and
  every command/subcommand topic exposed by production `cliSurface()` data. A
  local HTTP double also pins the public write contract: `--document` on add,
  update and delete, global board/`--doing` routing, clean success streams,
  structured refusal and usage exits, and CLI-owned import path resolution.
- The one-write owners in `test:system` count writes on the wire through a proxy, so a
  loop cannot pass itself off as a batch (TASK-068).
- The change owners in `test:modules` and `test:system` own injection routing as well as the change feed. They
  proves injection refuses a non-loopback canvas, stays off without its switch,
  declines to arm without `ARCHBOARD_INJECT_THREAD`, and targets exactly the
  configured task when it is set.
- The lock owners in `test:modules` and `test:system` prove exclusion with two processes over one vault,
  which is the one thing an in-process mutex could not do (ADR 0016).
- The repository-session owners in `test:system` use RepositoryFixture-owned HOME, XDG state, log,
  registry, and vault paths, isolated from the caller's user configuration.
- `check-obsidian-md` pins the four historical id renames measured in
  `docs/design/server-is-the-truth.md` as golden values, so a board already in
  the vault keeps the ids it has.
