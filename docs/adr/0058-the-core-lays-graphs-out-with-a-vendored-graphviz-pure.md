---
status: accepted
---

# The core lays graphs out with a vendored graphviz-pure

The user decided this on 2026-10-26. TASK-548.01 builds it. It replaces the
section "Graphviz stays with the host for now" of
[ADR 0057](0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md),
and its clause that a worker puts Graphviz back as it was loaded before each
solve.

## Context

Track and Blocks rank and order the cards of each block with Graphviz `dot`.
ADR 0057 kept Graphviz with the host: the WebAssembly core called
`@viz-js/viz`, Graphviz's C code compiled with Emscripten, through an import,
and a native build was to link the C library. It left open whether the core
replaces Graphviz.

That arrangement had three costs:

- A native frontend needed the Graphviz C library and a C toolchain.
- An answer of C Graphviz could depend on its heap. cgraph identifies a
  named subgraph by the address of its interned name and visits subgraphs in
  that order, so the same graph could be laid out otherwise after other
  solves. Each layout worker therefore copied viz-js's memory as loaded and
  put it back before every solve.
- Half of a solve's CPU was Graphviz, and every worker loaded and compiled
  viz-js as well as the core.

[graphviz-pure](https://github.com/graphviz-pure/graphviz-pure) is a pure-Rust
port of Graphviz 16.1.0, function by function, under the Eclipse Public
License 2.0, with no C dependency and no unsafe code. Its authors made it
answer what C Graphviz answers on macOS. Graphviz sorts with the C library's
`qsort`, which is not stable, so the order of equal elements reaches the
layout. graphviz-pure ports Apple's `qsort` on purpose. viz-js builds Graphviz
against musl, Emscripten's C library, whose `qsort` is a smoothsort and leaves
ties in another order. With Apple's order, 276 of the 2,344 corpus drawings
changed.

Three spikes measured the choices (TASK-548):

- graphviz-pure 0.2.0, patched to sort as musl's `qsort` does
  (`spike/graphviz-pure`): every one of the 222 graphs captured from the
  corpus got viz-js's geometry, and 0 of 2,344 corpus drawings changed.
- dugong, a Rust port of dagre (`spike/dugong`): faster, but it drew clearly
  worse, with 17% more crossings and 14% more page area.
- A threaded WebAssembly core that lays out a render's solves on threads
  (`spike/wasm-threads`): about 5% faster, for unstable toolchain features, an
  unsafe allocator and cross-origin isolation of every page.

## Decision

The core lays out every graph a solve ranks with graphviz-pure, built into
the core. Its six crates are vendored under `crates/vendor`, from their
crates.io archives of version 0.2.1, with two changes: they name each other by
path, and `graphviz-pure-layout` sorts as musl 1.2.6's `qsort` does
(`crates/vendor/README.md`). The owner chose vendoring over a fork on GitHub.
The crates are not members of the workspace, so they keep upstream's files and
a later version diffs cleanly against them.

`crates/archboard-graphviz` implements the layout's `Graphviz` port with it.
The layout still hands Graphviz a viz-js `Graph` object. The crate replays the
cgraph calls viz-js made of that object, writes DOT that states every
object's final value, and answers `dot`'s `json0` output, y inverted, as
viz-js answered it. The WebAssembly core's `layOutBoard` takes the graph
alone, and a native build lays a board out with no C library and no host.

A solve's answer depends on its graph alone. graphviz-pure holds a layout's
state in its own values, and each call starts afresh what C keeps for a
process. So the layout workers load no viz-js and put back no memory. Each
worker instantiates the core module its host's thread compiled and checked,
and the worker pool and the `Solver` port stay as ADR 0057 has them.

WebAssembly has no fused multiply-add instruction. graphviz-pure calls
`f64::mul_add` where C Graphviz is contracted to one, and `compiler_builtins`
answers it with a slow software routine: 15.6% of a layout in the spike. The
core defines the `fma` symbol with an exact, fast emulation
(`crates/archboard-graphviz/src/fma.rs`). Naming that symbol is the one site
of unsafe code in archboard's crates, so `unsafe_code` is `deny` with one
`expect` there (`docs/agents/strict-analysis-rust.md`).

## Consequences

Every corpus drawing is the same bytes as before the change, and
`crates/archboard-graphviz/tests/viz_js.rs` holds two captured graphs to
viz-js's answers, ties included. The native test of `archboard-render`
draws a corpus board with the core's own Graphviz.

`@viz-js/viz` is gone from the repository. A worker starts by instantiating
a module, without fetching, hashing or compiling anything.

On one shared machine (TASK-548.01 notes), the first renders that
`docs/design/wide-board-layout-fixtures/timing.ts 7` measures took 10,729 ms
and 10,649 ms in all, against 10,273 ms and 10,062 ms before, and the slowest
first render, Agent workbench, took 1,703 ms and 1,674 ms against 1,754 ms
and 1,702 ms. Drawing the whole corpus on one job took 22.4 s against 24.4 s.
graphviz-pure is a port written for exactness, not speed. TASK-548.03 makes
it faster to the same bytes
([graphviz-pure-speed.md](../design/graphviz-pure-speed.md)), and hands it
the statements of a graph without DOT text unless a name or value holds a
backslash or a raw-byte character. TASK-548.02 shares answers between
workers, which is exact only now that an answer depends on its graph alone.

graphviz-pure is under the Eclipse Public License 2.0, a weak copyleft
licence. The vendored files keep it, with their notices, and
`THIRD_PARTY_NOTICES.md` names them. A change to those files is published
with them under the same licence.

A new graphviz-pure release is taken by replacing the vendored files and
applying the changes `crates/vendor/README.md` lists again, with the corpus
as the oracle.
