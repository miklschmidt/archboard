---
status: measured
implements: 0020
---

# Server rendering boundary

TASK-143.08.06.01 asked one narrow question: can the pinned Excalidraw export
and Mermaid conversion packages run correctly with no Archboard browser client?
The answer is split. Bun DOM and canvas emulation can export the tested board
image. It silently loses a valid Mermaid diagram. An isolated, server-owned
headless Chromium process handles both, so Chromium is the selected rendering
backend for the browser-free board path.

The measured stack is Bun 1.4.0, `@excalidraw/excalidraw` 0.18.1,
`@excalidraw/mermaid-to-excalidraw` 2.2.2, and Mermaid 11.17.2. The selected
renderer is Chromium 150.0.7871.186 on this Linux host.

This is not a recommendation to use a person's browser in the background. The
renderer owns a temporary profile, a loopback-only control port, and its own
process group. It does not know about panes, selections, cameras, or connected
browser sessions.

## Canonical inputs and repeatable proof

The tracked inputs are deliberately small and inspectable:

- `docs/design/server-rendering-boundary-fixtures/board.json` has nine native
  Excalidraw elements. It covers rectangle, ellipse, diamond, text, line,
  freedraw, a bound label and arrow, fills, an embedded one-pixel image, and its
  persisted file entry.
- `docs/design/server-rendering-boundary-fixtures/diagram.mmd` has a three-node
  Mermaid flowchart.
- `docs/design/server-rendering-boundary-fixtures/chromium.html` calls the
  pinned export and Mermaid APIs against those inputs.
- `scripts/probe-server-rendering-chromium.ts` starts the disposable proof
  renderer, checks the returned facts, and writes only a generated report to an
  explicitly supplied empty directory.

Run it with a temporary output directory. Do not keep that output in the
repository.

```bash
proof_root=$(mktemp -d /tmp/archboard-server-rendering-proof.XXXXXX)
bun scripts/probe-server-rendering-chromium.ts --out "$proof_root"
```

The script starts Vite only to serve the proof fixture's ESM imports. Vite is
not part of the selected runtime. The renderer itself starts Chromium with a
fresh temporary profile, `--headless=new`, a reserved loopback DevTools port,
and a new process session. It drives one private target through DevTools, not a
live Archboard browser. Each Chromium child has a 20 second limit. Cleanup has
five seconds to prove that every process observed in its own process group is
gone, then the script removes the temporary profile.

## Emulation result

The first attempt used Bun 1.4 with `happy-dom` 20.13.2 and
`@napi-rs/canvas` 1.0.8. The canvas bridge registered the bundled Excalifont
faces, supplied the DOM and canvas APIs Excalidraw imports, restored every
installed global after a render, and cleared its font registry on exit. Those
packages are not committed because this backend was rejected.

The board fixture exported correctly twice with identical hashes:

| Output |  Bytes | SHA-256                                                            |
| ------ | -----: | ------------------------------------------------------------------ |
| PNG    | 20,408 | `ccad6454b7ecda111308052b1e03c1e23e6967816f82261221e3891205d3e8bb` |
| SVG    |  8,525 | `0b2f0ede57b63d8f911509fcefaf2e7c2c24bc56a7d9d3001c358c26b4965800` |

The SVG contained the bound "Service API" label, the image data URI, the
fixture colours, and `Excalifont` font-family declarations. The PNG had a valid
PNG signature. The first emulated render moved process RSS from 82 MiB to 165
MiB. A second isolated DOM render ended at 176 MiB.

Mermaid failed the bar. The valid flowchart returned `{ "elements": [] }` with
no error. The malformed fixture did reject with Mermaid's parse error. A caller
would therefore receive apparent conversion success and write nothing. The
fault is reachable because Mermaid needs SVG layout geometry that this DOM and
canvas pair does not provide. Adding local geometry estimates would create a
second, unverified renderer. It is more complicated and less reliable than the
fallback below.

## Selected Chromium result

The Chromium proof ran twice with no Archboard server and no connected browser
client. Each run rendered the board, converted the Mermaid flowchart, and
deliberately sent malformed Mermaid input.

| Fact                             |                                                                        First run |                                                                       Second run |
| -------------------------------- | -------------------------------------------------------------------------------: | -------------------------------------------------------------------------------: |
| PNG SHA-256                      | `a6439911658614672830df4e4520c04380e08011dfdd634ea93c6310b6fc8bfc`, 43,462 bytes | `a6439911658614672830df4e4520c04380e08011dfdd634ea93c6310b6fc8bfc`, 43,462 bytes |
| SVG SHA-256                      | `a0c3acf4b77f1b4b1e01ae67ed328b387699fd654816159f04e0039c4abb76d1`, 13,478 bytes | `a0c3acf4b77f1b4b1e01ae67ed328b387699fd654816159f04e0039c4abb76d1`, 13,478 bytes |
| Mermaid output                   |                                                                       5 elements |                                                                       5 elements |
| Invalid Mermaid                  |                                                                          `Error` |                                                                          `Error` |
| Renderer startup                 |                                                                           157 ms |                                                                           161 ms |
| Render and conversion            |                                                                           875 ms |                                                                           369 ms |
| Process-tree RSS at startup      |                                                                          641 MiB |                                                                          600 MiB |
| Process-tree RSS after rendering |                                                                        1,068 MiB |                                                                          974 MiB |
| Owned-process cleanup            |                                                                            clean |                                                                            clean |

The exported SVG had both the bound label and the embedded image. Byte count
and hash matched across runs for PNG and SVG. The report declared deterministic
output. The script records the exact process ids it created, sends the session
group a termination signal, waits for cleanup, and fails if an observed process
remains. Its temporary profile is removed only after that check.

The memory cost rules out one Chromium process per request. The production
renderer needs one application-owned process and one request queue. It receives
an immutable persisted-board snapshot, returns PNG, SVG, or converted Mermaid
elements, and is killed and replaced after a timeout or failed health check.
No request may attach to, switch, inspect, or capture a user browser.

## Failure contract for the follow-on implementation

TASK-143.08.06.03 should give the server renderer these rules:

- Start and stop it with the Canvas application lifetime. Use only a private
  profile and loopback control channel.
- Serialize immutable render jobs. Return an error when the renderer exits,
  times out, or produces invalid PNG or SVG data.
- Treat a non-empty Mermaid input with no returned elements as a renderer
  failure. Do not start the inbound converter or write the note in that case.
- Send successful Mermaid elements through the existing inbound converter and
  one normal locked write. Rendering itself never writes a note.
- Keep Browser capture on the `archboard browser` path. It captures a named
  live target and camera. A Board render reads a named snapshot and returns an
  artifact.

The proof does not claim pixel equality across every Chromium version or
platform. It proves the pinned stack on this Linux host, with the current
Archboard element types, and gives the selected owner a stable regression
fixture. A future dependency or Chromium update must rerun this fixture before
changing the renderer choice.
