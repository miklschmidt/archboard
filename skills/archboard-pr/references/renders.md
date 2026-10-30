# The picture in a pull request

The Summary shows the change marked in place, in one picture or more. This
file says how to draw each one, how to make it readable, and how to label it.
Section 7 of the skill says how to post it.

## Choose the view

Choose from text, before you render anything. List what every view draws at
the proposal, read the way the picture will be read:

```bash
archboard semantic views <board> --variant "<proposal>" --against "<below>"
```

Each entry gives the view, `drawn` (the nodes, edges, flows and steps it
draws), `marks` (the added, changed and removed counts its key will show) and
`size`. A view with every `drawn` count at zero draws nothing at the proposal.
A view shows the change only where its `marks` count it.

1. Use a board view that holds the changed parts and their direct neighbours:
   its `marks` count the change, and `drawn.nodes` is about 4 to 12
   (**judgement**). Views belong to every variant, so prefer a view the board
   already has.
2. In a stack, use the view of the design parts that the pull request builds,
   named `Inside <design part>` or `Inside <part> and <part>`: a node-region
   selection of those parts. Every pull request that builds inside them shares
   it, so the reader sees the same frame grow from one pull request to the
   next.
3. If no view fits, add one: a node-region selection of the changed parts and
   their neighbours. The `archboard` skill's views section says how. If the
   whole variant passes the size check below, draw it instead.
4. Draw one kind of picture per render: an architecture view, or a sequence
   through its `sequence` view. Arrows that mix several kinds of relationship
   are hard to read [Kruchten]. An ephemeral sequence board draws through the
   `sequence` view that it was created with.

Done: the view is named, its listed `marks` are not all zero, and it holds
every part and relationship that `compare` reports as added, changed or
removed.

## Draw the file

Draw the picture with the default engine, Blocks.
Draw SVG, because SVG stays sharp at every zoom. Pass
`--theme auto`: the one file carries the light and the dark colours and shows
the ground of the reader's colour scheme
(see [What GitHub supports](#what-github-supports)). Pass `--title` and
`--legend horizontal`, which draw the title line above the picture and its key
under it. Write the file to a temporary directory, `$tmp`, never into the
checkout.

```bash
archboard semantic render <board> --view "<view>" --variant "<proposal>" --against "<below>" --theme auto --title "<title>" --legend horizontal --out "$tmp/after.svg"
```

- `--against "<below>"` names the variant that the proposal came from (section
  2 of the skill): the proposal of the pull request below in a stack, the
  current variant, or the base draft of a board that nobody has built.
  On an ephemeral board, it is the current variant, which states the base
  branch. The picture marks only this pull request's change, and it carries no
  planned frame, because it reads relative to the variant it names. A
  proposal with no parent has no `<below>`: leave `--against` out, and the
  picture draws every part as planned.

Never draw a before picture beside or under the after picture. The marks
already say what changed, and each variant is laid out afresh, so cards move
between two pictures and do not line up.

Done: one SVG file for each picture that section 4 of the skill asks for.

## Look at it

You cannot look at an SVG by reading its text. `semantic rasterize` draws the
same picture as a PNG in Chromium, so look at that. If there is no Chromium and
the user chose to go on without it (section 0 of the skill), post the SVG file
unseen, and say so in your final report.

```bash
archboard semantic rasterize <board> --view "<view>" --variant "<proposal>" --against "<below>" --title "<title>" --legend horizontal --out "$tmp/look.png"
```

1. Read the receipt first. Its `drawn` names every subject the picture draws,
   by `id` and `name`, with its `standing`, and `marks` holds the counts the
   key shows. Each change that the Summary names is in `drawn` with the
   standing that `compare` gives it. If one is missing, the view does not draw
   it: choose another view before you look.
2. Open the PNG. Each change that the Summary names is visible and marked, and
   the title and the key can be read.
3. GitHub shrinks an image to the width of the text column. GitHub does not
   document that width (**unverified**). If the receipt's `width` is over 900,
   rasterize again with `--scale 0.5` and open it. That is about how small it
   will show (**judgement**).
4. If the labels at half size cannot be read, split the view: one view for
   each design part that the change builds, each drawn as its own picture.
   Never drop parts from the proposal to make a picture fit.

Done: you looked at the PNG, and the picture is readable at the size it will
show.

## Title, key and alt text

A diagram needs a title and a key that explains every symbol it uses
[Clements et al., C4 notation]. The renderer draws both into the file.

**Title**: `--title "<text>"` draws your words above the picture. Say where
the change sits and what it adds, in the design's names:
`Inside Board store: the lease table replaces lock files`. A bare `--title`
draws the board, view and variant names, which are archboard's words and stay
out of the body.

**Key**: `--legend horizontal` draws the key under the picture: the added,
changed and removed marks with their counts, the kinds of part and
relationship, and the line marks. If a card carries a triangle on its
top-right corner, the key does not explain it. Say under the picture that it
marks a disagreement with the current variant that nobody settled.

**Alt text**, in the image line: what the picture shows, not the file name.
For example: "Inside Board store: the lease table replaces lock files".
Without alt text, gh uses the file name.

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
