# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are software and cloud architects who work with a coding
agent (Claude Code or Codex). They find archboard on GitHub and run it from a
clone on Linux or macOS. They read it in a desktop browser.

The agent reads code and authors the canonical model through the CLI.
The architect explores modules, selects subjects, asks questions, compares proposals, and presents walkthroughs.
A session can continue for hours across several readings of the same model.

The people who receive what the architect makes are a second audience. A
pull-request reviewer watches a narrated walkthrough video. A newcomer plays
back a tour of a system. A reader of a design doc or an ADR sees a rendered
diagram.

## Product Purpose

Archboard is an architecture planning tool. The coding agent states what a
system is: its parts, what contains what, how the parts talk, and in what
order. The renderer draws every line.

The main job is to understand a system. The architect opens root modules and
recursively explores their immediate parts. They open the code
and ask the agent about a part. Understanding comes first because the second
job depends on it.

The second job is to plan a change. A proposal is drawn against the
architecture that exists, and competing options sit side by side. The option
that ships is adopted with the reason for it. The state it replaces stays as
history.

Success means this: an architect understands a system that they did not draw,
from its model alone. Then they plan a change against it and trust that the
picture says what the code is.

## Positioning

Nobody places a box. The agent states meaning and the renderer draws it, so a
renderer improvement redraws every reading, including retained history.

Each vault holds one canonical model.
A module has one definition and owns its outgoing relationships.
Independent flows describe ordered behavior across modules.
Active proposals store changes against retained baselines.
The independent Git archive preserves completed states and decisions without copying them into current files.

An agent updates architecture in the same task as the code that changes its meaning.
Subject claims and complete revision guards protect concurrent work.
Explicit adoption records implemented architecture.
A source merge or approval never adopts a proposal.

## Operating Context

- The agent authors through `archboard model` commands.
  The architect uses browser panes served on `127.0.0.1` without application authentication.
  Rendering, repository access, and agent execution remain local or on the client.
- The vault is a checkout's `.archboard/vault` directory.
  A manifest identifies the model.
  Module, flow, active proposal, and walkthrough files contain authored meaning.
  The combined graph and readings are derived.
  Current architecture files normally share a source pull request with their implementing code.
- The CLI finds the vault from its working directory or `-C <dir>`.
  Every server request names its vault explicitly.
  The server starts without one and can serve multiple repositories.
  The first command in an unknown checkout registers it and reports that registration.
  [INSTALL.md](INSTALL.md) defines setup and discovery.
- New vaults start as canonical planning models without implemented current architecture.
  Unmigrated vaults receive `LEGACY_AUTHORITY` and an explicit migration route.
  Mapping, preview, and owner-authorized installation preserve exact originals before cutover.
  Legacy decoding supports migration and exact retained history.
- The shell provides a repository navigator, up to two panes, and a conversation dock.
  Repository rows select the chosen checkout for that repository.
  Each pane can show another scope, state, or repository.
  Human activation selects the shown workhorse conversation.
  Agent navigation never changes that conversation.
- Code bindings open local source or a repository's GitHub location.
  SVG, PNG, and narrated video carry architecture outside the application.
  Shared history requires explicit archive publication, independently of a source push.
- Archboard describes itself in `.archboard/vault`.
  Architecture changes use proposals through the same public interface that consumers use.
  Each linked Archboard worktree uses its own source and server port.
  The main checkout keeps port 3000.

## Capabilities and Constraints

[CONTEXT.md](CONTEXT.md) defines the terms that product copy uses.
A reading is a selection of architecture to draw.
It contains no duplicate definitions.

Shipped capabilities include:

- Recursive module exploration with breadcrumbs and browser history.
- Selection, focus, visible filters, and inspection of aggregated connections.
- Architecture, sequence, and flowchart readings, with explicit authored flows for behavior.
- Compact proposals, comparison, reconciliation, adoption, shelving, and audited historical correction.
- Exact checkpoints, explicit archive publication and fetch, and portable model export and import.
- Dynamic walkthroughs, local Codex narration, and retained recording replay.
- Local explanation actions that preserve the reading captured when the request starts.
- Subject claims, writer intent, human take-back, and durable recovery.
- Code bindings, source evidence, groups, traffic, and reproducible SVG and PNG exports.

Every surface keeps these constraints:

- Agents author architecture. The browser reads it and owns presentation.
  A human can revoke an agent's claim.
  Cross-model ownership transfer is unavailable.
- The renderer owns geometry.
  Correct saved meaning with incorrect placement requires a renderer repair.
- The shell targets desktop use at 1920×1080.
  Phone and narrow layouts remain outside scope.
- Codex supplies conversation, voice, narration, and recording through the private app-server sign-in.
  Any agent that runs a CLI can author architecture.
- Git identity and configured signing remain in force for archive operations.
  Missing architecture or source evidence receives explicit recovery guidance.
- Archboard runs from a clone and is not published on npm.
  Hosted storage and account services remain deferred.

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

- `docs/readme/`: checked-in diagrams, index thumbnails, and the banner.
  New exports use `archboard model render` and canonical reading selectors.
- The README's clips, filmed from a running Archboard server, and three
  narrated videos, attached on GitHub and linked from the README.
  `bun run readme:assets` makes all of them (`docs/agents/readme-assets.md`).
- `examples/web-shop`: the example vault with history, proposals, drill-down
  and walkthroughs.
- `.archboard/vault`: Archboard's architecture inputs.
  Exact legacy originals remain available through retained migration history.
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
   product actually has. Unbuilt architecture stays proposed,
   and retained history states its actual coverage.
4. Agents in plain sight. Claims show the agent, its purpose, and affected subjects.
   A human can take back a claim.

## Accessibility & Inclusion

WCAG 2.2 AA is the required standard for every surface, except for contrast:

- every action reachable and operable from the keyboard
- the reduced-motion preference honored by every animation, including traffic
  and camera glides
- an accessible name and state for every mark that carries meaning, such as a
  proposal's lifecycle or a reading's active filters

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
