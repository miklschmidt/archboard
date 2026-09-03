---
status: measured
implements: 0020
---

# Server rendering boundary

TASK-143.08.06.01 asks whether the pinned Excalidraw export and Mermaid
conversion stack can render an Archboard board without an Archboard browser
client. The answer is split: Bun DOM/canvas emulation renders the representative
board but silently turns a valid Mermaid flowchart into no elements. An
isolated, server-owned headless Chromium process renders the board and returns
the complete graph, so Chromium is the selected backend for the browser-free
Board render path.

This is not a way to borrow a person's browser. The selected renderer owns a
temporary profile, a loopback-only DevTools port, and its entire process group.
It has no pane, selection, camera, or connected browser session.

The measurement host used Bun 1.4.0, `@excalidraw/excalidraw` 0.18.1,
`@excalidraw/mermaid-to-excalidraw` 2.2.2, Mermaid 11.17.2, and Chromium
150.0.7871.186.

## Canonical input and bounded probes

The proof starts from the persisted note, not a vendor-shaped scene file.

- `board.excalidraw.md` contains nine real persisted elements: rectangle,
  ellipse, diamond, text, arrow, line, freedraw, image, a bound label, a bound
  arrow, three fills, the background, and the embedded file record. Its ids are
  valid one-to-eight-character Archboard block ids.
- Both probes call `readNote`, then `projectPreviewSnapshot`, before rendering.
  The Chromium probe also remaps the browser Mermaid result to Archboard ids
  and runs the in-memory result through `applyElementInput`; no proof operation
  writes a note.
- `diagram.mmd` is a three-node, two-edge graph. Both probes import and pass
  `DEFAULT_MERMAID_CONFIG`, the production server converter configuration.
- `emulation/package.json` and its Bun lock are the complete, pinned disposable
  emulation dependency input. The emulation probe copies both into a unique
  system-temporary directory and deletes that directory before returning.

The copied root runs this exact install:

`bun install --frozen-lockfile --ignore-scripts`

Each probe owns its report directory below the system temporary root and
rejects every argument. It therefore cannot write into a caller directory or
the repository. Outputs are intentionally untracked.

```bash
bun scripts/probe-server-rendering-emulation.ts
bun scripts/probe-server-rendering-chromium.ts
```

The Chromium command is run twice for repeatability. One command starts one
Chromium/profile and runs three serial normal jobs. It also exercises missing
image, malformed Mermaid, timeout, child-exit, cleanup, and replacement paths.
Before its normal session, injectable failures cover profile creation, reserved
port, failure between Chromium spawn and group capture, capture failure,
capture timeout, spawned Chromium, Vite creation, and Vite listen. Chromium
records the spawned leader PID and `/proc` start time before it awaits final
group capture. Each audit reports that candidate, whether the group proof
matched it, raw group absence, leader and pipe settlement, profile removal,
port rebindability, server state, and watcher path count after cleanup.

The per-job allowance is 20 seconds. The timeout oracle accepts only the
`Runtime.evaluate` 20,000 ms timeout cause at 19,800–21,000 ms elapsed; a
deliberate immediate evaluation error stages the same `intentional-timeout`
job and fixture phase, then must be rejected solely because it has a different
cause. Process cleanup confirms absence with `kill(-pgid, 0)`, using the
captured candidate's leader identity to refuse a reused group. A spawned child
without a candidate or a candidate that cannot be matched to the dedicated
group produces a non-clean audit, never a false absence. Once proved, cleanup
sends TERM, then KILL if the group remains live, even after the leader exits.
The same five-second allowance also bounds leader and stdout/stderr pipe
settlement. Every failure includes the current fixture phase, page
console/exception/network diagnostics, and the owned-resource audit.

## Emulation result

The disposable harness uses `happy-dom` 20.13.2 and `@napi-rs/canvas` 1.0.8.
It installs the required DOM, canvas, CSS, image, storage, event, and font
globals only for the probe; it registers all seven bundled Excalifont WOFF2
files with the native canvas font registry; it restores every global and clears
that registry before returning. Runtime console diagnostics are a failure.

The harness exported a 20,408-byte PNG and a 13,458-byte SVG. The SVG included
the bound `Service API` label and the embedded image. A malformed Mermaid
source rejected with `Error`; the valid canonical graph returned zero elements.
The fixture has a working DOM, native 2D canvas, registered fonts, an actual
export result, and no runtime diagnostics, so the remaining defect is an
inference about absent SVG layout geometry rather than a known starting
polyfill. Supplying geometry estimates would be a second renderer with no
Archboard contract. The silent empty success affects Mermaid conversion, a
reachable board operation, and is sufficient to reject emulation.

## Chromium result

The Chromium probe serves only its local ESM fixture and an in-memory snapshot
through an in-process Vite server. Vite is neither a renderer nor a child
process. Chromium itself uses `--headless=new`, a fresh temporary profile, a
reserved loopback DevTools port, and `setsid`; it never inspects an existing
browser.

Two contained executions produced identical normal-job evidence:

| Fact                                      |                                                                  First execution |        Second execution |
| ----------------------------------------- | -------------------------------------------------------------------------------: | ----------------------: |
| PNG                                       | 43,462 bytes, `a6439911658614672830df4e4520c04380e08011dfdd634ea93c6310b6fc8bfc` |                    same |
| SVG                                       | 13,458 bytes, `b654ec7a2295d9e5b6730280b21b8d78746200b937358942fed90a8388f45a3f` |                    same |
| Startup / first job                       |                                                                  503 ms / 509 ms |         577 ms / 491 ms |
| Process-tree RSS: startup / warm / steady |                                                          938 / 1,071 / 1,098 MiB | 937 / 1,070 / 1,099 MiB |
| Serial maximum                            |                                                                            1 job |                   1 job |
| Profile and observed process cleanup      |                                                                            clean |                   clean |

The probe decodes the PNG and verifies its signature, 554×405 dimensions,
background, three fill colours, and the service/store/decision regions. It
parses the SVG and verifies its root, background, fills, Excalifont text,
loaded font, bound label, embedded image, and arrow visual. It checks exact
Mermaid node labels and edge connectivity, then applies the raw browser result
to the actual inbound converter and verifies three rectangles, three bound text
elements, two bound arrows, valid ids, and stable converted output. Normal-job
hash or semantic divergence fails the command, including a mismatch after
replacement.

Malformed persisted input rejects with `Error`. Missing embedded-file data
cannot pass the SVG semantic check. Malformed Mermaid rejects with `Error`.
The intentional stalled job fails at the named `intentional-timeout` phase at
20 seconds only when its DevTools cause is the `Runtime.evaluate` timeout. Its
negative control reaches that same job and phase, then fails immediately with a
non-timeout CDP error. The oracle records the cause-only rejection. The process
is then cleaned and a replacement renders the same normal result. A separately
terminated renderer rejects a subsequent job with the Chromium-exited error.
Every injected, normal, terminated, and replacement cleanup report confirms
the candidate matched a dedicated group, group absence, settled output pipes,
profile removal, and released port. These are direct report facts, rather than
longer retry allowances.

The memory measurement rules out a process per Board render. The production
implementation needs one application-owned renderer and a serialized request
queue; it measures start, warm, and steady RSS for that persistent resource.

## Selected boundary

Board render takes an immutable named-board snapshot and returns PNG or SVG.
Mermaid conversion takes text and, only on a non-empty valid result, sends it
through the existing inbound converter and one normal locked write. Rendering
does not write a note. A valid non-empty Mermaid source that yields no elements
is a renderer failure, not a no-op.

Browser capture remains a distinct Browser operation: it captures a named live
browser target and camera. Board render remains a Board operation: it reads the
persisted snapshot and owns no pane. The selected Chromium renderer is a
server resource, not an Archboard browser client.

The result is limited to this pinned stack on this Linux host and the supported
fixture shapes. A Chromium, Excalidraw, Mermaid, or renderer-lifecycle change
must rerun both bounded probes before changing this decision.

## Production contract

The selected boundary is implemented by `src/server/board-rendering/`. One
application-owned, lazy Chromium session is retained behind a serial queue. Its
Vite module fixture is loopback-only and has no file watcher; the Chromium
process has a unique temporary profile, an owned process group, and a private
loopback DevTools port. Canvas shutdown stops admission, rejects queued work,
interrupts active DevTools work, sends TERM then KILL when necessary, waits for
the leader, observed process tree, and both output pipes, removes the profile,
releases the port, and closes the fixture. `/health` exposes only the
renderer's inspectable ownership state.

`POST /api/render/board?board=<key>` accepts `png` or `svg`, an explicit
background choice, padding from 0 through 128 scene pixels, and a scale from
0.25 through 4. The defaults are background on, 16 pixels of padding, and scale

1. The route reads the persisted note once, copies that immutable scene, and
   returns the artifact data, exact pixel or SVG dimensions, background colour,
   and source fingerprint. `archboard render --board <key> --out <file>` is the
   file-producing CLI. It never observes a pane, selection, camera, or connected
   browser.

Text render requires a known Excalidraw font family and a loadable face. Image
render requires every live image element's file id to resolve to persisted
embedded data. Missing fonts, invalid geometry, and missing files reject the
named source without producing a partial full-board artifact. A renderer
startup, runtime, timeout, or ownership failure is a distinct
`BOARD_RENDERER_FAILED` service failure with its current phase and bounded
diagnostics.

`POST /api/export/findings` inspects and renders every focused PNG from the
same copied scene in one queued renderer job. The public manifest is schema
version 2: it records the persisted source fingerprint and reports
`renderer-failed`, `source-not-renderable`, `focus-unavailable`, or
`invalid-png`; browser callbacks and browser timeout states are not part of the
contract.

`POST /api/elements/from-mermaid` sends source text through the same retained
renderer. Valid output receives deterministic Archboard ids, then passes
through the sole inbound element converter and one ordinary locked note write.
Malformed input and a non-empty source that yields no elements leave the board
version unchanged.

Live pane photography remains `POST /api/browser/capture`. That Browser
operation is deliberately separate from persisted Board render and is the only
one of these paths that requires a connected browser client.
