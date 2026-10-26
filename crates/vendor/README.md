# Vendored crates

Third-party Rust crates that the renderer core builds in, with the changes
archboard needs. Each folder keeps its upstream licence, notice and README.

## graphviz-pure 0.2.1

[graphviz-pure](https://github.com/graphviz-pure/graphviz-pure) is a pure-Rust
port of Graphviz 16.1.0. The core lays out the graphs of a solve with it
([ADR 0060](../../docs/adr/0060-the-core-lays-graphs-out-with-a-vendored-graphviz-pure.md)).

- Crates: `graphviz-pure`, `graphviz-pure-core`, `graphviz-pure-geom`,
  `graphviz-pure-layout`, `graphviz-pure-parser`, `graphviz-pure-render`.
- Source: their crates.io archives of version 0.2.1, built from upstream commit
  `ecff610f9303512cf55e0e6eb4d7c00a3d9d6985`. The commit that imports them
  holds the archives' files unchanged, less `Cargo.lock`, `Cargo.toml.orig`
  and `.cargo_vcs_info.json`.
- Licence: Eclipse Public License 2.0 (`LICENSE` in each folder). `NOTICE`
  names Graphviz's authors and the MIT-licensed code inside
  (`graphviz-pure-core/LICENSES`, `graphviz-pure-geom/LICENSES`).

archboard changed four things:

1. Each `Cargo.toml` names its sibling crates by `path` as well as version.
2. `graphviz-pure-layout` sorts as musl's `qsort` does. Graphviz sorts with
   the C library's `qsort`, which is not stable, so the order of equal
   elements reaches the layout. Upstream ports Apple's `qsort`, the C library
   of its macOS goldens. viz-js, which laid out archboard's graphs before,
   builds Graphviz with Emscripten, whose C library is musl. `qsort_by` in
   `src/cutil.rs` is a port of musl 1.2.6's `src/stdlib/qsort.c`
   (smoothsort). `src/dotgen/qsort_vectors.txt` and
   `tests/data/qsort_expected.txt` were recorded again from musl's own
   `qsort.c`, compiled natively, on the same inputs. Every comment that the
   change touches says `archboard:`.
3. graphviz-pure lays a graph out faster, to the same answer byte for byte
   (TASK-548.03, `docs/design/graphviz-pure-speed.md`). Each change keeps the order of every decision, every tie
   and every floating-point operation, and says `archboard:` where it is:
   - `src/dotgen/mincross.rs`: `reorder` stops at the first pass that exchanges
     nothing, and runs its passes on a one-array copy of the rank
     (`src/dotgen/mincross_rank.rs`). A pass of `mincross` stops running
     iterations once one leaves what an earlier one left, and plays the rest out
     on the recorded crossings (`src/dotgen/mincross_repeat.rs`).
   - `src/common/routespl.rs`: `limit_boxes` finds each Bézier sample with
     plain arithmetic first, and the fused one only where it decides a box;
     `routesplines_` writes a spline's ends for its `-v` messages only
     under `-v`.
   - `graphviz-pure-geom/src/pathplan/triang.rs`: `ccw` reads the sign of its
     fused multiply-add from the plain one where that sign is certain.
   - `graphviz-pure-core/src/diag.rs`: `fmt_g` prints a number in fixed
     notation from one double product where its digits are certain, instead
     of two exact decimal conversions.
   - `graphviz-pure-parser/src/parser/statements.rs` (`Statements`) and
     `graphviz-pure/src/lib.rs` (`render_made`): a graph made statement by
     statement with the parser's own actions, the graph the parser reads from
     the DOT text of those statements, and laid out and written as
     `render_dot` does. `src/parser.rs` moves `startgraph` and the action of
     `attrstmt` into methods of their own for it.
4. graphviz-pure lays out the graphs of the slowest first renders faster, to
   the same answer byte for byte (TASK-548.07,
   `docs/design/graphviz-pure-speed.md`). Each change leaves every decision,
   tie and floating-point operation as it was, and says `archboard:` where it
   is:
   - `src/dotgen/mincross_rank.rs` (`RankCopy::sorted_by_segments`): `reorder`
     sorts a rank whose nodes all have a median, under `remincross` and
     without flat edges, in place of its passes, as the passes leave it. A
     test there holds the two equal on 20,000 random ranks.
     `RankCopy::passes` holds the passes, moved from `src/dotgen/mincross.rs`.
   - `src/dotgen/mincross.rs`: `transpose_step` counts a pair's crossings both
     ways in one pass over their edges (`in_cross_both`, `out_cross_both`).
     `medians` sorts its integer positions with the standard sort.
   - `src/dotgen/ns.rs`: network simplex works on a dense copy of what it
     reads and writes of each node and edge, written back when it ends.
   - `graphviz-pure-geom/src/pathplan/triang.rs` and `shortest.rs`:
     `intersects` finds each orientation once, and `pshortestpath` links
     the triangles that share an edge by sorting their edges.
   - `src/common/routespl.rs`: `limit_boxes_by_extremes` reads, for each box,
     only the run of samples, ordered by y, that its test does not leave out
     at once.

## Why they are not workspace members

The root `Cargo.toml` excludes `crates/vendor`, so these crates keep upstream's
files, and the next upstream version diffs cleanly against them. The
workspace's lint policy, rustdoc, `cargo test --workspace` and the crate rules
of `tests/system/repository-policy/rust-crates.test.ts` hold archboard's own
crates only, and `vite.config.ts` leaves these folders out of the formatter.
Clippy and rustc still compile them, with the lints upstream sets
(`unsafe_code = "forbid"` among them).

To run a vendored crate's own tests, copy `crates/vendor` out of the
checkout and run `cargo test` in the crate's folder there, so no lock file or
build lands in the checkout.

## Updating

Take the crates.io archives of the new version, replace each folder's files
with theirs, and apply the four changes again. The `qsort` vectors must come
from musl's `qsort.c`. Then render the corpus before and after
(`bun scripts/render-corpus.ts`): every drawing must be unchanged, or each
change must be one the update means to make.
