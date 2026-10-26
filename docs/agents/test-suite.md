# The test suite

What each check proves, and the constraints on running them. Read this when
changing tests or CI, or when a browser check fails.

`bun run test` type-checks and builds both browser applications, then runs four normal
native lanes in this order:

- `test:modules`: isolated package-owned and app-owned product tests discovered under
  `packages/` and `apps/`, excluding the capacity and benchmark inventories;
- `test:system`: system product owners under the five explicit non-browser
  directories, with `--max-concurrency=1` because they own real processes and
  shared local ports;
- `test:repository`: the source-boundary lint fixtures, the owner that resolves
  links in the shipped skills, repository navigation, and development skill
  (`tests/system/repository-policy/skill-links.test.ts`),
  the owner that parses YAML discovery metadata for every tracked skill
  (`tests/system/repository-policy/skill-frontmatter.test.ts`),
  the README asset manifest and staleness owner
  (`tests/system/repository-policy/readme-assets.test.ts`), which starts no browser,
  and the owner that holds the README banner's mark to the shell's
  (`tests/system/repository-policy/readme-lockup.test.ts`);
- `test:serial-browser`: every owner in the executable `BROWSER_TEST_PATHS`
  inventory through the strict adapter.

`bun run benchmark` runs the renderer corpus separately and never caches results.
It renders the current variant of every board in this checkout’s `.archboard/vault`,
plus three fixed wide-board fixtures, on both layout engines.
It retains the drawing assertions and first-layout speed limits.
It does not scan other repositories or historical variants.
The normal gate also renders three fixed fixtures on both engines in
`packages/renderer/tests/runtime/operations/blocks/drawing-integrity.test.ts`.
They cover labeled dependencies, dense cross-links, and nested containers.
Shared assertions detect missing parts, routes through cards, misplaced labels,
and line clearance defects. These six cases read no vault and enforce no speed limit.
Focused renderer tests and process cancellation deadlines also remain in the normal gate.
Neither `bun run test` nor `bun run check` invokes the benchmark task.

`bun run check` is the complete normal gate locally and on GitHub Actions.
It runs lint, formatting, both TypeScript projects, and the normal test chain.
`lint:all` includes `lint:css`, which applies the shared import boundaries to authored CSS.
The CSS fixtures and package graph own the refusal and dependency regressions.
The hosted run includes opener persistence and the entire serial browser inventory.
The workflow retains its full output as the `validation-log` artifact.

`vite.config.ts` owns the Vite+ tasks and their ordered pipelines.
The package scripts keep the main commands: `build`, `lint`, `fix`, `type-check`, `test`, and `check`.
Run an individual lane with `bunx vp run <task>`, such as `bunx vp run test:modules`.
The two lint policies retain their JSONC files and the project guard in `scripts/lint.ts`.

Validation tasks cache successful results from declared source and fixture paths.
The cache also fingerprints dependency metadata and the environment that affects validation.
The repository lane fingerprints Git's tracked entries because its owners discover tracked files.
Validation tasks declare their inputs and restore no fixture files.
This keeps Vite+ file tracing out of sandboxed Chromium and out of measured tests. The frontend build restores its generated bundle on a cache hit.
Its source fingerprint travels with the bundle, so checkout and restoration times do not mark valid output as stale.
Pipeline tasks resolve their children on every call, and fix commands bypass the cache.
Use `bunx vp run --no-cache check:all` when you need a fresh run of every stage.

The tests still run under Bun. TASK-516 tracks the runtime trial before a move to `vp test`.
The trial must prove Bun API support, `process.execPath`, and cleanup of fixture servers.

CI restores the Vite+ task cache after dependency installation and saves it after a successful gate.
The browser version joins the test cache key, so a Chrome update invalidates prior results.

A separate macOS CI job runs `test:macos` and exercises the native process observer, Codex lifecycle,
Git cleanup, renderer startup cleanup, storage paths, and board filename casing.
The job also runs the native sandbox refusal and repaired macOS fixture owners.
This catches platform-specific failures that the Ubuntu suite cannot exercise;
it does not replace any local gate.

The supported normal topology is one Archboard server, one package-local bound
Codex app-server, and one human reader. Short races inside that topology stay in
their cheapest product owner. These commands contain everything outside it:

| Command                            | Concrete regressions and cheapest interface                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx vp run test:opt-in:capacity` | Dynamic-tool wire limits, transport write capacity, and the frozen app-server capacity authority.                                                                                                                                  |
| `bunx vp run test:opt-in:tooling`  | Browser adapter, wall-clock preload, owned-process harness, renderer fixture, and external watchdog behavior through their real test adapters.                                                                                     |
| `bunx vp run test:opt-in:topology` | A claim taken through a second server excludes writes here and reaches this server's pane within the lock sweep. A take-back by a pane here ends that server's claim, and its agent hears `CLAIM_REVOKED` after one lease renewal. |

Every test owner belongs to exactly one lane; opt-in package commands are never
reached from `check`. The Ubuntu CI job invokes the complete `bun run check` gate;
the macOS job repeats its selected native owners on that platform.

The whole chain's duration is machine-dependent. Browser owners run one at a
time. Re-measure before making a timing claim.

## Isolated servers and vaults

A test never reaches the server, the vault or the registry of the person who
runs it. The registry is the file that lists the repositories and vaults that
the browser shows.

- A system test keeps each vault at `<dir>/.archboard/vault`, where a command
  finds it (ADR 0049). `vaultIn(<dir>)` in `tests/system/support/test-vault.ts`
  makes one.
- `startOwnedServer` gives each server its own port, home, XDG directories,
  temporary directory and registry. That registry lists only the server's
  vault, so a page opens in that vault. A test about the registry names its
  own with `ARCHBOARD_REPOS`, and the server then lists only what that file
  holds.
- A test starts the real entry, `apps/server/src/server.ts`. Nothing imports the
  app. A test that has to replace a module before the server loads it passes a
  `preload` script to `startOwnedServer` (`bun --preload`): the Codex stand-in
  of `tests/system/server-state/support/production-server.ts`, the failed
  initial send and the HTTP failures of `tests/system/process-contracts/`.
  The tests of the app's own parts are in `apps/server/tests/`.
- A command runs in the directory that holds its vault, with the registry of
  the server it talks to: `runServerCli` in `tests/system/support/run-cli.ts`
  and in the browser support. It never runs in this checkout, because there it
  finds the boards of this repository. It never runs in another archboard
  checkout either, because there `archboard` runs that checkout's source
  instead of the source under test.
- A command that reaches a server names it with `ARCHBOARD_URL`. Without it,
  the command reaches the server on the port of the checkout under test:
  3000 in the main checkout, which is probably your everyday server.
- No test addresses a vault through the environment. A set variable that names a
  vault is refused by every command, so one that you export fails the tests
  loudly and never receives a test's writes. A command test under
  `apps/cli/tests/` runs the CLI in its own process. It names a temporary vault with `-C <dir>` and sets
  `ARCHBOARD_REPOS` to a temporary file.
- To check that no test writes your registry, set `ARCHBOARD_REPOS` to a path
  that does not exist before a lane. After the lane, the file must still be
  absent.

## Focused commands

Run one module, system, or repository file with:

```bash
bun test path/to/owner.test.ts
bun test path/to/owner.test.ts --test-name-pattern "part of the test name"
```

The repository-policy-owned preload at
`tests/system/repository-policy/support/test-preload.ts` gives every Bun case
without its own timeout `TEST_CASE_TIMEOUT_MS` (15,000 ms) and measures each case
with a monotonic clock. An unapproved case gets `TEST_WALL_CLOCK_BUDGET_MS`
(60,000 ms) of actual elapsed time. A larger timeout argument only tells Bun how
long it may wait; it does not fail a case that finishes inside the wall-clock budget.

Both are three times their base through `TEST_PATIENCE_FACTOR` in
`tests/system/support/timing.ts`, because GitHub's hosted runners vary widely in
speed. The factor multiplies how long a test waits for something that should
happen. It never multiplies a poll cadence, a window in which nothing may happen,
or a product duration.

Advance test time explicitly for timers, debounce, motion, and fixture pacing.
Use Bun fake timers or the existing stepped frame clock, and inspect intermediate
states before advancing to completion. Keep all frame, geometry, ordering, and
cleanup assertions. A real-time wait needs a contract that a controlled clock
cannot exercise, with the reason beside the wait. Process readiness polls wait
for external evidence and return as soon as it arrives.

Run the focused owners while implementing a change. Run the complete normal gate
at a completed checkpoint, then repeat it only after a relevant change or failure.

No `TEST_*` budget comes from a product duration (TASK-154).
`tests/system/support/timing.ts` imports nothing from `packages/timing`.
A wait deadline is a ceiling that a passing run never reaches.
A poll cadence and an intentional wait are separate durations.
A product change must not retune these test values.

A system owner waits for a product timer only when the test is about that timer
and the timer has no test override. These cases remain:

- the one-second lock sweep that tells a pane its board changed under it
  (`external-board-write`, and the opt-in cross-process lock owner);
- the one-second lease renewal that records a claim's loss after a pane takes it back
  (the opt-in cross-process lock owner);
- the wall-clock pace of a recording (`walkthrough-recording`, a declared
  real-time exception).

Module owners prove lease and claim expiry with fake timers. The CLI fixtures clear `ARCHBOARD_SETTLE_MS` only to keep the
caller's value out. No CLI case reaches the change-feed settle, so its 1,200 ms
default costs them nothing. When a test must outwait a product timer, write why
beside its own literal in `timing.ts`.

The opt-in benchmark corpus in `packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts`
uses a 60-second case deadline when `CI=true`. Its default engine also gets
60 seconds for a first render. GitHub Actions recorded first renders up to
45.3 seconds (TASK-451). Local runs keep the 20-second case deadline and
3-second first-render limit. Both engines keep all picture correctness assertions.
The preload still applies its 60-second wall-clock ceiling. Only three Blocks
cases declare a real-time exception, each with its own case deadline on CI and
locally. Browser application and Board viewer get `TEST_HEAVY_BLOCKS_CASE_MS`:
their layout alone took 47.85 seconds on CI, past 60 on a slower runner, and
52.9 seconds locally on a loaded machine. Codex realtime voice gets
`TEST_HEAVIEST_BLOCKS_CASE_MS`: it went past 60 seconds on CI, and locally it
takes about three and a half times as long as Browser application (TASK-536).
TASK-377 owns the cause.

Keep a real-time exception inside its exact test callback. Its first statement calls
`declareTestWallClockBudget` with the exact test name, a concrete reason, a `TEST_*`
outer bound, the task that owns the choice, and recorded duration evidence. Every
test owner may import the declaration from
`tests/system/repository-policy/support/test-wall-clock.ts`, because the preload
it feeds measures every owner. A module owner keeps its `TEST_*` bound beside the
case.

`tests/system/semantic-boards/rasterize.test.ts` owns the zero-client bitmap
workflow: `semantic rasterize` against a real Archboard server, the same selectors as
`semantic render`, and a board file that does not move. The rasterizer's own
owner, `packages/renderer/tests/runtime/services/rasterizer`, proves real pixels, native and
scaled dimensions, full bounds past a display, font readiness, bounds refusals,
cancellation and a Chromium that is provably gone. The Chromium it runs on is
`packages/renderer/src/runtime/processes/headless-chromium`, whose owner proves caller flags, an exact
window viewport, event delivery without retention, a page Blob streamed to a
file, and provable teardown.

The recording owners in `tests/system/server-state` run a fake ffmpeg that keeps
each frame's hash. `walkthrough-recording.test.ts` owns `semantic record` end to
end. The real CLI drives the built page in a headless Chromium against a server
whose fake Codex narrates. The owner checks the kept talk, the frames, the order
in which the steps reached the voice, and `--discard`.
`walkthrough-replay.test.ts` owns `semantic replay`. It renders a talk of a
discarded board three times through the real replay page. The frames are the
same each time, on one page or split across two. The last frames all differ,
because the voice box in the walkthrough box holds the orb, which never stands
still. The dark theme is another picture from the first frame. A talk recorded
with Blocks is drawn with Blocks, and `--layout track` draws another picture.
`walkthrough-render.test.ts` owns a render that fails. Against a stand-in page
it is `RENDER_FAILED`, keeps the talk and writes no file.
`walkthrough-recording-refusals.test.ts` owns the refusals that start no browser
and no voice. These module owners hold the parts:

- `packages/walkthrough/tests/runtime/services` and `processes`: finding and running ffmpeg.
- `packages/walkthrough/tests/shared/protocol`: the talk's contract.
- `apps/web/tests/ui/rules/walkthrough-replay`: the frame that shows each event.
- `packages/ui-kit/tests/ui/state/frame-clock`: the stepped clock.
- `packages/walkthrough/tests/runtime/store` and `operations`: the talk on disk and the browsers'
  flags.

Every owner in these two paragraphs needs a Chromium-family executable
(`ARCHBOARD_RENDERER_CHROMIUM` names one), except the refusals owner and the
module owners in the list. The recording and replay owners need
`dist/frontend` as well. Real-browser owners cover only live `browser`
commands.

Run browser diagnosis only through the adapter:

```bash
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts --test-name "<exact test name>"
```

The code-target system owners run after `tests/system/process-contracts`. The
package browser command runs the whole `BROWSER_TEST_PATHS` inventory:

```bash
bunx vp run test:system
bunx vp run test:serial-browser
```

Print the executable browser inventory without copying its count into documentation:

```bash
bun -e 'import { BROWSER_TEST_PATHS } from "./tests/system/browser/support/agent-browser.ts"; console.log(BROWSER_TEST_PATHS.join("\n"))'
```

System and browser owners must reap children,
listeners, sockets, vaults, and temporary roots on success, failure, or signal.

## Rendered UI owners

A module owner that must mount React — focus, roles, pointer and keyboard
sequences — registers Happy DOM for its own isolated test file and unregisters
it in `afterAll`. Happy DOM is never registered for the whole suite: the
`bunfig.toml` preload stays the wall-clock reporter, and server, process, and
system owners keep a plain Node-like global, because a suite-wide `document`
would change what those owners prove.

Reuse the module's existing rendered-test harness when one exists. Semantic
board stage tests use `apps/web/tests/ui/support/semantic-board-canvas/stage-harness.tsx`,
which owns DOM registration, measured viewport setup, fetch restoration and
Testing Library cleanup. Other rendered owners use `GlobalRegistrator` from
`@happy-dom/global-registrator` with React's `act` and `createRoot`, or
Testing Library's `render`. Unmount every root or call Testing Library's
`cleanup` after each test, including on failure, before unregistering the
window. Restore replaced globals and dispose query clients and subscriptions
owned by the test.

Import order matters when using `@testing-library/user-event`: it reads
`globalThis.document` while its module body evaluates. Dynamically import it
only after registering Happy DOM; a static import runs before the registration
statement. Keep queries scoped to the mounted container, or obtain document-bound
query helpers after registration. Existing stage tests use `act` and
`fireEvent` without introducing another DOM lifecycle owner.

The `renderToStaticMarkup` owners elsewhere in `apps/web/tests/ui/` do not need a DOM.
Do not add a shared harness or migrate unrelated owners solely to change their
test setup.

## The serial browser lane

The owners named by `BROWSER_TEST_PATHS` drive a real browser through one
strict adapter. They test visible behavior and rendered fidelity. System owners
test the CLI and server through their public contracts. The browser lane:

- resolves the pinned `agent-browser` package in this checkout, then runs its packaged native executable directly.
  Prerequisite failure exits 2 before building or starting an owner;
- asserts `navigator.userAgent` says headless, because a window that maps
  steals focus under Hyprland; local and hosted runs exercise the same normal inventory;
- runs one literal file child at a time, never concurrently. TASK-097 records that two owners
  sharing the machine is how one of them fails for no reason: contention
  stretches request and frame observations that the checks probe on purpose;
- checks frontend freshness once and builds at most once before the first
  owner;
- bounds retained browser and build children with `TEST_BROWSER_COMMAND_TIMEOUT_MS`,
  polls cleanup with `TEST_BROWSER_POLL_MS`, and treats spawn errors, signals,
  prerequisite failures, and nonzero preflight statuses as could-not-run exit 2;
- gives every owner an isolated home, vault, registry, temporary directory, browser
  namespace, socket, session, server listener, and headless allowlisted
  environment, and audits all of them during cleanup. The code-target system
  owners also reap controlled fake processes and capture/release files.

On macOS the server-owned Chromium child uses the native account home because
its operating-system services fail with a synthetic home. The server and Codex
homes remain isolated, and Chromium still owns a private profile and temporary
directory that teardown must remove. Both renderer and browser-lane launches use
a mock keychain to prevent dialogs or writes to the person's macOS keychain.

On macOS, the adapter sends `press` commands through Chromium's trusted input protocol.
It omits `nativeVirtualKeyCode`, which the vendor driver sets to a Windows key code.
That value produces unwanted repeated events in macOS Chrome.
The adapter retains the command deadline and closes its input connection during cleanup.

On macOS, use Chrome for Testing. Before every local lane or gate, set
`AGENT_BROWSER_EXECUTABLE_PATH` and `ARCHBOARD_RENDERER_CHROMIUM` to its absolute
executable path in the command environment. Keep these values out of `.env` files.
Bun fixture subprocesses load these files and can add variables outside the fixture's allowed environment.
Desktop Chrome can show system default-browser prompts despite the automation flags.
Run the browser lane serially. Each owner must finish cleanup before the next starts.

The lane writes `# browser-toolchain` and `# browser-lane` JSON summaries to stderr.
The summaries identify the toolchain, selected files, owner progress, and final exit status.
A completed owner also passed its cleanup audit.
Full test output streams to the caller alongside the summaries. A failed owner or cleanup
keeps the lane's status nonzero; the summaries do not turn a failure into a pass.
The Ubuntu CI job retains this output in its `validation-log` artifact.
For a local gate, retain the full output and print its location before the run:

```bash
check_log=$(mktemp "${TMPDIR:-/tmp}/archboard-check.XXXXXX")
printf 'Full gate log: %s\n' "$check_log"
set -o pipefail
bun run check 2>&1 | tee "$check_log"
```

Motion owners call `stepBrowserMotion` before the first navigation.
It installs the existing stepped clock before application startup and advances ten 16 ms frames
before each observation. Page-side samplers inspect every frame. The helper
yields through `MessageChannel`, so React and browser events run between frames
without the nested timeout clamp. The real browser, command deadlines, and cleanup
remain under the strict adapter. The voice and walkthrough owners use this helper.

The normal package command is the canonical normal lane. Focused diagnosis accepts:

```bash
bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/<canonical-owner>.test.ts
```

One `--focus` can name any subset of the owners in any order. A repeated path runs once.
The runner refuses unknown paths and flags before prerequisites or a build.
`--test-name` needs exactly one owner and matches its complete test name.
Run owners through the adapter, which keeps browser work serial, headless and clean after interruption.

`BROWSER_TEST_PATHS` is the inventory and the order of the package command.
The runner accepts the package command or a focused selection from this inventory.

### Board reading and claims

`semantic-board-viewer.test.ts` proves that a board opens in the shell, camera
controls work, server edits reach the page, and presentation writes no board content.
`canonical-model-viewer.test.ts` uses the same browser adapter for current modules and retained readings.
Its temporary Git repository supplies real checkpoints through the public API.
It covers selection, changed or missing current inputs, source evidence, archive recovery, and unchanged retention records.
`canonical-model-publication.test.ts` covers explicit destination choice, network failure, retry, and missing-history recovery through a real local Git remote.
It shares the canonical reader interaction helpers with the viewing owner.
`canonical-model-navigation.test.ts` covers recursive scope, exact reading addresses, independent panes, connection aggregation, and complete interfaces.
It also proves that a hidden metadata edit preserves the mounted scene while the visible revision advances.
`canonical-model-selection.test.ts` covers pointer modifiers, keyboard selection, and immediate highlighting without layout or history changes.
`canonical-model-gestures.test.ts` covers drag selection and Space/middle-button panning through the existing renderer bounds.
`canonical-model-focus.test.ts` covers mixed ancestor/descendant focus, required context, history restoration, and unavailable subjects.
`canonical-model-filters.test.ts` covers relationship and group visibility, hidden selections, reveal, and unchanged authored revisions.
`canonical-model-modes.test.ts` covers explicit flow choices, complete behavioral diagrams, architecture restoration, and selection across modes.
`canonical-model-structure.test.ts` covers current structural updates through real claims and the public writer.
It covers pinned history, stable selection through renames, relationship transfer, parent changes, and removal without replacement selection.
`semantic-claim.test.ts` proves that a claimed board keeps drawing and shows the claim.
Its take-back control ends the claim, and the next agent write receives the revocation once.
The board keeps every accepted edit after take-back.

### Controlled text workbench (TASK-143.03.13)

Starts the production server composition with the exact Codex 0.160.0 protocol
fake, then drives the real browser transport and rendered shell. One short
create, send, and decline flow proves the pane workbench is operable, both
ordinary and dynamic approval effects are visible, and the mounted board
pane keeps its seeded element. The owner also checks the fake's exact version
probes, single app-server spawn, browser console, and page errors.

The startup and login recovery arms, timeline renderers, queue operations,
approval family matrices, command reconciliation, focus behavior, shell render
matrix, fullscreen controls, process cleanup, and stress cases stay in their
focused module, system, or existing browser owners. This browser owner does not
repeat them.

### Controlled live voice (TASK-143.04.07)

Extends the same exact-version production composition through controlled
browser media. The person turned subtitles off on an earlier visit. Talk in the
agent dock creates and links the conversation, starts voice and lights the orb
in the dock's circle, and the keyboard keeps its place on the key. The owner
checks the order of that wire. It checks that the voice follows the model's
output and not the microphone, that what was said lands in the conversation,
and that mute stops only the microphone. Subtitles on carry the orb to the
voice box over the pane. In a fullscreen presentation the bar's key and the
voice box carry that same session. From the keyboard, the bar's key ends it,
releases the browser's media and keeps its focus. Talk on the same key then
starts a second session that the voice box carries, and Space ends it.
Narrating the walkthrough starts a third session on a fresh coordinator. Its
words are in the voice box at the foot of the presented walkthrough. Four
things reach the voice model as one `appendSpeech` line each: the first step, a
step taken by hand, a part picked by hand mid-step, and leaving with Escape. No
coordinator turn starts. The pick names the part and not its id, and the pane
stays on its step (TASK-293.05). The dock's key ends the session and releases
its media, and the mounted board pane is unchanged.

The owner checks the keyboard order of the dock's voice controls, the target
size of the voice keys at desktop and desktop scaled, that a presented pane
hides its header and sidebar, forced colors, that reduced motion reaches the
voice box, browser errors and resource cleanup. Focused realtime, media, session,
transcript, context, spoken-approval, orb, voice box and shell owners keep
their exhaustive state and failure matrices.

## Source boundary check

- `tests/system/repository-policy/boundaries.test.ts` creates disposable source fixtures
  outside the checkout and invokes syntax-only Oxlint subprocesses with the repository's custom
  plugin. It proves what a package exports is the only way in, in every import spelling:
  extensionless paths, Vite resource queries, static `require()` (which fails the built-in
  TypeScript rule too), generated-code paths, symlinks and mocks. Production code cannot import
  a tests folder or a `./testing` export. A test reads only its own owner's support, and area
  directions hold. The retired `@/` alias and files in the old `src/` and `frontend/` roots are
  refused. Misplaced, untyped and oversized tests fail.
- `app-boundaries.test.ts` proves the same for apps: nothing imports an app, an app reaches a
  package only through its exports, entries stay thin and source sits in role folders.
  `ui-lint-policy.test.ts` proves the UI rules and the split of the lint configs.
  `workspace-layout.test.ts` proves the end state. The old roots and root `imports` are absent.
  TypeScript configurations and `components.json` contain no `@/`. The workspaces cover
  `packages/*` and `apps/*`.
- Cleanup always removes each fixture project, including after an assertion failure.

## Untracked canonical history

`packages/board/tests/runtime/operations/history/private-archive.test.ts` owns private archive setup through the public architecture interface.
It uses real files, signed Git checkpoints, and a disposable local remote.
It proves source preservation, signed structural batches, local-only publication, portable metadata, exact reopening, damaged-storage refusal, and independent vault ownership.
`packages/board/tests/runtime/operations/model-edit/private-recovery.test.ts` owns an interrupted private relationship transfer through that same interface.
It reuses the existing crash process and proves complete affected subjects, foreign-content preservation, source-context refusal, recovery, retry, and retention after collection.
It also publishes the retained candidate during interruption and preserves publication evidence through recovery.
The existing source-backed owners keep the shared archive and transaction behavior matrices.
`tests/system/semantic-boards/private-archive.test.ts` proves CLI and HTTP setup agreement and persistence after a server restart.
The slice adds no browser behavior.

## Wire and lock checks

- The command-contract owners under `apps/cli/tests/cli/` and
  `tests/system/cli/` test the Archboard-owned command-contract interface.
  Its parser fake returns a prepared invocation and contains no parsing logic.
  The tests reject malformed public results and private file artifacts before
  stdout or a local write, pin command-specific held presentation, and prove
  generated introspection omits private execution and artifact data. The
  canonical command audit is the authored
  `docs/design/cli-command-audit.json`; the Markdown audit and JSON/Markdown
  proofs are derived views. The gate renders and validates them in memory, then
  invokes `bun run generate:cli-contract -- --output-dir <temporary-directory>`
  twice from absent output directories and compares exact bytes. The script
  is `apps/cli/src/cli/operations/contract-artifacts/generate.ts`, which the
  root script runs by path, and
  `apps/cli/tests/cli/operations/contract-artifacts/render.test.ts` holds
  the rendered routes to the live registry. The system case removes
  the temporary outputs and proves the checkout status is unchanged. For a
  local readable copy, `bun run generate:cli-contract` writes the three views
  to ignored `docs/design/generated/`. The
  system CLI cases continue through the real Commander adapter and the package binary.
- The CLI owners in `test:system` resolve `bin.archboard` from `package.json` and drive
  that executable from outside the checkout. They cover vault lookup, checkout hand-off,
  repository selection, skill installation, board moves and resource cleanup.
  `apps/cli/tests/cli/rules/routing/help.test.ts` discovers command topics from
  `cliContractRegistry()` and tests their help through the real parser.
- Normal lock owners prove reachable one-server exclusion. The opt-in topology
  owner proves a claim in one Archboard server process excludes writes through
  another on the same vault and reaches its panes, which an in-process mutex
  could not do (ADR 0016).
- The repository-session owners in `test:system` use RepositoryFixture-owned HOME, XDG state, log,
  registry, and vault paths, isolated from the caller's user configuration.

The canonical independent-flow owner is `packages/board/tests/runtime/operations/model-edit/flows.test.ts`.
It crosses the public architecture read/write interface with real files and Git.
It owns collection identity, nested placements, alternative renames, complete claims, and same-operation reference repair.
The flow-repair case in `structure-recovery.test.ts` owns interrupted module and flow installation together.
`tests/system/semantic-boards/model-flows.test.ts` owns CLI authoring, explicit flow selection, real SVG output, and refused output preservation.
Existing renderer owners retain sequence and flowchart drawing rules.
No browser owner is added for this backend delivery.

## Compact canonical proposals

`packages/board/tests/runtime/operations/proposals/` owns proposal behavior at the public architecture read/write interface.
Its real file and Git cases cover compact deltas, exact materialization, planning roots, siblings, metadata, placements, predecessor refusal, signing, recovery, and private archives.
Existing history owners retain publication, shallow recovery, source isolation, and linked-worktree coverage.
`tests/system/semantic-boards/model-proposals.test.ts` owns normal CLI and HTTP routing, schema parity, lifecycle metadata, comparison selection, and refusal status.
These adapters do not repeat the domain matrix.
`canonical-model-proposals.test.ts` owns visible state selection, draft lifecycle, flow readings, claims, and live draft refresh.
`canonical-model-comparison.test.ts` owns comparison choices, coherent removed definitions, changed fields, refusal, and retained recovery.
`canonical-model-planning.test.ts` owns planning roots, retained predecessor comparisons, empty baselines, and unavailable state intent.
These browser owners use real temporary files and Git through the normal public HTTP writes.
No renderer algorithm test or model evaluation belongs to this slice.

## Canonical explanation actions

`packages/board/tests/runtime/operations/model-edit/explanations.test.ts` owns capture through the public architecture reader with real files and Git.
It covers stale revisions, stable subjects, relationship intent, and missing-flow investigation.
The existing retained-comparison case in `packages/board/tests/runtime/operations/proposals/proposals.test.ts` also owns explanation capture of exact checkpoints and independent comparison revisions.
`tests/system/server-state/canonical-explanations.test.ts` owns normal CLI and HTTP actions through the controlled production provider.
It covers concurrent invocation identity, canonical pane reports, queue cancellation, exact turn interruption, captured retries, final text, empty answers, and unavailable sign-in.
`tests/system/server-state/shown-conversation.test.ts` retains ownership of browser activation and tab checkout rules through the same HTTP contract.
The parent browser delivery owns visible controls, keyboard access, navigation during requests, and result presentation.
No live model evaluation or extra renderer owner belongs to this backend slice.
