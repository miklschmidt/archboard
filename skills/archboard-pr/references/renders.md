# Renders for a pull request

The explainer leads with one picture: the after render, which marks the change
in place. This file says how to draw it, how to make it readable, and how to
label it. Section 5 of the skill says how to post it.

## Choose the view

1. Use a board view that holds the changed parts and their direct neighbours.
   About 4 to 12 cards reads well (**judgement**). Views belong to every
   variant, so prefer a view the board already has.
2. If no view fits, add one: a node-region selection of the changed parts and
   their neighbours. The `archboard` skill's views section says how. If a later
   reader does not need the view, draw the whole variant instead. If the whole
   variant fails the size check below, add the view.
3. Draw one kind of picture per render: an architecture view, or a sequence
   through its `data-flow` view. An ephemeral sequence board draws through the
   `data-flow` view that it was created with. Arrows that mix several kinds of
   relationship are hard to read [Kruchten]. **Judgement** for the choice of
   view.

Done: the view is named, and it holds every part and relationship that
`compare` reports as added, changed or removed.

## Draw the files

Draw every render with Blocks: pass `--layout blocks`, because the default
layout is Track. Draw SVG for the pull request, because SVG stays sharp at
every zoom. An exported SVG fixes one colour scheme and paints its own
background, so each render needs a light file and a dark file. Write all files to a
temporary directory, `$tmp`, never into the checkout.

```bash
for t in light dark; do
  archboard semantic render <board> --view "<view>" --variant "<proposal>" --layout blocks --theme $t --out "$tmp/after-$t.svg"
  archboard semantic render <board> --view "<view>" --layout blocks --theme $t --out "$tmp/before-$t.svg"
done
```

Below, `<proposal>` is the proposal, or on an ephemeral board the draft of the
head branch.

- The after render compares the proposal with the current variant. It marks
  what the proposal added, changed and removed, and keeps removed subjects as
  ghosts. On an ephemeral board, the current variant is the base branch.
- The before render, with no `--variant`, draws the current variant.
- On a board with no current variant, draw only the after render.
- In a stack, the after render also shows the changes of the pull requests
  below. Say so in its title line.

Done: four SVG files, or two on a board with no current variant.

## Look at them

You cannot look at an SVG by reading its text. `semantic rasterize` draws the
same picture as a PNG in Chromium, so look at that. If there is no Chromium and
the user chose to go on without it (section 0 of the skill), post the SVG files
unseen, and say so in your final report.

```bash
archboard semantic rasterize <board> --view "<view>" --variant "<proposal>" --layout blocks --out "$tmp/look-after.png"
archboard semantic rasterize <board> --view "<view>" --layout blocks --out "$tmp/look-before.png"
```

1. Open both PNGs. Each change the explainer names is visible and marked.
2. GitHub shrinks an image to the width of the text column. GitHub does not
   document that width (**unverified**). If the receipt's `width` is over 900,
   rasterize the after render again with `--scale 0.5` and open it. That is
   about how small it will show (**judgement**).
3. If the labels at half size cannot be read, choose or add a narrower view
   and draw again. Never drop parts from the proposal to make a picture fit.

Done: you looked at each PNG, and the after render is readable at the size it
will show.

## Title, key and alt text

The renderer draws no legend and no visible title, so the explainer writes
them. A key must explain every symbol that a diagram uses
[Clements et al., C4 notation].

**Title line**, above the render: the board, the view, and what is compared.
For example: "Board store, view Write path: proposal `lease-table` against the
current architecture". For an ephemeral board, name the two branches: "Stop
with no answer, view Stop exchange: the head branch against `main`".

**Key**, under the render. Write only the rows for marks that the render shows:

| Mark                                                                             | Meaning                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Green, a pin with a crossed bar on the top-left corner, solid outline            | Added                                                       |
| Orange, a pin with a wave, dashed outline                                        | Changed                                                     |
| Red, a pin with one bar, faded and see-through, dashed border round where it was | Removed                                                     |
| A wide tinted band under a line, in the same three colours                       | A relationship added, changed or removed                    |
| In a sequence, a faint band behind a message's row, with the pin in the margin   | A message added, changed or removed                         |
| A triangle on the top-right corner                                               | A disagreement with the current variant that nobody settled |

**Alt text**, on the `<img>`: what the picture shows, not the file name. For
example: "Board store, Write path: the proposal adds Lease table and removes
Lock files". Without alt text, gh uses the file name.

**Before render**: in a collapsed `<details>` under the after render, with its
own title line. Never side by side: each variant is laid out afresh, so cards
move between the two pictures and do not line up.

## What GitHub supports

- GitHub accepts SVG, PNG, GIF and JPEG images up to 10 MB each
  [GitHub, attaching files]. gh `--attach` uploads `.svg` and `.png`
  [gh source]. An exported SVG embeds its fonts. One measured view of 10 cards
  was about 620 kB.
- An exported SVG draws correctly as an `<img>` in Chromium, fonts and colours
  included (checked in October 2026). Its colours use CSS `light-dark()`, which
  browsers support since 2024 [MDN].
- gh rewrites only Markdown references to an attached file, such as
  `![alt](path)`. It does not rewrite HTML, and a path with `#fragment` does
  not match [gh source]. So a `<picture>` element needs the uploaded URLs,
  which is why section 5 posts in two passes.
- GitHub supports the `<picture>` element in Markdown [GitHub, basic
  formatting]. Its docs show `prefers-color-scheme` sources for a profile
  README [GitHub, quickstart]. Issues and pull requests use the `gfm` mode of
  GitHub's Markdown API. In that mode, the API keeps a `<picture>` with its
  sources and wraps it for the theme (checked with `gh api /markdown` in
  October 2026).

## Sources

- Kruchten: P. Kruchten, "The 4+1 View Model of Architecture", IEEE Software 1995. <https://www.cs.ubc.ca/~gregor/teaching/papers/4+1view-architecture.pdf>
- Clements et al.: P. Clements et al., _Documenting Software Architectures:
  Views and Beyond_, Prologue, rule 3a.
  <https://www.informit.com/articles/article.aspx?p=1641654&seqNum=5>
- C4 notation: <https://c4model.com/diagrams/notation>
- GitHub, attaching files:
  <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files>
- GitHub, basic formatting:
  <https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax>
- GitHub, quickstart:
  <https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github>
- gh source: `internal/attachments` in cli/cli, and `gh pr create --help`.
  <https://github.com/cli/cli/tree/f0b5f183c30585971a0d1544b8ac34c0b5af816d/internal/attachments>
- MDN:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark>
