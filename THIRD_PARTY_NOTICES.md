# Third-party notices

Archboard is licensed under the Business Source License 1.1 in [`LICENSE`](LICENSE).
The SVG renderer, the renderer core's Graphviz and the bundled fonts include
material under other licenses.
These are the notices.

## PR Lens renderer

The SVG renderer includes code adapted from PR Lens (MIT, Coldtea AI).
The source revision, retained code, and MIT License are documented in
[`packages/renderer/NOTICE.md`](packages/renderer/NOTICE.md).

## graphviz-pure

The renderer core lays out graphs with graphviz-pure 0.2.1, a Rust port of
Graphviz 16.1.0 by the graphviz-pure authors, derived from Graphviz (Copyright
AT&T Corp. and the Graphviz authors). It is licensed under the Eclipse Public
License 2.0 and includes ports of CORE-MATH and expat under the MIT License.
The six crates are vendored, with archboard's changes, in
[`crates/vendor/`](crates/vendor/README.md). Each crate's folder holds the
license text (`LICENSE`), the notice (`NOTICE`) and the MIT texts
(`LICENSES/`).

## Fonts

Onest, DM Mono and Big Shoulders Display are licensed under the SIL Open
Font License 1.1. The license texts sit beside the font files in
[`packages/renderer/assets/fonts/`](packages/renderer/assets/fonts/README.md).
