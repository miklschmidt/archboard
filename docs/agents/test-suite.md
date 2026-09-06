# The test suite

What each check proves, and the constraints on running them. Read this when
changing tests or CI, or when a browser check fails.

`bun run test` type-checks and runs `build:frontend`, then runs four normal
native lanes in this order:

- `test:modules`: isolated module-owned product tests discovered under `src/`;
- `test:system`: system product owners under the seven explicit non-browser
  directories, with `--max-concurrency=1` because they own real processes and
  shared local ports;
- `test:repository`: the source-boundary lint fixtures and the skill frontmatter check;
- `test:serial-browser`: every owner in the executable `BROWSER_TEST_PATHS`
  inventory through the strict adapter.

`bun run check` is the complete normal local gate: lint, formatting, both
TypeScript projects, and that normal test chain. `.github/workflows/ci.yml` invokes the
same command with two exact hosted-only exceptions after clean-runner stalls:
`tests/system/code-targets/opener-persistence.test.ts` and the complete serial
browser lane. All normal owners remain mandatory locally; TASK-141 and TASK-142
own restoring the system owner and the normal browser inventory to hosted
coverage.

The supported normal topology is one Archboard server, one package-local bound
Codex app-server, and one human editor. Short races inside that topology stay in
their cheapest product owner. These commands contain everything outside it:

| Command                                                                  | Concrete regressions and cheapest interface                                                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test:opt-in:capacity`                                           | Inspection input/comparison ceilings, large-index and sweep work limits, transport capacity, and the frozen app-server capacity authority.     |
| `bun run test:opt-in:tooling`                                            | Browser adapter, wall-clock preload, owned-process harness, renderer fixture, and external watchdog behavior through their real test adapters. |
| `bun run test:opt-in:topology`                                           | The two-server same-vault lock handoff through its process boundary.                                                                           |
| `bun run test:opt-in:browser-performance`                                | The 10,000-element human-edit measurement and 42-cycle convergence soak through the serial real-browser adapter.                               |
| `bun run opt-in:renderer-chromium` / `bun run opt-in:renderer-emulation` | Manual renderer and upstream-emulation probes. They are never package test owners.                                                             |

Every test owner belongs to exactly one lane; opt-in package commands are never
reached from `check`, and hosted CI invokes only `bun run check`.

The whole chain's duration is machine-dependent. Browser owners run one at a
time. Re-measure before making a timing claim.

## Focused commands

Run one module, system, or repository file with:

```bash
bun test path/to/owner.test.ts
bun test path/to/owner.test.ts --test-name-pattern "part of the test name"
```

The repository-policy-owned preload at
`tests/system/repository-policy/support/test-preload.ts` measures each Bun case with
a monotonic clock. An unapproved case gets 20,000 ms of actual elapsed time. A larger
timeout argument only tells Bun how long it may wait; it does not fail a case that
finishes inside the wall-clock budget.

Keep a real-time exception inside its exact test callback. Its first statement calls
`declareTestWallClockBudget` with the exact test name, a concrete reason, a `TEST_*`
outer bound, the task that owns the choice, and recorded duration evidence.

The opt-in renderer-tooling owners load `dist/frontend/renderer.html`. Run
`bun run build:frontend` first in a clean checkout. The normal package test
still builds the frontend before product owners.

`tests/system/boards/vault-only-production-interfaces.test.ts` owns the
zero-client product workflow. It uses named persisted boards with no open,
load, show, pane, or capture setup. `tests/system/boards/server-rendering.test.ts`
owns renderer lifecycle and immutable snapshot details. Real-browser owners
cover only live `browser` commands and Excalidraw fidelity.

Run browser diagnosis only through the adapter:

```bash
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts --test-name "<exact test name>"
bun tests/system/browser/run-browser-lane.ts --opt-in --focus tests/system/browser/<opt-in-owner>.test.ts
```

The code-target system owners run after `tests/system/process-contracts`. The
package browser command runs the whole `BROWSER_TEST_PATHS` inventory:

```bash
bun run test:system
bun run test:serial-browser
```

Print the normal and opt-in executable paths without copying their counts into
documentation:

```bash
bun -e 'import { BROWSER_TEST_PATHS, OPT_IN_BROWSER_TEST_PATHS } from "./tests/system/browser/support/agent-browser.ts"; console.log(BROWSER_TEST_PATHS.join("\n")); console.log(OPT_IN_BROWSER_TEST_PATHS.join("\n"))'
```

System and browser owners must reap children,
listeners, sockets, vaults, and temporary roots on success, failure, or signal.

## Rendered UI owners

A module owner that must _mount_ React — focus, roles, pointer and keyboard
sequences — opts into a real DOM per file through the `src/ui/dom-testing`
module root. Happy DOM is never registered for the whole suite: the
`bunfig.toml` preload stays the wall-clock reporter, and server, process, and
system owners keep a plain Node-like global, because a suite-wide `document`
would change what those owners prove. The pinned stack is `happy-dom` and
`@happy-dom/global-registrator` for the window, and `@testing-library/react`
with `@testing-library/dom` and `@testing-library/user-event` for mounting and
input.

```ts
import { afterAll, expect, test } from "bun:test";
import { createElement } from "react";

import { loadRenderedUiTools, registerHappyDom, unregisterHappyDom } from "@/ui/dom-testing";

registerHappyDom();
const { render, screen, userEvent } = await loadRenderedUiTools();

afterAll(unregisterHappyDom);
```

`loadRenderedUiTools()` exists because import order is not a style choice:
`@testing-library/user-event` reads `globalThis.document` while its module body
evaluates, and ES module imports run before any statement in the importing
file. Never import `@testing-library/*` directly from a test file — await the
loader after `registerHappyDom()`, and release the window in `afterAll` so the
next isolated file starts from the plain global.
`src/ui/dom-testing/tests/mounted-button.test.ts` is the owner for the harness
itself. The hand-written harnesses under `src/ui/workbench-runtime/tests/` and
the `renderToStaticMarkup` owners elsewhere in `src/ui/` still stand; migrating
one is its own leaf owner's work, not a side effect of touching this module.

## Former check inventory

Every transitional package check now has one final owner lane:

| Former key                                                                     | Final lane         | Native owner selector                                                                                                |
| ------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `test:suites`, `test:boundaries`                                               | repository         | `tests/system/repository-policy/`                                                                                    |
| `test:contracts`                                                               | modules and system | `src/cli/command-contract/tests/`, `src/cli/finding-rendering/tests/`, `tests/system/cli/`                           |
| `test:inspection`                                                              | modules and system | `src/runtime/board-inspection/tests/`, `tests/system/board-inspection/`                                              |
| `test:bind`                                                                    | system             | `tests/system/process-contracts/`                                                                                    |
| `test:obsidian`, `test:changes`, `test:reporting`, `test:lock`, `test:version` | modules and system | `src/runtime/engine/tests/`, `src/ui/canvas/tests/`, `tests/system/canvas-state/`, `tests/system/process-contracts/` |
| `test:cli`, `test:install`, `test:repos`                                       | system             | `tests/system/cli/`                                                                                                  |
| `test:one-write`                                                               | system             | `tests/system/process-contracts/promotion-delete-bridge-one-write.test.ts`                                           |
| `test:doing`, `test:branch`, `test:side-by-side`, `test:staleness`             | system             | `tests/system/canvas-state/`                                                                                         |
| `test:geometry`, `test:labels`                                                 | modules and system | `src/runtime/engine/tests/`, `tests/system/label-geometry/`                                                          |
| `test:text`, `test:library`                                                    | modules            | `src/runtime/engine/tests/`                                                                                          |
| `test:boards`                                                                  | system             | `tests/system/boards/`                                                                                               |
| `test:browser`                                                                 | serial-browser     | `BROWSER_TEST_PATHS`                                                                                                 |

## The serial browser lane

Everything else in `scripts/` stands a WebSocket in for a pane, which cannot
catch a renderer disagreeing with us: a socket holds whatever it was sent. The
normal owners named by `BROWSER_TEST_PATHS` drive a real browser through one
strict adapter for live-session behavior and Excalidraw fidelity. They are not a gate
for named-board runtime operations. The lane:

- refuses to claim a pass without `agent-browser` on PATH, or without `strace`
  when the opt-in human-edit performance owner is selected. It exits 2 before
  building or starting an owner;
- asserts `navigator.userAgent` says headless, because a window that maps
  steals focus under Hyprland; local normal runs exercise the normal inventory while hosted
  runs exclude the lane until TASK-142 restores it;
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
  environment, and audits all of them during cleanup. The code-target system
  owners also reap controlled fake processes and capture/release files.

The normal package command is the canonical normal lane. Focused diagnosis accepts:

```bash
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts
```

One `--focus` may name any subset of the owners, in any order; a repeated path
runs once. Only what would otherwise run the whole lane by mistake is refused
before prerequisites or build: a path that is not an owner, a flag the runner
does not know, or `--test-name` without exactly one owner. `--test-name` is
the only focused-owner option and matches the complete test name exactly. Do
not invoke an owner directly: the adapter is what makes browser work serial,
headless, and clean after failures or interruption.

`BROWSER_TEST_PATHS` is the normal inventory and the order the package
command runs it in. `OPT_IN_BROWSER_TEST_PATHS` is disjoint and requires the
explicit `--opt-in` mode; a path from the other inventory is refused.

### Opt-in human edit performance (TASK-118)

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

TASK-121's finding-render ownership now lives in
`tests/system/boards/server-rendering.test.ts`. One persisted snapshot carries
an embedded image, a valid bridge crossing, and an unmarked crossing. The
zero-client owner checks the report, fixed focus dimensions, complete PNG
results, and unchanged note bytes. The same retained renderer owner covers
PNG/SVG semantics, Mermaid conversion, lease ordering, cancellation, and
shutdown. Live pane capture and viewport assertions remain in the browser lane.

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

That 42-cycle soak is opt-in. The normal browser lane keeps the short
server-update ordering, hold-generation, hold-persistence, and claim owners that
catch reachable single-session races without repeating the complete soak.

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
(ADR 0022): a claimed board is view mode for people while pan and zoom still
report, a drag takes no hold and revokes nothing, the explicit take-back route
releases the claim and the agent is told once, and a disconnected pane still
assumes the board is held rather than free.

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

### Controlled text workbench (TASK-143.03.13)

Starts the production server composition with the exact Codex 0.151.0 protocol
fake, then drives the real browser transport and rendered shell. One short
create, send, and decline flow proves the pane workbench is operable, both
ordinary and dynamic approval effects are visible, and the mounted Excalidraw
pane keeps its seeded element. The owner also checks the fake's exact version
probes, single app-server spawn, browser console, and page errors.

The startup and login recovery arms, timeline renderers, queue operations,
approval family matrices, command reconciliation, focus behavior, shell render
matrix, fullscreen controls, process cleanup, and stress cases stay in their
focused module, system, or existing browser owners. This browser owner does not
repeat them.

### Controlled live voice (TASK-143.04.07)

Extends the same exact-version production composition through one controlled
browser media session. One short rendered lifecycle proves that CanvasPane's
caller-owned session reaches Shell and WorkbenchFrame with its source, captured
context, and transcript visible. It then mutes the session, carries the same
identity into the fullscreen dock, and stops it there before checking text-only
cleanup and the unchanged mounted Excalidraw pane.

The owner checks desktop and desktop scaled geometry, target size, focus
order, live-region semantics, reduced motion, forced colors, browser errors,
and resource cleanup. Focused realtime, media, session, transcript, context,
spoken-approval, frame, and shell owners keep their exhaustive state and
failure matrices.

## Source boundary check

- `bun test tests/system/repository-policy/boundaries.test.ts` creates disposable source fixtures outside the checkout and
  invokes syntax-only Oxlint subprocesses with the repository's custom plugin. It proves
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
  the dense whole-board reroute and run the comparison-limit behavior matrix against an internal
  2,000-comparison detector budget while production code and public schemas stay pinned to 2,000,000.
  Its package checks run with no canvas process, parse JSON through the
  exported schema, cover text and strict exits 6/7/8, and compare vault paths, bytes, and mtimes
  before and after every read. The inert input snapshot matrix covers proxies, revoked proxies,
  accessors, cycles, custom prototypes, unsafe scalar values, holes, sparse arrays, exact string and
  array boundaries, and large supported paths. The module-root `diagnostics.ts` entrypoint supplies
  coarse noncontractual algorithm counters for focused regressions. Alternating exact-exclusion and
  hierarchy fixtures retain their pair-set, ordering, and semantic-exclusion checks without claiming
  a general complexity bound. The module comparison case proves the boundary stop, deterministic
  findings, and preservation of completed findings without production-sized work. The persisted
  package case proves the input limit's strict/non-strict exits and text rendering, while other
  package owners prove the absence of diagnostic counters from product output. TASK-120 adds the
  schema-v2 bridge matrix: strict metadata, incomplete/stale provenance,
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
- One one-write owner in `test:system`,
  `promotion-delete-bridge-one-write.test.ts`, counts writes on the wire
  through a proxy for the intents that are composed from several elements
  (promote, delete many, bridge), so a loop cannot pass itself off as a batch
  (TASK-068). Single-body routes have no other way to be one write and need no
  proxy (TASK-153).
- Normal lock owners prove reachable one-server exclusion. The opt-in topology
  owner proves two Archboard server processes cannot write one vault at once,
  which is the one thing an in-process mutex could not do (ADR 0016).
- The repository-session owners in `test:system` use RepositoryFixture-owned HOME, XDG state, log,
  registry, and vault paths, isolated from the caller's user configuration.
- `src/runtime/engine/tests/obsidian-id-stability.test.ts` pins the four historical id renames measured in
  `docs/design/server-is-the-truth.md` as golden values, so a board already in
  the vault keeps the ids it has.
