# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are software and cloud architects who work with a coding
agent (Claude Code or Codex). They find archboard on GitHub and run it from a
clone on Linux or macOS. They read it in a desktop browser.

The work has two actors. The agent reads the code and authors the boards
through the CLI. The architect (the user in `CONTEXT.md`) reads the boards,
picks things out, asks, compares and presents. A typical session is long: an
architect and an agent work on one board together for hours.

The people who receive what the architect makes are a second audience. A
pull-request reviewer watches a narrated walkthrough video. A newcomer plays
back a tour of a system. A reader of a design doc or an ADR sees a rendered
board.

## Product Purpose

Archboard is an architecture planning tool. The coding agent states what a
system is: its parts, what contains what, how the parts talk, and in what
order. The renderer draws every line.

The main job is to understand a system. The architect reads a board and
drills from the system down to a service and to the file. They open the code
and ask the agent about a part. Understanding comes first because the second
job depends on it.

The second job is to plan a change. A proposal is drawn against the
architecture that exists, and competing options sit side by side. The option
that ships is adopted with the reason for it. The state it replaces stays as
history.

Success means this: an architect understands a system that they did not draw,
from its boards alone. Then they plan a change against it and trust that the
picture says what the code is.

## Positioning

Nobody places a box. The agent states meaning and the renderer draws it, so a
renderer improvement redraws every board at once, history included (ADR 0023).

Archboard keeps one model of each system and changes it over time. One file
per board holds every variant: current, draft, historical and shelved. A
proposal is compared with what exists part by part, and each adoption keeps its
date and reason. The agent that changes the code updates the map in the same
task. Claims and version checks let several agents write safely. The same
board is narrated by a voice and recorded to video.

## Operating Context

- The agent writes boards with `archboard semantic …` commands in a terminal.
  The architect reads them in browser panes that the Archboard server serves on
  `127.0.0.1`, with no authentication.
- Boards live in a vault, a directory of `.semantic.json` files. The vault is
  usually committed with the code, so a board change is reviewed in the same
  pull request as the code change. A vault is the `.archboard/vault` directory
  of one directory. A command finds its vault from the directory it runs in, as
  git finds a repository: at the checkout root inside a git checkout, or in the
  nearest enclosing directory outside any checkout. `-C <dir>` starts the
  search elsewhere, and every answer names the vault that it used. The first
  command in a checkout that the machine does not know registers it, and the
  answer says so.
- The shell has a navigator of boards, up to two panes side by side, a sidebar
  for each pane, and an agent dock at the foot of the navigator. Talk and Narrate start the
  voice.
- One Archboard server serves every vault on the machine, and it starts without
  one. The navigator lists
  every repository that has a vault, each with the boards of its chosen
  checkout. A repository is named by its identity, or an untracked vault by its
  registry name. The menu on a repository's row chooses its checkout for the
  whole machine. The two panes of one tab can show boards of two repositories,
  and the address names the repository of each pane beside its board.
- Code bindings open a part's file in VS Code, Cursor, Zed or on GitHub.
- Boards also leave the app: as SVG or PNG for docs, ADRs and pull requests,
  and as a narrated MP4 attached to a pull request.
- Archboard maps itself. Its own architecture is in `.archboard/vault`, and
  every task changes it through a proposal.

## Capabilities and Constraints

`CONTEXT.md` defines the domain terms (board, pane, node, variant, proposal,
adoption, walkthrough and the rest). Product copy uses those terms.

Shipped capabilities:

- architecture boards, and sequence views over the same parts
- levels and drill-down from board to board
- variants with a lifecycle, and comparison of any two of them
- walkthroughs, narration by the Codex voice, and recording to video
- an agent dock and conversation that read the board and the selection
- claims, the doing of each write, and the control that takes a board back
- every repository's boards in one browser app, and a choice of checkout for
  each repository
- groups, code bindings, illustrated traffic, and SVG and PNG renders

Constraints that every surface keeps:

- Agents author, users read. The browser writes nothing to a board. A user's
  one control over a board is to take back an agent's claim. Send, Stop and
  Talk drive the agent and never edit a board.
- No layout by hand. If the meaning is right and the picture is wrong, the
  renderer has a bug.
- Archboard is a desktop app for use near full screen at 1920×1080. Screens
  smaller than 1080p are out of scope, and it has no phone or narrow layout.
- Codex runs the agent, the voice, narration and recording, through a
  private app-server with its own sign-in. Any agent that runs a CLI can author
  boards.
- Archboard is young and its interfaces change often. It is not on npm.

## Brand Commitments

The name is archboard. The CLI writes it in lowercase. The wordmark sets it in
the display face's tracked capitals, and its text stays archboard. Prose writes
Archboard at the start of a sentence and as the product's name.

The voice is plain English, and this is binding for UI copy and docs. Sentences
are short and literal. Copy names what happened and what the reader can do
next. It states facts and shows the evidence for them, with no hype words and
no marketing tone. The README is the model: "Filmed live against a real
Archboard server. Nothing here was dragged into place."

## Evidence on Hand

- `docs/readme/`: the README's SVGs drawn by `archboard semantic render`, its
  index thumbnails, and its banner, which sets the logo beside a proposal that
  `archboard semantic render` drew.
- The README's clips, filmed from a running Archboard server, and three
  narrated videos, attached on GitHub and linked from the README.
  `bun run readme:assets` makes all of them (`docs/agents/readme-assets.md`).
- `examples/web-shop`: the example vault with history, proposals, drill-down
  and walkthroughs.
- `.archboard/vault`: Archboard's own 15 boards, with real adoption history.
- `docs/design/assets/`: the shell reference image and rendered captures of the
  shell.
- `docs/assets/`: the social card, cut from the banner.
- The README's comparison tables with Mermaid, D2, Excalidraw, draw.io,
  Structurizr, LikeC4, PR Lens and Archify, dated September 2026.

There are no customers, testimonials, usage numbers, prices or hosted service
on record. Archboard has no telemetry source for health, latency or error
rates. Future work must not invent any of these.

## Product Principles

1. Understanding first. Every surface helps an architect understand the system
   on screen, because a plan depends on it. When understanding and planning
   compete for space or attention, understanding wins.
2. Meaning, not placement. Agents state meaning and the renderer draws it. A
   wrong picture is fixed in the meaning or in the renderer.
3. Only real state. Every number, mark, state and preview shows what the
   product actually has. A board for something nobody built says `not built`,
   and history stays what was true then.
4. Agents in plain sight. Where a board is read, the reader sees which agent
   holds it, why, and what it is doing, with one control to take it back.

## Accessibility & Inclusion

WCAG 2.2 AA is the required standard for every surface, except for contrast:

- every action reachable and operable from the keyboard
- the reduced-motion preference honored by every animation, including traffic
  and camera glides
- an accessible name and state for every mark that carries meaning, such as a
  variant's lifecycle or a board's level

The contrast of text and of marks is judged with APCA (the Accessible
Perceptual Contrast Algorithm), not with the WCAG 2 contrast ratio. The owner
decided this on 2026-10-07: the WCAG 2 ratio made colors dark and dull where
they read well. The levels are APCA's Bronze levels, in Lc, for a size at
100 %:

- Lc 75 for body text: the words a reader reads first, such as a card's name
- Lc 60 for other content text and for large or bold text, such as a card's
  description or a group's caption
- Lc 45 as the aim for a mark that carries meaning, such as a line, a corner,
  a pin or the parts of a control, and Lc 30 as its floor

The standard applies at the supported desktop size. Screens smaller than 1080p
and extreme zoom, such as 400%, are out of scope. Thus success criterion 1.4.10
Reflow does not apply.
