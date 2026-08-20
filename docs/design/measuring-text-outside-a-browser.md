---
status: draft
implements: 0015
---

# Measuring text outside a browser

Stage 3 of `the-plan.md`, TASK-070. The question it gates is whether the server
can compute the width of a piece of text with no browser open, because ADR 0015
says the server converts the agent-friendly shape once, on write, and
Excalidraw's width for a text element is exactly what `measureText` returns.

**The answer is outcome 1. A pure-JavaScript measurer reproduces Chrome
exactly, with no native dependency, from font files already in `node_modules`.**
Across 130,000 measurements it agreed with Chrome to within 0.0012 px, and on
every one of the 9,025 ASCII glyph pairs in each of the seven fonts Excalidraw
ships as files it agreed to within 0.02 px. ADR 0015 does not need amending.

Everything below was measured on 2026-08-20, in headless Chrome 150 at
`devicePixelRatio` 1, against a throwaway static server on port 41833 serving
`node_modules/@excalidraw/excalidraw/dist/prod/fonts/` and a browser session I
started myself. The canvas on port 3000 was not touched.

## The reference numbers were taken on the wrong font

`server-is-the-truth.md` §3 records five strings measured in Chrome at
`fontSize` 20 and the same five summed from Excalifont's woff2 with fontkit,
and reports the sum as out by 4.6 to 40.4 px with a ratio that is not constant.

The sum was right. The Chrome column was measured on a fallback font.

Measured in one page, on one canvas context, with one font string
(`20px Excalifont, Xiaolai, Segoe UI Emoji`), before and after adding
Excalifont's seven `FontFace`s and awaiting `document.fonts.ready`:

| String | Before the font is added | After | Pure JS | Diff |
|---|---|---|---|---|
| `a standalone caption` | 163.2715 | 203.6598 | 203.6600 | -0.0002 |
| `AuthService` | 99.9707 | 114.4999 | 114.5000 | -0.0001 |
| `Queue` | 52.1973 | 58.7599 | 58.7600 | -0.0001 |
| `Gate` | 37.7539 | 48.9200 | 48.9200 | -0.0000 |
| `gRPC` | 47.8027 | 52.3600 | 52.3600 | -0.0000 |

The left column is the Chrome column from `server-is-the-truth.md`, to four
decimals. The right column is what fontkit said, and what my own woff2 reader
says: 203.660, 114.500, 58.760, 48.920, 52.360.

The left column is also, exactly, what Chrome returns for
`20px NoSuchFamilyQqZz` and for `20px serif` on this box. Same digits, all five
strings. So it is the last-resort font, not Excalifont, and not a shaping
difference of any kind. (`20px sans-serif` gives 184.5898, 107.8320, 60.0488,
43.3594, 53.3496, which is a third font again.)

## Why "the font was loaded" and "the font was not loaded" are both true

The TASK-071 agent re-measured those five strings with `document.fonts`
reporting Excalifont loaded and reproduced 163.271484375 and the rest to three
decimals, which reads as a direct refutation of the paragraph above. It is not.

`document.fonts.check('20px Excalifont')` returned **true in my probe before I
had added a single `FontFace`**, in a fresh tab, while the same context measured
163.2715. That is the specified behaviour: `check()` asks whether every font in
the set that *would* be used is loaded, and a family with no `FontFace` at all
is not in the set, so nothing is pending and the answer is true. The call
cannot distinguish "Excalifont is loaded" from "Excalifont does not exist here".

So a check on `document.fonts` is not evidence about which font was measured.
The only reliable test is the width itself. On this box, at `fontSize` 20,
`AuthService` is 114.4999 px in Excalifont and 99.9707 px in the fallback, and
the two are 14.5 px apart, which no rounding explains. TASK-071's browser check
should assert against a known Excalifont width rather than against
`document.fonts`, or it will pass on the wrong font.

One number in that relay I cannot place: a width of 208.86 for a string whose
Excalifont width is 203.6598 and whose fallback width is 163.2715. It is
neither regime. Worth pinning down, because something is adding roughly 5 px,
and `BOUND_TEXT_PADDING` in Excalidraw is 5.

## Summing advance widths is not enough, and the rest is small

Advance widths alone reproduced all five reference strings, which is why they
looked like the whole answer. The first 37-string probe corpus disagreed on 12
of them. Five things sit on top, each found by a measurement and each cheap:

**Kerning.** Excalifont's GPOS carries a `kern` feature. Without it, at
`fontSize` 20, `To` is 1.80 px too wide, `P.` 2.00 px, `LT` 1.40 px,
`postgres://primary` 4.00 px, `Kafka topic: orders.v2` 1.00 px. Excalifont's
kern is two lookups, carrying seven explicit pairs and two class matrices of
5x16 and 34x47 between them.

**Ligatures.** `office` came out 1.82 px too wide, and so did `waffle`, `ffi`
and `ffl`, and nothing else in the corpus. Excalifont's `liga` is a chained
contextual lookup (GSUB type 6, format 1) that fires a nested ligature lookup
(type 4), so a reader that only handles type 4 finds no ligatures at all.

**No shaping crosses a space.** Blink shapes word by word. Liberation Sans kerns
a space against `A`, `L`, `T`, `Y` and `P`, and Chrome does not apply those:
` A` measured 94.482 px at `fontSize` 100 where the font's own kern says
88.965. Eight pairs, all of them involving a space. Break the string at spaces
and all eight agree.

**The face comes from the `unicode-range`, not from the glyph.** Google's
Nunito subsets overlap: several carry ASCII glyphs, and the browser still picks
by the declared `unicode-range` with the last declaration winning, as CSS says.
Choosing by cmap coverage instead put 63 ASCII pairs on the wrong subset, whose
kerning differs. Same glyph, same advance, different kern table, so single
characters could not detect it and pairs could.

**U+00AD is zero width.** Chrome lays out a soft hyphen as nothing. Every
family disagreed on exactly that one codepoint and nothing else.

## What agrees, and by how much

Each family loaded from its own shipped subsets with the exact `unicode-range`
and `weight` descriptors Excalidraw registers, extracted from
`dist/prod/chunk-FX7ZIABN.js` rather than retyped.

| Test | Measurements | Worst disagreement |
|---|---|---|
| Every ASCII pair, 0x20-0x7e squared, at 100 px, all 7 families | 63,175 | none over 0.02 px |
| Single codepoints 0x20-0x24F, 0x370-0x3FF, 0x400-0x45F, all 7 families | 5,600, of which 2,966 in-family | none over 0.02 px |
| Latin and Latin-Ext pairs, U+0041-U+017F squared, Excalifont | 57,600 | none over 0.02 px |
| A 607-string corpus at `fontSize` 20, Excalifont | 598 in-family | 0.00038 px |
| The five reference strings at 12, 14, 16, 20, 28, 36 px | 30 | 0.0012 px |

The corpus is 300 random ASCII strings of 1 to 30 characters, 60 Latin-Ext, 40
Cyrillic, 40 Greek and 40 mixed-script, generated from a fixed seed, plus 23
ligature and known-kern-pair probes, 23 realistic labels, and the 95 printable
ASCII characters on their own.

The residual of a thousandth of a pixel is floating point, not a model
difference: it grows with font size and string length and vanishes at 12 px.

One number from outside this experiment agrees too. `server-is-the-truth.md`
records the true width of the `AuthService` label on a real board as 90.54 px,
read out of a browser. That board's text is `fontFamily` 1 at `fontSize` 16, and
the measurer says Virgil at 16 px gives **90.544**.

## Height is not measured at all

Worth saying plainly, because the plan calls width and height "the two measured
fields" and only one of them is.

`getTextHeight` in `chunk-FX7ZIABN.js` is `fontSize * lineHeight * lineCount`.
No canvas, no glyphs. `lineHeight` is a per-family constant in Excalidraw's
`FONT_METRICS`: 1.25 for Excalifont, Virgil and Comic Shanns, 1.35 for Nunito,
1.2 for Cascadia, 1.15 for Lilita One, Liberation Sans and Helvetica.
`BOUND_TEXT_PADDING` is 5, and it applies to a container's minimum size, never
to the text element's own width or height.

So stage 5 needs a measurer for width and a multiplication for height.

## Cost

746 lines of throwaway JavaScript, in three files: 180 for a woff2 reader, 440
for OpenType layout, 126 for the glue that picks a face and walks a string. The
woff2 reader is small because `node:zlib` already has brotli and the tables that
matter (`cmap`, `hmtx`, `hhea`, `head`, `GPOS`, `GSUB`) are stored untransformed,
so nothing has to undo the glyf transform. A production version wants tighter
error handling and fewer eagerly-built maps, so call it a day's work rather than
a morning's, and it is code we own rather than a dependency.

No new package. No native build. The fonts are already on disk: Excalifont's
seven subsets are 84 KB inside `@excalidraw/excalidraw`.

Speed, on this box, same numbers under both runtimes:

| | node 24.18.0 | bun 1.3.14 |
|---|---|---|
| Parse all seven Excalifont subsets, once per process | 4.4 ms | 15.9 ms |
| Measure `AuthService` | 3.8 us | 4.2 us |
| Measure a 38-character string | 20.4 us | 20.4 us |

Against stage 8's budget of 6.21 ms to read, apply and write a 55-element note,
a few microseconds per text element is nothing. The one-off parse belongs behind
a lazy cache, and under `kept()` rather than module scope, or `bun run
test:module-scope` will fail it.

## What stage 5 should do

Take outcome 1. `src/core/expand-elements.ts` computes width from a measurer of
ours and height from `fontSize * lineHeight * lineCount`, and the twelve
constants in `server-is-the-truth.md` §1C are corrected as planned. Nothing is
left for a browser to correct, so nothing needs a second representation.

The measurer needs, in order of how much it costs to leave out:

1. `cmap` and `hmtx` from the woff2, using `node:zlib`'s brotli.
2. Face selection by the `@font-face` `unicode-range`, last declaration wins.
   Read the descriptors out of Excalidraw's bundle rather than copying them, so
   they cannot drift when the package is upgraded.
3. GPOS pair kerning: `PairPos` formats 1 and 2, plus the type 9 extension.
   Only lookups the default `LangSys` of a matching script references.
4. GSUB for HarfBuzz's default-on features (`ccmp`, `locl`, `rlig`, `liga`):
   lookup types 1 and 4, and type 6 chained context with nested lookups.
5. Split at spaces before kerning or forming ligatures.
6. Drop U+00AD and the other default-ignorables.

Acceptance is TASK-071's browser check, which is the right test and the only
one: convert a board, render it in a real browser, assert the browser reports
nothing back. Assert against a known Excalifont width first, so the check cannot
pass against the fallback font.

## What I could not establish

**Nunito kerns across its own subsets and I cannot reproduce it.** 511 of 58,564
Latin and Latin-Ext pairs disagree, every one of them a pair whose two
characters come from different subset files, and Chrome is narrower. Worst is
`LŸ` at 11.70 px on a 100 px font, so 2.34 px at 20 px. It is not a rule I could
copy: the two files number their kerning classes differently, 36x22 in latin-ext
against 59x48 in latin, so no combination of the two files' tables says what the
kern between them is. Chrome is getting it from somewhere neither file states.
Excalifont has no disagreement of this kind anywhere in the 57,600 pairs I
tested, which is what makes this a footnote rather than a blocker: the plan has
stage 5 writing `fontFamily` 5.

**Helvetica cannot be measured at all.** `fontFamily` 2 is marked `local: true`
in Excalidraw's registry. No file ships for it. It resolves to whatever the
viewer's system calls Helvetica, which is not the same thing on two machines, so
no server can compute its width and no amount of work here would change that.
It is deprecated in Excalidraw and nothing archboard writes chooses it, but a
board that already carries it has no honest server-side width, and stage 5 has
to decide what to do rather than discover it.

**Xiaolai and Segoe UI Emoji are untested.** Xiaolai is Excalifont's CJK
fallback and ships as 209 subsets; I did not load them. Any character outside
the chosen family falls through to Xiaolai, then to Segoe UI Emoji, then to a
system font, and the last of those is unmeasurable for the same reason Helvetica
is. In the corpus, 9 of 607 strings had a character outside Excalifont, all of
them Greek capitals in randomly generated text.

**One browser, one box.** Headless Chrome 150 on Linux at `devicePixelRatio` 1.
Not tested: another Chrome version, another platform, a HiDPI display, or
Firefox and Safari. The `devicePixelRatio` question is the one I would check
next, because a canvas measurement that scaled with it would be a different
answer, though Excalidraw's `getLineWidth` uses an unscaled context.

**Not tested:** `letterSpacing`, right-to-left text, combining marks beyond what
the random corpus produced, and the contextual features `calt`, `clig` and
`rclt`, which are on by default in HarfBuzz and which I did not implement.
Excalifont's GSUB has no `calt` or `clig`, so nothing was missing there, but
another family could differ.
