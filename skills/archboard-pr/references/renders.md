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
   through its `sequence` view. An ephemeral sequence board draws through the
   `sequence` view that it was created with. Arrows that mix several kinds of
   relationship are hard to read [Kruchten]. **Judgement** for the choice of
   view.

Done: the view is named, and it holds every part and relationship that
`compare` reports as added, changed or removed.

## Draw the files

Draw every render with Blocks: pass `--layout blocks`, because the default
layout is Track. Draw SVG for the pull request, because SVG stays sharp at
every zoom. Pass `--theme auto`: the one file carries the light and the dark
colours and shows the ground of the reader's colour scheme
(see [What GitHub supports](#what-github-supports)). Pass `--title` and
`--legend horizontal`, which draw the title line above the picture and its key
under it (see [Title, key and alt text](#title-key-and-alt-text)). Write all
files to a temporary directory, `$tmp`, never into the checkout.

```bash
archboard semantic render <board> --view "<view>" --variant "<proposal>" --layout blocks --theme auto --title --legend horizontal --out "$tmp/after.svg"
archboard semantic render <board> --view "<view>" --layout blocks --theme auto --title --legend horizontal --out "$tmp/before.svg"
```

Below, `<proposal>` is the proposal, or on an ephemeral board the draft of the
head branch.

- The after render compares the proposal with the current variant. It marks
  what the proposal added, changed and removed, and keeps removed subjects as
  ghosts. On an ephemeral board, the current variant is the base branch.
- The before render, with no `--variant`, draws the current variant.
- On a board with no current variant, draw only the after render.
- In a stack, the after render also shows the changes of the pull requests
  below. Say so in its title line: pass `--title "<text>"`.

Done: two SVG files, or one on a board with no current variant.

## Look at them

You cannot look at an SVG by reading its text. `semantic rasterize` draws the
same picture as a PNG in Chromium, so look at that. If there is no Chromium and
the user chose to go on without it (section 0 of the skill), post the SVG files
unseen, and say so in your final report.

```bash
archboard semantic rasterize <board> --view "<view>" --variant "<proposal>" --layout blocks --title --legend horizontal --out "$tmp/look-after.png"
archboard semantic rasterize <board> --view "<view>" --layout blocks --title --legend horizontal --out "$tmp/look-before.png"
```

1. Open both PNGs. Each change the explainer names is visible and marked, and
   the title and the key can be read.
2. GitHub shrinks an image to the width of the text column. GitHub does not
   document that width (**unverified**). If the receipt's `width` is over 900,
   rasterize the after render again with `--scale 0.5` and open it. That is
   about how small it will show (**judgement**).
3. If the labels at half size cannot be read, choose or add a narrower view
   and draw again. Never drop parts from the proposal to make a picture fit.

Done: you looked at each PNG, and the after render is readable at the size it
will show.

## Title, key and alt text

A diagram needs a title and a key that explains every symbol it uses
[Clements et al., C4 notation]. The renderer draws both into the file.

**Title line**: `--title` draws the board, the view, the variant and what it is
compared with above the picture. `--title "<text>"` draws your own words in
its place.

**Key**: `--legend horizontal` draws the key under the picture. It lists what
the board's legend on the page lists for the same picture: the added, changed
and removed marks with their counts, the kinds of part and relationship, and
the line marks. If a card carries a triangle on its top-right corner, the key
does not explain it. Say under the render that it marks a disagreement with
the current variant that nobody settled.

**Alt text**, in the image line: what the picture shows, not the file name. For
example: "Board store, Write path: the proposal adds Lease table and removes
Lock files". Without alt text, gh uses the file name.

**Before render**: in a collapsed `<details>` under the after render, with its
own drawn title and key. Never side by side: each variant is laid out
afresh, so cards move between the two pictures and do not line up.

## What GitHub supports

- GitHub accepts SVG, PNG, GIF and JPEG images up to 10 MB each
  [GitHub, attaching files]. gh `--attach` uploads `.svg` and `.png`
  [gh source]. An exported SVG embeds its fonts. One measured view of 10 cards
  was about 620 kB.
- An exported SVG draws correctly as an `<img>` in Chromium, fonts and colours
  included (checked in October 2026). Its colours use CSS `light-dark()`, which
  browsers support since 2024 [MDN].
- A `--theme auto` SVG declares `color-scheme: light dark` and paints its
  ground under the whole picture. As an `<img>` or a CSS background, Chromium
  and Firefox paint the ground of the page's own `color-scheme` and fall back
  to `prefers-color-scheme` when the page declares none; GitHub's Primer CSS
  sets it from the reader's GitHub theme. WebKit, and inline placement in every
  engine, follow `prefers-color-scheme` (checked in Chromium 153, Firefox 148
  and WebKit 26.4 in October 2026).
- gh rewrites only Markdown references to an attached file, such as
  `![alt](path)`, and keeps their alt text. It does not rewrite HTML, and a
  path with `#fragment` does not match [gh source].
- GitHub documents an image that changes with the theme only as a `<picture>`
  with `prefers-color-scheme` sources [GitHub, quickstart]. Each render is one
  auto SVG as a Markdown image: it needs one file and one pass, where a
  `<picture>` needs two files and a second pass to put the uploaded URLs in its
  HTML.

## Sources

- Kruchten: P. Kruchten, "The 4+1 View Model of Architecture", IEEE Software 1995. <https://www.cs.ubc.ca/~gregor/teaching/papers/4+1view-architecture.pdf>
- Clements et al.: P. Clements et al., _Documenting Software Architectures:
  Views and Beyond_, Prologue, rule 3a.
  <https://www.informit.com/articles/article.aspx?p=1641654&seqNum=5>
- C4 notation: <https://c4model.com/diagrams/notation>
- GitHub, attaching files:
  <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files>
- GitHub, quickstart:
  <https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github>
- gh source: `internal/attachments` in cli/cli, and `gh pr create --help`.
  <https://github.com/cli/cli/tree/f0b5f183c30585971a0d1544b8ac34c0b5af816d/internal/attachments>
- MDN:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark>
