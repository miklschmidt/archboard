# Vendored crates

Third-party Rust crates that the renderer core builds in, with the changes
archboard needs. Each folder keeps its upstream licence, notice and README.

## graphviz-pure 0.2.1

[graphviz-pure](https://github.com/graphviz-pure/graphviz-pure) is a pure-Rust
port of Graphviz 16.1.0. The core lays out the graphs of a solve with it
([ADR 0058](../../docs/adr/0058-the-core-lays-graphs-out-with-a-vendored-graphviz-pure.md)).

- Crates: `graphviz-pure`, `graphviz-pure-core`, `graphviz-pure-geom`,
  `graphviz-pure-layout`, `graphviz-pure-parser`, `graphviz-pure-render`.
- Source: their crates.io archives of version 0.2.1, built from upstream commit
  `ecff610f9303512cf55e0e6eb4d7c00a3d9d6985`. The commit that imports them
  holds the archives' files unchanged, less `Cargo.lock`, `Cargo.toml.orig`
  and `.cargo_vcs_info.json`.
- Licence: Eclipse Public License 2.0 (`LICENSE` in each folder). `NOTICE`
  names Graphviz's authors and the MIT-licensed code inside
  (`graphviz-pure-core/LICENSES`, `graphviz-pure-geom/LICENSES`).

archboard changed two things:

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
with theirs, and apply the two changes again. The `qsort` vectors must come
from musl's `qsort.c`. Then render the corpus before and after
(`bun scripts/render-corpus.ts`): every drawing must be unchanged, or each
change must be one the update means to make.
