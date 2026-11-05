---
name: Archboard site
description: The marketing site of Archboard, a dark drafting table lit from above, where real renderer drawings carry every section.
colors:
  ground: "oklch(0.135 0.005 75)"
  chrome: "oklch(0.165 0.005 75)"
  plane: "oklch(0.2 0.006 75)"
  card: "oklch(0.235 0.007 75)"
  raised: "oklch(0.255 0.008 78)"
  slab: "oklch(0.31 0.007 75)"
  well: "oklch(0.14 0.005 75)"
  code-bed: "oklch(0.155 0.005 75)"
  highlight: "oklch(1 0.01 85 / 0.09)"
  rule: "oklch(1 0.01 85 / 0.09)"
  rule-strong: "oklch(1 0.01 85 / 0.15)"
  ink: "oklch(0.955 0.006 90)"
  ink-body: "oklch(0.86 0.008 85)"
  ink-muted: "oklch(0.78 0.008 85)"
  ink-faint: "oklch(0.62 0.01 80)"
  gold: "oklch(0.831 0.134 84.5)"
  gold-mark: "oklch(0.86 0.125 86)"
  gold-top: "oklch(0.87 0.135 88)"
  gold-bottom: "oklch(0.8 0.142 81)"
  gold-edge: "oklch(0.58 0.11 74)"
  gold-ink: "oklch(0.2 0.02 70)"
  mark-hi: "oklch(0.89 0.105 90)"
  mark-lo: "oklch(0.72 0.13 75)"
  live: "oklch(0.849 0.207 128.8)"
  added: "oklch(0.792 0.209 151.711)"
  changed: "oklch(0.77 0.17 52)"
  changed-ink: "oklch(0.2 0.03 50)"
  removed: "oklch(0.76 0.16 22)"
  sky: "oklch(0.7535 0.139 232.66)"
  blue: "oklch(0.7137 0.1434 254.6)"
  teal: "oklch(0.7845 0.1325 181.9)"
  emerald: "oklch(0.773 0.1535 163.2)"
  violet: "oklch(0.709 0.159 293.5)"
  pink: "oklch(0.725 0.175 349.8)"
  orange: "oklch(0.7576 0.159 55.9)"
  yellow: "oklch(0.86 0.125 86)"
  amber: "oklch(0.837 0.164 84.4)"
  cyan: "oklch(0.797 0.134 211.5)"
  neutral: "oklch(0.72 0.01 80)"
typography:
  display:
    fontFamily: "Archboard Display, Big Shoulders Display, sans-serif"
    fontSize: "clamp(3.4rem, 10.5vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.012em"
  headline:
    fontFamily: "Archboard Display, Big Shoulders Display, sans-serif"
    fontSize: "clamp(2.6rem, 6.4vw, 4.75rem)"
    fontWeight: 780
    lineHeight: 0.92
    letterSpacing: "0.012em"
  claim:
    fontFamily: "Archboard Display, Big Shoulders Display, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 2.75rem)"
    fontWeight: 720
    lineHeight: 0.95
    letterSpacing: "0.005em"
  wordmark:
    fontFamily: "Archboard Display, Big Shoulders Display, sans-serif"
    fontSize: "22px"
    fontWeight: 560
    lineHeight: 1
    letterSpacing: "0.08em"
  title:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 2vw, 1.5rem)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.012em"
  lead:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.125rem, 1.6vw, 1.3125rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  caption:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.005em"
  chip-label:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
  mono:
    fontFamily: "Archboard Maple Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  chip: "2px"
  control: "4px"
  panel: "6px"
  table: "10px"
  window: "12px"
spacing:
  hair: "4px"
  tray: "6px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  gutter: "clamp(16px, 4vw, 40px)"
  block: "clamp(88px, 10vw, 152px)"
  section: "clamp(96px, 14vw, 200px)"
  measure: "1240px"
components:
  button-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-gold-small:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.gold-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "34px"
  button-quiet:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 20px"
    height: "44px"
  button-quiet-hover:
    backgroundColor: "{colors.slab}"
  tab-trough:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.panel}"
    padding: "3px"
  tab:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 14px"
  tab-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  table:
    backgroundColor: "{colors.plane}"
    rounded: "{rounded.table}"
  tray:
    backgroundColor: "{colors.chrome}"
    rounded: "{rounded.table}"
    padding: "{spacing.tray}"
  stage-card:
    backgroundColor: "{colors.plane}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.table}"
    padding: "20px"
  faq-item:
    backgroundColor: "{colors.plane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  faq-item-open:
    backgroundColor: "{colors.card}"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.chip-label}"
    rounded: "{rounded.chip}"
    padding: "0 8px"
    height: "22px"
  chip-changed:
    backgroundColor: "{colors.changed}"
    textColor: "{colors.changed-ink}"
    typography: "{typography.chip-label}"
    rounded: "{rounded.chip}"
    padding: "0 8px"
    height: "22px"
  code-block:
    backgroundColor: "{colors.code-bed}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.panel}"
    padding: "16px 18px"
  inline-code:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    padding: "0.12em 0.4em"
  nav-stuck:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink-muted}"
    height: "64px"
  footer:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.ink-muted}"
---

# Design System: Archboard site

## Overview

**Creative North Star: "The Lit Drafting Table at Night"**

The site is one long page in a dark room. Warm graphite planes stack under a light from above. Each plane has a lit top edge, a thin contact line and a soft warm shadow beneath it. Real drawings from the Archboard renderer lie on these planes and bring every colour the page has. The page leads with the reader's problem: understanding the code their agents write. It puts planning before the first line of code and proves that nobody places a box. The renderer's drawings carry the proof, and the chrome stays quiet.

One gold does the choosing. It marks the brand, the one action of a region, and what is selected. The type is tall condensed capitals for what a region is about, plain sans for every other word, and mono for commands, paths and counts. The values come from the renderer's dark theme in `packages/renderer/assets/theme.css`, and the type scale belongs to the site. The product's shell is a different surface with a light theme and keeps its own record at the repository root.

The build carries out the direction contract as written. The hero is left-aligned over a WebGL table that carries a model made for the site, how Archboard works, painted once by the product's painter. Each line is a light-blue laser that floats above its real route. Light runs out along the beams from the agents. When the light reaches a card, the card rises as a tile. The camera settles onto a diagonal that keeps the whole system in view. A mock Archboard window in perspective holds the real example shop. While real CLI commands type out, the product's painter brings the shop in with the app's own entrance. Each later section uses a different demonstration form: a sortable table, tabs, a relay, a switch, two panes, a timeline, a player, a zoom, a claim. The owner rejects three things. The first is the category default: a centered hero over a flat screenshot, then a grid of same-size icon cards. The others are a light theme and any label above a heading.

**Key Characteristics:**

- Dark only. `color-scheme: dark` is set in the stylesheet and in a meta tag.
- Planes, not lines. Depth comes from stacked tones, a lit top edge and a shadow, and edges are inset rings, not borders.
- One gold in a few finishes. Every other colour in the page is state, kind or the renderer's own.
- Display capitals for section heads and feature claims. Sans for prose. Mono for data.
- Left-aligned composition. Only the closing call is centered.
- Light moves along lines: a lamp pool, traffic on the table and along the drawing's lines, and sparks that draw lines. Nothing moves for decoration alone.
- Every drawing is real renderer output.

## Colors

The palette is warm graphite at hue 75, one gold, and a few meaning colours. Planes step up in lightness from the floor to a control's face. The pictures the renderer draws bring the rest.

### Primary

- **Drafting Gold** (oklch(0.831 0.134 84.5)): The flat gold. It fills the text selection and the skip link, and it rings the card that invites a click (the drill-down hint ring).
- **Lamp Gold** (oklch(0.86 0.125 86)): The gold on dark that carries marks. It sets the focus outline, link underlines, and list and fact markers. It also sets the `$` prompt, selected-tab underlines, the sorted column, the FAQ sign, wires and the current-history node. It matches the renderer's yellow.
- **Gold Button Face** (oklch(0.87 0.135 88) to oklch(0.8 0.142 81)): The vertical gradient on the primary button, edged by Gold Edge (oklch(0.58 0.11 74)). Text on it is Gold Ink (oklch(0.2 0.02 70)).
- **Mark Gradient** (oklch(0.89 0.105 90) to oklch(0.72 0.13 75)): The brand mark, and the voice orb's lines and ring.

### Secondary

State colours keep the meaning they have in the product.

- **Live Lime** (oklch(0.849 0.207 128.8)): A claim is live. It sets the pulsing dot in the mock window and the claimed state.
- **Added Green** (oklch(0.792 0.209 151.711)): Added in a proposal, and a command that succeeded.
- **Changed Orange** (oklch(0.77 0.17 52)): Changed in a proposal, a warning, and the missing-relationship chip. Text on a filled orange chip is Changed Ink (oklch(0.2 0.03 50)).
- **Removed Red** (oklch(0.76 0.16 22)): Removed in a proposal, and a refused action.
- **Text variants** (`--changed-text`, `--removed-text`, `--sky-text`, `--violet-text`): A state or kind colour mixed toward Ink, so words set in it reach the Lc 60 floor. Words use the variant. Marks, rings and swatches keep the pure colour.

### Tertiary

The kind brights appear in the kind chip, which follows the renderer's own map, and in the drawings themselves. The kinds are: user interface pink, service blue, data store emerald, external neutral, cache yellow, module teal, function cyan, route violet, queue orange, job amber. Three small data marks borrow a bright. Sky (oklch(0.7535 0.139 232.66)) colours the keys in one JSON excerpt, through its text variant. Violet (oklch(0.709 0.159 293.5)) colours code keywords through its text variant, and the swatch of a module's entry points in its pure value. The cache chip is the one place where the yellow bright and the gold are the same value.

### Neutral

- **Night Floor** (oklch(0.135 0.005 75)): The page ground and the scroll track.
- **Chrome** (oklch(0.165 0.005 75)): The frame around a demonstration, the stuck nav, the footer and the mock window's side panels.
- **Plane** (oklch(0.2 0.006 75)): The table a demonstration lies on, and the stage a drawing sits in.
- **Card** (oklch(0.235 0.007 75)): A face above a plane, such as an open FAQ item and an inline code chip.
- **Raised** (oklch(0.255 0.008 78)): A control's face and a selected tab.
- **Slab** (oklch(0.31 0.007 75)): A hovered control, the scroll thumb and the traffic-light dots.
- **Well** (oklch(0.14 0.005 75)): A recessed trough that holds tabs, rails and tables.
- **Code Bed** (oklch(0.155 0.005 75)): The floor of every code block and terminal.
- **Lit Edge** (oklch(1 0.01 85 / 0.09)): The top highlight on a plane and the hairline ring (Rule). Rule Strong (oklch(1 0.01 85 / 0.15)) rings the mock window.
- **Ink** (oklch(0.955 0.006 90)), **Body Ink** (oklch(0.86 0.008 85)), **Muted Ink** (oklch(0.78 0.008 85)), **Faint Ink** (oklch(0.62 0.01 80)): The four word colours. Body ink reaches about APCA Lc 76 to 78 on the floor through Raised. Muted ink reaches about Lc 61 to 63. Faint ink reaches only about Lc 37.

### Named Rules

**The One Gold Rule.** Gold marks the brand, the one primary action of a region, and what is chosen. No second accent hue exists. Do not use gold for decoration beyond the small square markers, prompts and glows that the build already uses.

**The Brights Mean Something Rule.** Green, orange, red and lime appear only where they mean added, changed, removed and live. The ten kind brights appear on kind chips, inside drawings and in the three small data marks above. The comparison table marks Archboard with a gold tint, never with green.

**The Quiet Ink Rule.** Faint ink is below the Lc 60 floor for secondary text. Use it for decoration, wait states, line numbers and rings. Never set a sentence or an answer in it.

**The Dark Only Rule.** The site has one theme. Do not add a light scheme or a theme switch. The browser chrome colour in the head (`#090806`) is a hand-set hex a little under the floor.

## Typography

**Display Font:** Big Shoulders Display, served as "Archboard Display" (fallback sans-serif).
**Body Font:** Onest, served as "Archboard Onest" (fallback ui-sans-serif, system-ui).
**Label/Mono Font:** Maple Mono NL subset, served as "Archboard Maple Mono" (fallback ui-monospace), in 400 and 500.

**Character:** The display face is tall, narrow and engineered, like the lettering on a drawing sheet. Onest stays plain so the capitals carry the voice. All three are the renderer's own font files, loaded from `packages/renderer/assets/fonts/` with `font-display: swap`. The two main faces are preloaded.

### Hierarchy

- **Display** (800, clamp(3.4rem, 10.5vw, 6rem), 0.9, +0.012em, capitals): The hero line only, capped at 20ch. The closing head uses the headline weight at clamp(3.2rem, 9vw, 6rem).
- **Headline** (780, clamp(2.6rem, 6.4vw, 4.75rem), 0.92, +0.012em, capitals): Each section head, capped at 14ch and set in two or three lines.
- **Claim** (720, clamp(2rem, 3.4vw, 2.75rem), 0.95, +0.005em, capitals): A capability's name, capped at 16ch. It sits between the section head and the prose.
- **Wordmark** (560, 22px in the nav, 20px in the footer, 17px in the mock window, +0.08em, capitals): The brand name beside the mark.
- **Title** (Onest 600, clamp(1.25rem, 2vw, 1.5rem), 1.25, -0.012em): A step head in the quick start. Panels inside demonstrations use 600 at 0.9375rem to 1.375rem.
- **Lead** (Onest 400, clamp(1.125rem, 1.6vw, 1.3125rem), 1.55, 38em): The hero subline, capped at 30em. A section's lead uses clamp(1.0625rem, 1.4vw, 1.1875rem) at 1.6.
- **Body** (Onest 400, 1.0625rem, 1.6, 36em): Prose and the page default, in Body Ink.
- **Small and caption** (Onest 400, 0.9375rem at 1.55 and 0.875rem at 1.5): Notes under a demonstration, in Muted Ink, capped at 52em.
- **Label** (Onest 600, 0.9375rem, -0.005em): Buttons. Controls inside demonstrations use 600 at 0.8125rem to 0.875rem.
- **Mono** (Maple Mono 400, 0.8125rem, 1.6, tabular numerals): Commands, paths, counts and code. Blocks run 0.72rem to 0.8125rem at line height 1.7 to 1.8. Inline code is 0.82em in a card chip.

The mock window and the demo panels set smaller type (10.5px to 13px) because they are scaled pictures of the product. They keep the product's roles and never set body prose.

### Named Rules

**The Tall Capitals Rule.** Display capitals name what a region is about: the hero line, section heads (h2) and feature claims (h3). Three narrow exceptions exist. The wordmark is display capitals. The language belt sets the languages the code check reads as display words. A module's name inside a demonstration of the product keeps the product's display title (the mock inspector and the interface comparison). Everything else is Onest: buttons, tabs, labels, table heads, captions.

**The Head Leads Rule.** A heading starts its region. No label, kicker, eyebrow or tag sits above a heading. The owner bans them. A line of words beside a belt, such as "The code check reads", labels the belt and sits level with it, not over a heading.

**The Mono Is Data Rule.** Mono sets commands, paths, counts and code. It never sets a heading or a label for a control.

## Layout

The page is one left-aligned column of chapters. A container holds 1240px of content between gutters of clamp(16px, 4vw, 40px). Every row uses it, the nav and the hero window too. So the logo, the headline, the window and each section start on one left edge. Nothing is centered except the closing call. The page runs in this order:

1. Hero.
2. A belt of languages.
3. Understand: zoom, one request, the code check, Measures.
4. Talk: the relay.
5. Plan: a proposal, competing options, the footprint that holds a branch to its plan, the record.
6. How it works: the pipeline, the renderer's technical detail, agents in plain sight, Archboard drawing itself.
7. Share: pictures for documents, the walkthrough.
8. Where it fits, quick start, questions, closing and footer.

The order answers the reader's next question. First comes how a feature works and where the map is wrong. Next come how to ask the architecture aloud and have the change drafted, and what the next change does. Last come how the drawing is made and how to share it.

A section opens with padding-top of clamp(96px, 14vw, 200px) and no bottom padding. Its head is a two-column grid, 7fr for the capitals and 5fr for the lead. The columns align at their bottom edge with a 24px by 64px gap and a bottom margin of clamp(48px, 6vw, 80px). Below 900px the head stacks.

A feature is a grid of prose beside a demonstration, centered vertically. The default split is 4fr to 7fr. A wide feature is 3fr to 8fr, and a flipped feature is 7fr to 4fr with the prose on the right. Features sit clamp(88px, 10vw, 152px) apart, and so do large demonstrations. Below 960px a feature stacks with prose first.

Inside components the rhythm steps in 4px, 8px, 12px, 16px and 24px. Panels pad 18px to 24px. Trays pad 6px. Prose lines stay near 36em, leads near 38em, and notes under a demonstration run up to 52em.

Responsive behaviour is simple and observed. At 1000px the pipeline and the quick start stack. At 960px features and the walkthrough player stack. At 900px section heads, tab bars and the share bento stack. The bento is one grid. The document tile spans both rows at the left, and the embed and question tiles share the right. Each tile's visual takes the height that its row gives it. At 860px the nav links hide and the FAQ goes to one column. At 760px the hero window shows only its canvas, laid out at 760 by 600 and scaled to the column. A copy of the agent's lines appears beneath it. The comparison table becomes one block per row that names every tool. The footer drops to two columns. At 420px the GitHub label hides. The review looked at 1440 by 900 and 390 by 844.

## Elevation & Depth

Depth is layered tone plus a light from above. A plane is lighter than the one under it. Its top edge catches light with an inset highlight. A 1px or 2px contact line sits under it, and a warm, soft shadow falls beyond. A recessed trough takes the opposite treatment: an inset shadow at the top and a highlight at the bottom. A demonstration sits in a tray of Chrome with 6px padding. The stage inside is a well or a plane. The content looks set into a frame.

### Shadow Vocabulary

- **Raised** (`box-shadow: inset 0 1px 0 oklch(1 0.01 85 / 0.09), 0 1px 0 oklch(0.06 0.004 75 / 0.7), 0 2px 6px -1px oklch(0.06 0.006 75 / 0.5)`): A control's face, a selected tab, a chip with weight.
- **Float** (`box-shadow: inset 0 1px 0 oklch(1 0.01 85 / 0.09), 0 1px 1px oklch(0.06 0.004 75 / 0.6), 0 12px 24px -8px oklch(0.06 0.006 75 / 0.6), 0 32px 64px -24px oklch(0.06 0.006 75 / 0.7)`): A step card, an open FAQ item, a pipeline card.
- **Table** (`box-shadow: inset 0 1px 0 oklch(1 0.01 85 / 0.09), 0 2px 0 oklch(0.06 0.004 75 / 0.6), 0 24px 48px -16px oklch(0.06 0.006 75 / 0.75), 0 64px 120px -48px oklch(0.04 0.006 75 / 0.9)`): The table every demonstration lies on.
- **Well** (`box-shadow: inset 0 2px 4px oklch(0.04 0.004 75 / 0.6), inset 0 -1px 0 oklch(1 0.01 85 / 0.09)`): A trough for tabs, rails and tables, and a pressed quiet button.
- **Hairline ring** (`box-shadow: inset 0 0 0 1px oklch(1 0.01 85 / 0.09)`): The edge of every plane, in place of a border.
- **Gold button** (`inset 0 1px 0 oklch(1 0.02 90 / 0.55), inset 0 0 0 1px oklch(0.58 0.11 74), 0 1px 0 oklch(0.06 0.004 75 / 0.8), 0 6px 16px -6px oklch(0.55 0.12 75 / 0.55)`): The primary button at rest. Hover lifts it 1px with a longer glow. Press drops it 1px with an inset shade.
- **Mock window** (`inset 0 1px 0 oklch(1 0.01 85 / 0.12), inset 0 0 0 1px oklch(1 0.01 85 / 0.15), 0 2px 0 oklch(0.06 0.004 75 / 0.6), 0 40px 80px -24px oklch(0.03 0.004 75 / 0.85), 0 100px 160px -40px oklch(0.03 0.004 75 / 0.9)`): The hero window, which stands higher than any table.
- **Marker glow** (`box-shadow: 0 0 10px oklch(0.86 0.125 86 / 0.6)`): A small gold square or dot that glows, such as a hero fact, a pipeline wire end or the current history node.

### Named Rules

**The Lit Table Rule.** Every plane carries all three of a lit top edge, a contact line and a soft shadow, or it carries none. A flat plane gets its edge from the hairline ring alone. The only zero-blur offset shadows are the 1px to 2px contact lines under a plane. Do not add a larger hard offset shadow.

**The Tray And Trough Rule.** A demonstration sits in a tray with a recessed trough or a plane inside. Selection raises a piece out of a trough and marks it with a 2px gold underline set inside its face.

**The Untouched Picture Rule.** The renderer draws a picture, and the page lays no gold, shadow or filter over it. The page can dim or light parts through the renderer's own classes, move whole parts, and ring the one card that invites a click.

## Shapes

The form language is small, square and physical. Radii come in five sizes. Chips and inline code take 2px. Controls and tabs take 4px. Panels, code blocks and FAQ items take 6px. Tables and cards take 10px. The mock window takes 12px. A few small controls inside mock panels use 3px, and tab bars use 8px. Circles are for dots, the traffic lights and the voice orb. Gold list markers are 6px to 7px squares with a 1px radius.

Edges are inset hairline rings, never borders. The only borders are the CSS triangle on a sort arrow and the zero-width resets. A side stripe never marks a card, a panel or a list item. Two data marks use a 2px inset edge: the highlighted line in a code view, and the sorted-value bar in a table. Selection has three forms. One is a 2px gold underline inside a face. One is a gold ring on a drawing card. The third is a gold tint with a 2px gold top line, on the comparison table's Archboard column.

## Components

### Buttons

- **Shape:** Slightly squared (4px radius), 44px high, 0 20px padding, a 10px gap to an 18px icon, 0.9375rem at 600. The small size is 34px high with 0 14px padding at 0.875rem and lives in the nav.
- **Primary (gold):** A physical piece of gold. A vertical gradient from Gold Button Face top to bottom with Gold Ink text, edge ring, lit top edge, contact line and warm glow. Hover lifts 1px and deepens the glow. Press sinks 1px with an inset shade. One gold button leads a region: the nav, the hero, the closing, and the action inside a demonstration (Open Inventory service, Take back control, Narrate, Talk).
- **Quiet:** A raised plane with Ink text, the Raised shadow and a hairline ring. Hover moves to Slab and lifts 1px. Press shows the Well shadow. It always pairs with a gold button ("View on GitHub").
- **Copy button:** 32px high, a raised face at 0.8125rem. It says "Copied" in Added Green for 1.8s.
- **Focus:** Every focusable element shows a 2px Lamp Gold outline with 3px offset. Transitions run 160ms with the ease-out curve.

### Tabs and segments

- **Style:** A well trough holds the choices. Each choice is Muted Ink on no fill. The selected choice becomes a Raised face in Ink with a 2px Lamp Gold underline inside it. The three-way evidence tabs add an 18px icon, a label and a one-line gloss, and the selected icon turns gold. Arrow keys move between tabs.
- **Panels:** Tab panels share one grid cell so the tallest sets the height and switching never moves the page. Panels align to the top.

### Tables and trays

- **Table:** Plane background, 10px radius, the Table shadow and a hairline ring. Every demonstration lies on one.
- **Tray:** Chrome background with 6px padding around the content.
- **Data tables:** The head sits on Well. Rows divide by a 5% highlight line. Numbers are mono with tabular figures. The sorted column shows a gold bar sized to each value. The comparison table pins its first column. It tints the Archboard column gold at 6%. The head of that column goes to 9% with a 2px gold top line.

### Cards

- **Corner style:** 10px.
- **Background:** Plane. An open item takes Card.
- **Shadow:** Float.
- **Border:** A hairline ring.
- **Padding:** 20px to 24px.
- **FAQ item:** A plane at 6px radius. A 14px gold plus turns into a minus as the item opens. The open item rises to Card with the Float shadow.

### Chips

- **Style:** 22px high, 0 8px padding, 2px radius, 0.75rem at 600. The solid orange chip uses Changed Ink on Changed Orange. The tinted chip uses orange text on a 14% orange tint with a 40% ring. The quiet chip uses a Well face with mono text.
- **Kind chip:** A square with a radius of 24% of its size. A 20% tint of the kind colour sits over Slab, and the kind's Remix icon takes the kind colour. It copies the chip the renderer draws on a card.

### Code

- **Style:** Code Bed floor, a hairline ring, 6px radius, mono at 0.72rem to 0.8125rem with 1.7 line height. Commands are Ink and replies are Muted Ink. A `$` prompt is Lamp Gold. A warning is Changed Text and a success is Added Green. A block that can scroll sideways takes keyboard focus.
- **Copy:** Each block copies as one command list.

### Navigation

- **Style:** A sticky 64px bar, transparent at the top. After 8px of scroll it takes Chrome, a bottom hairline and a soft shadow. The left holds the mark at 24px and the wordmark. The centre holds five section links at 0.9375rem and 500 in Muted Ink, which brighten to Ink with a faint wash on hover. The right holds the GitHub link and the small gold button. A skip link slides in on focus. Below 860px the links hide.

### Footer

- **Style:** Chrome with a top hairline. It holds the wordmark, the licence note and two link columns in Muted Ink. The column titles are 0.875rem at 600 in Ink and sit over lists, not over headings.

### Pictures

Every diagram on the page is Archboard renderer output in the dark theme. The drawings show the example shop or Archboard's own model. The social card is the only raster image. Provenance:

- `docs/readme/web-shop-dark.svg`, `docs/readme/sequence-dark.svg` and `docs/readme/architecture-dark.svg` come from the README's asset build. They are the example shop, the "Place an order" sequence and Archboard's own architecture.
- `site/src/diagrams/checkout-api.svg`, `inventory-service.svg`, `live-events.svg`, `nightly-batch.svg`, `place-order-flowchart.svg`, `place-order-sequence.svg` and `queued-fulfilment.svg` come from `site/scripts/render-diagrams.sh`. It runs a private Archboard server over a copy of the example shop and calls `archboard model render`. The two `place-order` drawings come last. Before them, the script rewrites the copy's "Place an order" flow from `site/scripts/place-order-logic.changes.json`. With that flow, the Grammars demo shows its stock and payment decisions and its receipt loop. The walkthrough keeps the README's sequence, because the example's walkthrough narrates that flow. Draw them again after a renderer change and commit them.
- The hero's table shows `site/model`, a small model made for the site. The model's figure shows the top reading of `.archboard/vault`, with a filter that hides its dependency relationships. The product's painter paints both live (ADR 0071). `site/scripts/paint.ts` writes their paintings at build time into `site/src/paintings/`, which Git ignores, because a painting belongs to the painter of the same core build. The hero's painting has no ground and no lines, and its cards are flat, because the hero's shader draws the depth and every line. The figure's painting is the app's own look. The figure is as wide as the page allows and no taller than the screen, so the whole picture is in view. Where the screen is wide, it reaches past the text's column. The painter is the app's, in the app's order: WebGPU, then WebGL2, then the CPU (ADR 0074). Once the figure's foot is in view, the painter brings the picture in with the app's own entrance. The picture is large. A frame of the entrance costs about one refresh on WebGL2 and more on the CPU. So the picture comes in on either GPU, and it stands whole on the CPU and with reduced motion. Its traffic runs only on WebGPU. Without script, and wherever no painter draws, the figure shows the renderer's SVG of the same reading, which `site/scripts/paint.ts` writes beside the painting.
- The one raster is `docs/assets/archboard-social-card.jpg`, the existing social card, used as `og:image`.
- The favicon, `site/public/favicon.svg`, is a hand-written SVG of the brand mark. The mark component draws the same shape in the page, as the shell's brand does.
- Icons are Remix Icon line glyphs, inlined as SVG through `site/src/lib/icons.ts`. The kind chips use the icons and colours the renderer gives each kind.
- Inline drawings get a unique id prefix so two drawings never share ids. Alt text names what the drawing shows.
- Mock interface data is labelled as an example in its caption.

### Signature: the lit field

A WebGL2 shader draws a table in perspective on warm ground. A lamp pool follows the pointer and drifts. Pulses of light in the kind colours run along the lanes of an engineering grid. The closing uses it, with pitch 0.95, lift 2.2 and traffic 1.3, and draws the grid's major and minor lines too. Scroll slides the table. The canvas fades in over 1600ms only after the first frame draws. If WebGL2 or the shader fails, the canvas stays empty and the CSS ground and wash show.

### Signature: the hero's table

The hero's table carries `site/model`. Once the page is idle, the product's CPU painter paints the picture once into two still images. The first holds the whole picture, and the second holds the part nearest the eye. Each image is 1.1 times as fine as the screen shows its densest point, up to 8192 pixels on a side. When a resize needs a finer picture, the painter paints it again 400ms after the size settles. One WebGL2 fragment shader draws everything else. It traces each pixel's ray to the table, a tray, a tile or a label, and prints the picture on what the ray meets.

The camera starts higher and square to the picture, and settles onto a diagonal as the light draws it. The light leaves the agents and runs along each route at 720 picture units a second. When the light reaches a card, the card rises over 0.7s from under its floor as a rounded tile 0.055 table units thick. Until then nothing of it shows, not even the edge of its print on the floor. When the light first enters a tray, the tray sinks 0.03 units into the table. A label shows over 0.3s as the light passes it.

Each line is a laser in the site's sky blue. It leaves its source's tile 60% of the way up the tile's side, rises to its own height and falls into its target's tile. A main line floats highest and burns thickest. A dotted line floats lowest, as a string of drifting beads, so lasers that cross pass each other. A laser has a white-hot core and a glow that falls off with distance and then fades out, so it ends in no edge. Smoke rises off it where it runs straight. The smoke is densest at the middle of a long straight stretch and gone at the stretch's bends and ends. So no two stretches look alike. It thins gradually away from the beam, so its ragged outer wisps fade out with no edge. It drifts the way the light runs and hides a little of what lies behind it. Each laser flickers on its own. Its glow shows over the table and the trays alike, and only a tile or a label in front of it hides it. Its energy runs along it toward its target, and it flares where it strikes its target, which shows its way in a still picture. A faint light falls on the table under it and on the sides of the tiles beside it. Its label floats on it as a plate and covers the laser behind it. Packets of traffic run along it toward its target. A packet's head is sharp in the core, and its light swells into the smoke ahead of it.

When the pointer rests on a card for 120ms, its tile lifts 0.1 units, its lasers brighten and the rest of the picture dims. Under reduced motion, the table shows its rest state at once, and nothing on it moves on its own. The shader draws at up to two device pixels for each CSS pixel. A pixel near the outline of a tile, a tray or a label takes five rays, so edges stay smooth at 4K. When most frames take longer than 20ms, the host draws fewer pixels. If fewer pixels do not make the frames faster, the host returns to its earlier size and stops.

### Signature: the hero window

A mock Archboard shell at 1280 by 760 holds the example shop, which the product's painter draws on the CPU. It scales to its column. While part of it is below the fold, it leans back by up to 12 degrees in a 2400px perspective. It is straight once all of it is in view, so a tall screen shows it straight from the start. The agent starts 350ms after the window's foot comes into view, and its lines type at 14ms a character while the picture waits empty. When the agent's edit lands, the painter brings the shop in with the app's own entrance. The cards come out of the middle in a wave, and a spark draws each line. Each label arrives as its spark reaches it, and the traffic of a line starts once the line is drawn. A Replay button appears 2.2s after the last line. With reduced motion, without script, or where the painter does not start, the renderer's SVG of the same picture stands whole. A caption below the window says that it is a mock around a real drawing.

### Signature: the walkthrough player

The real checkout drawing and sequence diagram sit on a plane. A raised box holds a step rail, the voice orb, the beat's title and word-by-word subtitles, and prev, Narrate and next controls. The orb is the product's own: the agent dock's runner, dynamics and painter from `packages/workbench/src/ui/clients/orb` and `rules/orb`, drawn on a 2D canvas. It is a lens in a gold ring with eleven ruled lines that record the voice's level. A syllable swells in the middle of the front line and rolls back through the sheet. The subtitles' words stand in for the measured level of the Codex voice: one swell for each syllable, at the levels of normal speech. When narration starts, the voice connects for half a second. A paused narration listens while its lines breathe. Each beat rings its parts with the renderer's gold ring and dims the rest to 28%. Narration starts as the player comes on screen. It stops as the player leaves. A pause by the reader holds. The words play without sound.

### Signature: the talk relay

A tray holds a conversation with the Codex voice about the example shop, from `site/src/lib/talk-script.ts`. The voice box at the left is a plane. It holds the product's orb, the voice's state in the product's own word, and a transcript. The states are Starting, Listening and Speaking. What you say sits in a raised bubble, and what the voice says follows as plain words. At the right, a well trough holds two thread panels, the coordinator and the workhorse. Each panel names its job in one line. Its log shows its commands with the gold `$` and its replies in Muted Ink. The words passed between the voice and the threads show as raised messages. The commands and their options are the real CLI's. The conversation ends on the shop's real Queued fulfilment proposal and its compare counts, which the plan section shows next. The relay starts as it first comes on screen. Words arrive at the walkthrough's pace of speech, yours a little faster, and the orb swells with the voice's words. Commands type at 14ms a character, as in the hero window. The panel at work rises out of the trough as a raised face with the Float shadow. Every step runs on visible time, so the conversation waits off screen. A gold Talk button pauses and resumes it, and replays it once it ends. Every line keeps its place from the start, so nothing moves as the conversation fills in. Without script and with reduced motion, the whole conversation stands at once and the button is hidden. Below 960px the threads stack under the voice box.

### Named Rules

**The Real Output Rule.** Every diagram is real renderer output, drawn in the dark theme from the example shop or from Archboard's own model. Never draw, trace, edit or imitate one by hand. Never use a screenshot of a mock or a generated image. A drawing that looks wrong is a renderer bug. Fix the renderer and draw it again.

**The Spark Order Rule.** A picture builds in one order: the cards land, a spark draws each line, then the traffic runs. Lines never appear all at once. This repeats the product's own Spark Rule. With reduced motion, everything is there at once.

**The Pause Rule.** Motion carries meaning, and it stops once nobody can see it. Every loop runs only while its element is on screen and the tab is visible. The fields, the orb, the narration, the relay's conversation and the proposal switch's autoplay do this through one helper, `whileVisible`. A CSS loop sits inside an element marked `data-loop`, and `pauseLoopsOffscreen` pauses its animations while that element is off screen. Moving content offers a way to stop it. The language belt has a Show all control that stops it and wraps every language. With reduced motion, the belt shows the wrapped list from the start. The relay's gold button pauses its conversation. Under `prefers-reduced-motion: reduce`, a shader draws one still frame. Scroll-driven tilt and parallax turn off. Autoplay and narration do not start. A global rule cuts every CSS animation and transition to 0.01ms and one iteration. A new loop follows both.

**The Rise Rule.** Content is visible without script. With script, a revealed block waits transparent and 32px low until its top clears the bottom 15% of the view. Then it fades in over 800ms and rises over 1000ms with the ease-out curve, once. Siblings stagger by 100ms to 120ms. If the page script never runs, an inline fallback shows every block after 3 seconds.

## Do's and Don'ts

### Do:

- **Do** keep the page dark only. Set every new plane from the Night Floor to Slab ladder.
- **Do** spend gold on the brand, the one primary action of a region, and what is chosen.
- **Do** set section heads and feature claims in the display face in capitals, and every other word in Onest.
- **Do** open every region with its heading. Put the lead beside or under it.
- **Do** set commands, paths and counts in Maple Mono.
- **Do** build each plane with a lit top edge, a contact line and a soft warm shadow, and edge it with an inset hairline ring.
- **Do** show every diagram as renderer output, and name what it shows in the alt text.
- **Do** keep green, orange and red for added, changed, removed and live.
- **Do** run every new loop only while visible, and give it a still state for reduced motion.
- **Do** give each demonstration its own form, and keep the composition left-aligned.
- **Do** label mock interface data as an example.
- **Do** make bold claims that a command backs, and name the command. Put planning first wherever the page compares jobs. State the platform, license and model-provider limits before the install step. Put the renderer's implementation under the outcome it explains.

### Don't:

- **Do not** add a light theme, a theme switch or a second accent hue.
- **Do not** put a label, kicker, eyebrow or tag above a heading.
- **Do not** set body text, buttons, tabs, table heads or captions in display capitals.
- **Do not** draw, trace or imitate a diagram by hand, and do not use a screenshot or a generated image in place of renderer output.
- **Do not** use hard offset shadows larger than a 2px contact line, side stripes on cards, panels or list items, emoji or glyph icons.
- **Do not** set a sentence or an answer in Faint Ink.
- **Do not** use state colours or kind brights as decoration.
- **Do not** lay gold, shadow or blur over a renderer drawing.
- **Do not** build a grid of same-size icon cards, or a centered hero over a flat screenshot.
- **Do not** edit or reuse the product's root `DESIGN.md`. It records the light application shell, which is a different surface.
