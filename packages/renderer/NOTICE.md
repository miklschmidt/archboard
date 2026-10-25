# Third-party notice

This renderer includes code adapted from PR Lens by Coldtea AI under the MIT License.
The source revision is
[`0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0`](https://github.com/coldteadotai/pr-lens/tree/0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0).
The source packages were `@coldtea/pr-lens-renderer` 0.2.4 and
`@coldtea/pr-lens-schema` 0.2.1.

Retained code includes the layout of sequence diagrams, call/reply matching,
route geometry, coordinate rounding, XML escaping, and helpers that write SVG elements.
The renderer core's painter (`crates/archboard-scene` and `crates/archboard-svg`)
ports the coordinate rounding, the XML escaping and the element writing to Rust,
under this notice too.

Bundled fonts use the SIL Open Font License 1.1.
Their provenance and license texts are in
[`assets/fonts/README.md`](assets/fonts/README.md).

## MIT License

MIT License

Copyright (c) 2026 Coldtea AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
