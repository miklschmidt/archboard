# Operator canvas shell reference

Approved 2026-08-30 as the visual direction for Archboard's application shell.
The image is a design reference, not a screenshot of current behavior and not a
pixel specification.

This supersedes the neutral and brass clean-room mockup adopted by TASK-111 as
the visual source of truth. TASK-111's shipped behavior remains product
contract and must survive the visual migration.

![Matched light and dark operator canvas shell](assets/operator-canvas-shell.png)

## Who this improves

The reference serves a person and an agent who work on one architecture
board for a long session. The goal of the shell is to make the current board,
pane, selection, code binding and agent claim easy to inspect. The shell is not
to compete with the canvas while it does that.

Archboard’s shell is desktop-only. Do not plan, implement, or gate phone/narrow
responsive layouts unless the user explicitly reverses this decision.

## Visual direction to preserve

- Use the compact lowercase `archboard` wordmark without an icon tile.
- Keep the canvas as the largest region. Chrome is flat, dense, and aligned to
  a strict grid.
- Give light and dark modes the same structure and hierarchy. Light mode uses
  chalk white, pale stone, near-black text, cobalt selection, and an acid-lime
  status accent. Dark mode uses deep charcoal, black panels, bone-white text,
  and the same two accents.
- Prefer one-pixel rules, small corner radii, and little or no shadow. Do not
  introduce gradients, glow, or rounded dashboard cards.
- Pair a neutral sans serif with monospaced secondary text for identifiers,
  paths, versions, and timing.
- Use a board navigator on the left (see [The navigator](#the-navigator)).
  Put one sidebar beside the picture of each pane for the board and the
  selection (see [The pane sidebar](#the-pane-sidebar)). Put one agent bar below
  the panes (see [The agent](#the-agent)). Show the conversation beside the
  panes only on request. Each region must earn the space it takes.

## Product mapping

The current product already has light and dark themes, board and variant
navigation, and pane identity. It also has live claim state, agent activity, and
a way for the person to take back control. The aim of adoption is to move these
contracts into the new composition, not to replace them.

The reference introduces three product additions worth building:

- A shell inspector for the selected element and its persisted code binding.
- A bottom agent surface that presents real agent state and `doing` data. This
  surface shipped as the agent bar (TASK-302).
- A non-persistent focus mode for the architecture path connected to the
  selected element.
- A lazy navigator preview that depicts the real current board scene without
  opening, claiming, or changing that board.

## Illustrative details, not requirements

Several details were invented by image generation and do not describe product
state:

- The board-level Git branch indicator is out of scope. A board does not own a
  repository branch.
- Health, latency, and error-rate values are out of scope. Archboard has no
  telemetry source for them.
- The proposed dependency diff is out of scope. Agent edits stay visible on the
  live board rather than accumulating behind a preview.
- `Send`, `Stop` and a prompt input shipped once Archboard owned its Codex
  session (ADR 0019). They drive the agent, never the board. A person's one
  control over a board is still `Take back control`.
- Illustrative or synthetic board miniatures are out of scope. A navigator
  preview must depict real current board content and remain supplemental to
  accessible board identity and state.
- The mockup's tool rail communicates density and placement, not a drawing
  toolset: nobody draws on a board here.

## The pane sidebar

Revised 2026-09-17 (TASK-249) and 2026-09-30 (TASK-383). The generated
reference above places selection details in a column on the right of the
canvas. The pane sidebar supersedes that column. A semantic pane now has one
sidebar on the left of its picture. The sidebar has the width of the old
inspector (`SIDEBAR_WIDTH`, 280 px) and two tabs:

- **Board**: what the board on screen is, and how to read it. The tab is
  ordered by the questions a reader asks, in the order they ask them.
  [The study behind the order](pane-sidebar-hierarchy.md) derives it from the
  use cases and from research on how people read diagrams. There are four
  regions, and a rule separates one region from the next:
  1. **What is this, and what does it change?** On a board reached by a
     drill-down, its variants, said and ordered as the navigator says and
     orders them: the lifecycle's mark before the name, the historical and
     shelved names receding and last. All of them are listed, with no Earlier
     row, because this is the only place their variants are chosen. Then the
     summary of the variant on screen, with no heading: the board's own
     statement of its scope. On a variant read against another,
     the changes: which variant it is compared with, one row for each standing
     that occurs with the pin the picture draws and how many subjects stand
     so, and the control that marks the changes on the picture. The counts are
     of what the picture draws, so a view in which nothing differs says so of
     the view and keeps the control.
  2. **How do I read it?** The walkthroughs, each with its number of steps and
     Narrate beside it. Choosing one presents it (see below). Then the views,
     with Everything first and the summary of the view on screen under its
     name. Then the groups, each with its colour. Choosing a group selects
     every member.
  3. **What do the marks mean?** The legend of what the picture draws: its node
     kinds, its relationship kinds, and what a heavier line and a streak mean.
  4. **The layout engine**, a preference of this browser, in one row at the
     foot.

  A section with nothing to show is absent. The pane's own board offers no
  choice of variant: the navigator lists every variant of every board, so the
  person makes one choice in one place. Views live here and not in a switcher
  on the picture, because a switcher over the picture can cover what it
  switches.

- **Selection**: the inspector for whatever is picked out, with the control that
  lets go of the selection in the tab row.

Both tabs share one frame. Text starts 16 px from either edge of the sidebar,
and so do the tab labels. A section heading is 12 px semibold in the muted
colour and in sentence case. No section heading is a small uppercase label.
Every row is at least 28 px high, and a long name wraps rather than being cut
off. A choice's fill reaches 8 px past its text. The choice on screen takes the
reading tone, as the navigator's selected row does. A row
under the pointer takes half the reading tone, so it never looks
chosen. The spacing steps are 4, 8 and 16 px.

Picking something out opens the selection tab. Letting go gives back the tab
that was open before. The sidebar keeps its width whichever tab is open, so a
pick never changes the size of the pane or moves the picture. Collapsing it to
its tab icons gives the width to the picture, which refits to it until the
person pans or zooms. A pane presented fullscreen shows the picture
without its sidebar. There is no strip above the picture.

A presented walkthrough (TASK-250) is the picture and a caption laid over its
bottom edge, with the sidebar stepped aside: the step's heading in the
`presentation` type role, its words under it, where it is in the walkthrough, the
steps, and previous and next. The camera keeps the subjects of the step clear
of the caption. The subjects include the parts at both ends of each relationship
or step that the step names. If the step names messages of a flow, the camera
shows their rows, and the one row before them, from the top of the picture.
The row before them stays because it usually says why they happen. The camera
shows the flow's whole width when that fits nearly as large, so that no column
is cut through its words. The camera glides between steps. What a step is not about recedes. A group's
region also recedes, unless it holds something that the step lights. Escape
leaves.

A flow's participant cards stay in view above the rows on screen, as a table
keeps its column names in view. The cards slide down their lifelines to the
top of the picture while a step glides and while a reader pans, and they hide
the rows that they pass over. They never go below the flow's last row.

![The pane sidebar: the board tab in both themes, and the selection
tab](assets/semantic-pane-sidebar.png)

The image holds rendered captures of the dogfood vault at 1920×1080, not
generated mockups, cut to the pane. From the left: the board tab on the
current variant of `Archboard server` in the light theme, the board tab on its
historical variant `Current architecture` in the dark theme, and the selection
tab in the light theme.

## The navigator

Revised 2026-09-23 (TASK-302) and 2026-09-30 (TASK-384). The board strip
became a navigator that stays navigable at a few hundred boards without anybody
filing them by hand. TASK-384 put every row on one grid.
[The navigator's structure](navigator-structure.md) measures the tree before
that change and says why it is drawn this way.

![The navigator: a drill hierarchy with a board's variants, two panes on
two boards, folders with nested drafts, and a
filter](assets/operator-shell-navigator.png)

The image holds rendered captures at 1920×1080, not mockups. From the left:
the dogfood vault reading `Board rasterizer` (light), the dogfood vault with
pane A on `Archboard` and pane B on `Voice coordinator` (dark), a vault with
folders and nested drafts in two panes with agents at work (light), and a
filter that finds variants by name (dark).

- **Where a board sits is decided by what the boards say**, never by activity,
  focus or recency. `/` folders in a name come first. Then comes the board
  that it drills up from (a container's up link, else the closest coarser board
  that drills down to it). A container link that runs down the levels counts as
  a down link. Then comes name order that reads numbers as numbers. A vault with
  no drill links is one alphabetical list. The order never moves under the
  pointer.
- **One grid.** Every row is four columns placed by its depth alone: the
  disclosure, the marker, the name and the facts. Each depth moves a row 16 px
  to the right, one disclosure column, so a row's disclosure sits under its
  parent's marker. A guide runs down from every open row, through the middle
  of its disclosure. Every row is 28 px for one line of name. The filter's icon
  and the lamps of Working now sit in the marker column of the top rows, and
  their text starts where the names of the top rows start.
- **One row per board.** The row shows the board's mark, its full name, and
  facts about the whole board: how many drafts it has, that nothing it
  describes is built, and the pane letters while none of its variants is
  listed. A long name wraps to a second line, then ends in an ellipsis.
  Hovering the name shows the whole name and the board's level, and the row
  says the level to assistive technology. The header names the level of the
  board being read.
  A board that cannot be read says why under its name.
- **A board's variants sit one depth in, before the boards it drills down
  to.** A mark says each variant's lifecycle: a check for current, a branch for
  a draft, a clock for historical and an archive box for shelved. A variant's
  name is smaller and lighter than a board's. The variant the board's name
  opens comes first, then the other live variants. A draft nests under the
  draft it was derived from, and under nothing else. The historical and
  shelved variants wait behind one Earlier row, newest first. While a filter
  is on, the variants it finds are listed directly under their board, with no
  Earlier row. The header draws the same lifecycle mark before the variant it
  names (`src/ui/variant-lifecycle`). A board lists its
  variants while it has more than one. A board has one disclosure. Opening it lists its variants
  and the boards it drills down to together.
- **The tree says what each pane shows.** The way to every pane's reading is
  open. While two panes are open, each pane letter sits on exactly one row:
  the variant's row where it is listed, else the board's row. One row is
  selected, the one the active pane shows. It takes the reading tone, and its name keeps the foreground colour. The tree
  draws its levels with rails and elbows, and the line from the root to the
  selected row is lit in Gold Mark. A row under the pointer takes half the
  reading tone and no lit line, so it never looks selected.
  The pane sidebar marks its choices the same way. The active pane's board
  sets its name in semibold.
- **Finding is the filter**: Ctrl K, `/`, or typing in the tree. It keeps tree
  order, dims the boards a match sits under, marks the matched letters, and
  counts what it found. Enter opens, Alt opens beside, Escape clears.
- **The tree is one tab stop** with the keys of a tree: Right opens a closed
  row, then steps in. Left closes an open row, then steps out. If the person
  is not in the navigator and a pane moves, the navigator reveals the row it
  moved to.
- **Working now** at the navigator's foot lists the boards agents are writing
  or claiming, in the order they started, with what each said it is doing. In
  the tree, a lamp on a board's mark says an agent works on it, and a faint
  ring on a closed row says an agent works inside it.

## The agent

Revised 2026-09-23 (TASK-302) and 2026-09-29 (TASK-373). The collapsible workbench, its tabs, its session
column and the Agent settings dialog are gone. The agent is one bar under the
panes. When the person asks, and only then, it is also one conversation beside
them:

![The agent bar and the conversation, finished and
working](assets/operator-shell-agent.png)

Rendered captures at 1920×1080: a finished turn in the light theme, a turn at
work in the dark theme.

- **The agent bar** is the collapsed geometry ADR 0028 measures against: forty
  pixels and a rule, whatever the agent is doing. Its line says in one phrase what
  the agent is doing: the current step of the plan, else the latest step. The
  line also says for how long, how far the agent is through its plan, what is
  queued, and whether the agent is now quiet. It offers the one control that
  state needs: Stop, Review, or signing in.
  Talk sits beside it. The composer sits at its right, under where the
  conversation opens, and says which board the agent will read.
- **Nothing to set up.** The first message or press of Talk signs the person
  in, as needed. It also starts Codex and creates the conversation of the tab:
  its voice coordinator first, then its workhorse. A message that waits on
  any of that shows what it waits on. Each browser tab holds its own
  conversation, and the board of the focused pane is what a message is about.
  A reload keeps the conversation, and a new tab or window starts a new one.
  New conversation in the agent menu starts a new one in the same tab.
- **The conversation** is 440 pixels beside the panes, which refit to the room
  left. Each turn shows the person's prompt, the progress of the plan, the
  work, the agent's answer, and how the turn ended. The work is rows that open
  to their evidence: a command's output and exit code, the files a change
  touched with lines added and removed, or a tool's arguments. A step that fails
  opens itself and a
  finished run of work folds to one line. What was said aloud stays at the
  foot as voice lines. Decisions that the agent waits on sit last, where the
  person is reading. Sending opens it. Approvals and voice never do.
- Session details (account, model, context used, thread, the voice
  coordinator) are one menu away, not on screen.

## Typography and wordmark contract

The generated reference PNG has no authoritative embedded font metadata. The
font choice is therefore a reproducible visual match, not a claim that the
reference's original font was identified. The audit compared tightly cropped
raster geometry at several antialiasing thresholds. Then it checked the
selected faces in the real shell at the supported 1920×1080 desktop viewport.

The exact reference rectangles below use `(x, y, width, height)` in the tracked
1672×941 PNG:

- light wordmark `(13, 13, 99, 28)` and dark wordmark `(849, 13, 99, 28)`
- human header text `(140, 7, 548, 40)`
- navigator labels `(10, 90, 104, 168)`
- inspector secondary text `(660, 101, 167, 108)`
- workbench text `(220, 700, 346, 126)`

The wordmark comparison at the same size produced normalized
intersection-over-union (IoU) scores. The scores were Inter 600 `.813`, Inter
Tight 600 `.801`, Geist 600 `.806`, Manrope
700 `.847`, and Onest 700 `.844`. Manrope's small numerical lead came with the
sharper terminals visible in `a`, `r`, and `d`. Onest retained the reference's
softer counters. The final Onest Medium pass at an 18.5px equivalent and
`-0.375px` tracking measured 85×13 pixels. Across thresholds 128/160/180, its
mean IoU was `.785` and its mean absolute ink delta was `5.06%`. At threshold
160, the values were `.808` and `-1.1%`. Current Inter 800 was 28.7% too dense in
the original pass. The derived candidate grids, threshold overlays, and live
shell crops remain ephemeral audit evidence rather than tracked product assets.

The final generated path, consumed through the real CSS mask in headless
Chromium at 1440×900, retained an 84×13 hard-pixel box. Against the reference
crop, thresholds 128/160/180 produced ink deltas of `+5.2%`, `+2.6%`, and
`-3.9%`. The best-shift IoU values were `.747`, `.755`, and `.751`. Every best
shift was `(0, 0)`. This is the implementation check, separate from the earlier browser
text-rendering audit.

The resulting application contract is:

- **Onest 1.000** for human interface text: 400 for body copy, 500 for labels
  and metadata, 600 for headings, and 700 for emphasis. Human headings and
  labels stay normal or title case with normal tracking.
- **DM Mono 1.000** only for technical tokens: 400 for values and timestamps,
  and 500 for compact technical emphasis such as the level badge. Repository
  names, paths, branches, commits, element IDs, and activity times are
  technical. State phrases, counts, navigator labels, inspector labels, and
  workbench prose are not.
- `font-synthesis: none` and bundled, uniquely named families prevent a
  machine-local face from silently substituting or synthesizing an unsupported
  weight. The inspector's completed TASK-140.06 grid and spacing remain its
  layout contract. This typography pass does not reopen that geometry.

Google Fonts commit
[`d0754ee`](https://github.com/google/fonts/blob/d0754ee7cddf8ba879f1f8884e3ca2b5e1b100f8/ofl/onest/Onest%5Bwght%5D.ttf)
is the source of the runtime Onest file, a variable TTF. This file carries the
audited 1.000 outlines and supplies exact 400/500/600/700
instances. The official [Onest 1.000 static
release](https://github.com/simpals/onest/releases/tag/1.000) omits SemiBold,
so the variable file is required for the 600 role. DM Mono Regular and Medium
come from upstream commit
[`57fadab`](https://github.com/googlefonts/dm-mono/tree/57fadabfb200a77de2812540026c249dc3013077/exports).
Both families use the SIL Open Font License 1.1. Exact binary, license, source,
and SHA-256 provenance is recorded beside the assets in
`src/ui/shell/assets/fonts/README.md`.

The canonical lowercase wordmark is one SVG path generated from the official
Onest 1.000 static Medium TTF with pair kerning and
`-0.02027027027em` tracking. `scripts/generate-wordmark.ts` pins and verifies
the source SHA, uses `opentype.js` 1.3.4, translates the optical outline bounds
to zero, and emits the byte-stable 85.7815×13.209 view box. The static source is
deliberate: that version of `opentype.js` reads a variable font's `fvar` table
but does not apply its `gvar` deltas to the paths that it generates. The SVG contains
only safe metadata and the `currentColor` path. It contains no text, image, script, event,
external reference, or runtime font dependency. The shell consumes it as a CSS
mask and gives the mark the accessible name `archboard`.

## Verification standard

Adoption needs three things before it is complete. Rendered browser checks must
cover both themes at the supported desktop viewport. Existing shell behavior
must remain reachable. The canvas must receive the largest share of the
available workspace. Any new
selection, focus, or preview presentation must not write to the board note.

## Provenance

- Generated with OpenAI's built-in image generation tool on 2026-08-30.
- SHA-256: `9d8521b3d608a9a4d5cddd75ce0e05f1630a5dbad76009ea4faf3859c51c6679`
- Use case: `ui-mockup`

<details>
<summary>Generation brief</summary>

```text
Design direction 3 for "archboard", a live architecture canvas
collaboratively edited by a human and an AI agent. Show two complete desktop
application screenshots side by side in one 16:9 image: the same bold
operator-focused interface in high-contrast light mode on the left and dark
mode on the right.

Use a slim project strip, compact board and lock state in the top bar, a
central architecture canvas, a narrow inspector, and a collapsible agent
workbench along the bottom. The interface should use a confident Swiss grid,
neutral grotesk type with monospaced secondary text, strong alignment, cobalt
and acid-lime accents, crisp borders, and almost no shadow. Keep the canvas
primary. Avoid gradients, cyberpunk styling, generic chat bubbles, oversized
rounded cards, decorative 3D graphics, people, perspective, and device
hardware.
```

</details>
