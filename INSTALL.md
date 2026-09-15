# Using archboard in another repository

Archboard is not a dependency of the repositories you diagram. They never build
it and never import it. You install archboard once on a machine and point it at
whatever repo you happen to be working in.

Setting a repo up does put two things in it, and only two: a block in its
`CLAUDE.md` or `AGENTS.md` saying where everything is, and, if you keep the
boards with the code, a vault directory.

If you are setting up the voice loop rather than the tool, read
[`TESTING.md`](TESTING.md) instead. This is the shorter, per-machine story.

## What actually has to be true

Five things. The first two are once per machine. The last three are once per
repo, and `archboard install-skill` does all three.

1. The archboard build exists somewhere on this machine.
2. An agent can find the CLI.
3. A vault exists, and `ARCHBOARD_VAULT` points at it before the canvas server
   starts. Without one the canvas refuses to start, because every board is a
   note and there would be nowhere to put one.
4. The agent has the skill that teaches it how to draw.
5. The repo itself says where 2 and 3 are, because nothing else will.

Number 5 is the one that used to get skipped. An agent arriving in a repo can
see the skill, so it knows archboard exists and knows the commands. It cannot
see which vault this machine uses, and it cannot see that `archboard` is not on
PATH here. Both of those live in the installing human's head unless the install
writes them down.

## 1. Set it up once

```bash
git clone <your fork> ~/Projects/archboard
cd ~/Projects/archboard
bun install                 # retry if it fails extracting a tarball
bun run build               # the UI and the server-owned renderer entry
```

The package is private and never published, so there is nothing to install from
npm. bun runs the server and CLI from `src/`. Run `bun run build` after each
pull because the built frontend also contains the server-owned renderer entry,
whose source lives under `src/server/board-rendering/` (ADR 0014). **bun has to
be on PATH**, including the PATH of anything that spawns archboard.

## 2. Put the CLI where an agent will find it

Out of the box the only entry point is `./bin/canvas` inside the checkout,
which is useless from another repo. Give it a name on your PATH:

```bash
ln -s ~/Projects/archboard/bin/canvas ~/.local/bin/archboard
```

`bin/canvas` resolves its own location, so the symlink works from any working
directory and always runs the current source. Every example in the skill says
`archboard`, so this is the name to use.

Skipping this is survivable. `install-skill` checks whether an `archboard` on
PATH really points at this build, and when it does not it writes the absolute
path into the repo instead, so the next agent still has something that runs.
The name is nicer, and the skill's examples match it.

## 3. Set up the repo

From inside the repository you want to diagram:

```bash
cd ~/Projects/payments-api
archboard install-skill
```

That does four things:

- copies the skill into `~/.agents/skills`, the user-level skill root shared by
  Codex across repositories (`--agent claude-code` or its `--target claude`
  shortcut uses `~/.claude/skills` instead; `--dir <path>` names any other
  skills root)
- asks where this repo's boards should live, offering `<repo>/.archboard/vault`
- creates that directory, so the first board command has somewhere to write
- writes a block into the repo's `CLAUDE.md`, or its `AGENTS.md` when there is
  no `CLAUDE.md`, recording the vault path, the exact command that runs the CLI
  on this machine, and a section for the boards that cover this repo

The block sits between `<!-- archboard:begin -->` and `<!-- archboard:end -->`.
Re-running replaces it in place, so upgrading the skill later never leaves two
of them. Prose outside the markers is untouched. Notes written inside them are
not, so keep your own words outside.

If the repo has neither file, one is created: `AGENTS.md` for the default or a
custom `--dir`, and `CLAUDE.md` for the Claude destination. Never both. A repo
with two agent docs is a repo where one of them is out of date.

Nothing prompts when stdin is not a terminal, which is the case whenever an
agent runs the command. It takes the offered vault and prints what it chose.

| Flag                  | For                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------- |
| `--agent codex`       | explicitly select Codex using the skills.sh agent name; installs in the shared default |
| `--agent claude-code` | select Claude Code using the skills.sh agent name; installs in `~/.claude/skills`      |
| `--target claude`     | shortcut for `--agent claude-code`                                                     |
| `--dir <skills-root>` | install into another explicit project or user skills root                              |
| `--vault <path>`      | name the vault instead of being asked                                                  |
| `--yes`               | take the offered vault without being asked                                             |
| `--repo <dir>`        | set up a repo other than the one you are standing in                                   |
| `--doc <file>`        | write the block somewhere other than the repo root                                     |
| `--no-doc`            | install the skill and touch nothing in the repo                                        |

On the machine archboard was developed on, `~/.agents/skills/archboard`
is a symlink into the checkout, so the skill tracks the build and cannot go
stale. `install-skill` refuses to replace a symlink, which is what you want
there. Running it inside the archboard checkout writes no block either, because
that repo's `CLAUDE.md` is authored rather than generated.

## 4. Where the vault goes

A board is one `.semantic.json` document in a vault, holding every variant of
that architecture. The offered answer is a vault inside the repo, at
`<repo>/.archboard/vault`: boards next to the code they describe, and reviewable
in the same diff as the change they justify — a board is JSON a person can read
and a reviewer can diff, which is most of why it is a file rather than a
database. It is not gitignored for you. Commit it or ignore it, deliberately.

Take a shared vault instead when the diagrams span repositories, which is what
an architecture diagram does as soon as there is more than one service in it.
Point every repo at the same path:

```bash
archboard install-skill --vault ~/vaults/architecture
```

An `ARCHBOARD_VAULT` already exported in your shell counts as having answered:
it becomes the offer, in place of the local path.

Either way, **the server does the vault I/O, so the variable has to be set
before the canvas server starts.** With no vault the canvas will not start at
all, and says so, pointing back at this command. Exporting it afterwards
changes nothing, because a server that is already running keeps the vault it
started with. `archboard status` prints the vault in use, and
`archboard stop` is how you switch. That is the one that bites when you move
between two repos that each keep their own boards.

The consumer defines vocabulary and presentation in
`<vault>/.archboard/config.yaml`. Keep this file under version control with the
boards. For example:

```yaml
levels: [system, service, module]
nodeKinds:
  azure: { name: Azure, icon: RiCloudLine, color: blue }
  kubernetes: { name: Kubernetes, icon: RiShip2Line, color: green }
  api: { name: API, icon: RiServerLine, color: violet }
relationshipKinds:
  http: { name: HTTP, color: cyan, dash: solid, arrowhead: filled }
  event: { name: Event, color: amber, dash: dashed, arrowhead: open }
groups:
  fulfillment: { name: Fulfillment }
  billing: { name: Billing }
```

Every board must declare a `level`. Nodes and edges reference the configured
kind keys. `groups` is optional and empty by default: each key is a stable id a
node may list in its `groups` array, and the name is what readers see. A node may
belong to several groups across different containers; nothing is inherited from a
parent, and renaming a group changes no board. Inspect one group with
`archboard semantic inspect <board> --group <id>` or from the group control in a
pane's reading strip. Icons use Remix Icon React export names, such as `RiServerLine`.
Browse the [Remix Icon catalog](https://remixicon.com/) visually, or search the
[complete export-name list for the installed version](https://unpkg.com/@remixicon/react@4.9.0/index.d.ts)
as plain text — agents can search its `declare const Ri...` entries directly.
Use the React export name in `icon`, not the catalog's kebab-case name
(`server-line` becomes `RiServerLine`).

Colors reference the curated palette:
red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo,
violet, purple, fuchsia, pink and rose. Omit `color` for neutral type styling.
The bundled defaults colour every node kind except `external` and `other`, and
the `http`, `rpc`, `event`, `queue`, `data` and `render` relationship kinds, so a
fresh vault is not gray; a consumer's own `config.yaml` replaces them.
Relationship `dash` is solid, dashed or dotted; `arrowhead` is filled, open or none.

Run `archboard semantic config` to discover the interpreted policy and
`archboard semantic config --schema` to generate its editor validation schema.
Run `archboard check` to check configuration and every board family in the vault.
Missing required board metadata is always an error. Valid configuration rejects
new unknown references; references to removed definitions remain readable with
warnings. Missing or invalid YAML activates coherent bundled defaults and warns,
while permitting structurally valid edits. Fix the configuration to restore
vocabulary validation and configured appearance.

Saving configuration restyles every variant and open pane without changing board
content. A container establishes the body color for its contents; a nearer colored
container wins, and an uncolored container passes its enclosing color through.
Each node's icon chip independently shows its type. A collapsed Kubernetes card
inside Azure therefore has an Azure-blue body and Kubernetes-green chip; expanded
Kubernetes establishes green for itself and its children.

The browser legend explains these channels and can be hidden. The diagnostics
bell opens the same checker findings and offers **Fix with Codex** through the
pane's workhorse. Findings clear only when a subsequent check confirms the repair.
Exported diagrams have no legend. Explicit edge `traffic: {}` enables illustrative
motion with defaults of 40 diagram units per second and 0.5 dots per second;
optional `speed` and `volume` must be positive finite values. Omit `traffic` to
disable it. Emphasis affects line weight only.

## Working in a repo

Start the canvas from anywhere and state what the architecture is:

```bash
archboard semantic new payments --doing "drawing the payment path" < payments.json
archboard semantic show payments
archboard semantic render payments --out payments.svg
```

You state the parts, what contains what, how they are wired and the flows
between them; the renderer owns every coordinate, colour, font size and
connector route (ADR 0023). There is no way to move a box and deliberately
none — a layout somebody repaired by hand cannot be improved for every board at
once.

Those commands go through the server and need no browser. Open the canvas URL
and use `archboard browser ...` only when a person wants to read a board, or to
put a proposal beside what it proposes to change:

```bash
archboard browser show payments@<variant> --pane right
```

**Name the repository and use a repo-relative path.** Register each checkout
once, then the same portable address works wherever the command is run:

```bash
archboard repo add /path/to/payments-api
```

A node states its binding as part of what it is:

```json
{
	"name": "Orders",
	"kind": "service",
	"binding": { "repo": "github.com/acme/payments-api", "path": "src/index.ts" }
}
```

The board stores the repository identity and a repo-relative path — never an
absolute path or a `file://` URL — so the same board opens the right file on
anybody's machine. What a person clicks is resolved later, from the binding and
this machine's checkout registry.

A bare relative path is resolved against the CLI's explicit working-directory
origin, and the result says which repository that produced. Protocol-neutral
application callers with no working directory must use a registered repository
identity plus a repo-relative path instead.

`--branch` and `--commit` override the revision metadata when you need to name
something git cannot tell you.

With a shared vault the boards do not belong to the repo and are not committed
to it. If you want a picture in the repo as well, render one:

```bash
archboard semantic render payments --out docs/architecture.svg
archboard semantic rasterize payments --out docs/architecture.png
```

`semantic render` writes the SVG with its fonts embedded. `semantic rasterize`
draws the same picture to a PNG in a private headless Chromium at native scale:
one bitmap pixel per diagram pixel, the whole diagram, whatever any display or
open pane is doing; `--scale 2` doubles it, and a bitmap past 16384 pixels on
a side is refused rather than shrunk. Both take the same `--variant`, `--view`
and `--theme` selectors. Rasterizing needs a Chromium or Google Chrome
executable (see [Rendering to a bitmap](#rendering-to-a-bitmap)).

The picture is derived, so commit it only where somebody reads the repo without
archboard; the board is the thing that is kept.

## Rendering to a bitmap

`archboard semantic rasterize <board> --out <file.png>` draws in a Chromium or
Google Chrome it starts itself: headless, on a private temporary profile, in
its own process group, stopped and removed before the command answers. Nothing
else in archboard needs a browser installed; `semantic render` writes SVG
without one. The executable is the first of `chromium`, `chromium-browser`,
`google-chrome` and `google-chrome-stable` on `PATH` (on macOS also the
standard `/Applications` bundles); set `ARCHBOARD_RENDERER_CHROMIUM` to use
another. Without one the command refuses by name (exit 4) and writes nothing.

What the bitmap is:

- **Native scale by default.** One bitmap pixel per diagram pixel at `--scale
1`, independent of the display's pixel ratio, any device scale or any pane's
  camera. `--scale` takes 0.25 to 4; the bitmap is the diagram's page times the
  scale, rounded to whole pixels. The renderer states an integer page; a
  fractional one would round up so no edge is clipped.
- **The whole diagram.** The page is captured beyond any viewport, never fitted
  or cropped, with the renderer's own 20 px margin and opaque ground. A bitmap
  past 16384 px on a side or 80 million pixels is refused (exit 2) rather than
  tiled, shrunk or left as a wrong file.
- **Stable and complete.** Every embedded face is loaded before the shot, or
  the command fails rather than drawing a fallback font. Traffic animation is
  SMIL in the SVG; the capture pauses it at time zero, so moving marks sit at
  their first frame, and a still never proves motion.
- **Verified.** The PNG's header is checked against the size the diagram asks
  for before the file is written. The receipt states the file, bitmap width
  and height, scale, the diagram's page, the board, version, variant and
  view drawn, and the SHA-256 of the SVG document that was rasterized.

## On macOS

Archboard supports Linux and macOS. On macOS, machine-local state lives under
`~/Library/Application Support/excalidraw-canvas`, and logs go to
`~/Library/Logs/archboard.log`. Process ownership is verified through the native
macOS process API; Linux uses `/proc`.

The macOS browser child of `semantic rasterize` uses the native account home
for operating-system services while keeping its profile and temporary files
private, and a mock keychain so temporary browser launches do not open macOS
keychain dialogs. A managed Chrome installation can enforce becoming the
default browser even for temporary profiles. If it opens system prompts, use
Chrome for Testing and set `ARCHBOARD_RENDERER_CHROMIUM` to its executable.
This keeps the managed browser's policy and your default browser unchanged.

`bin/canvas` calls `realpath`, which modern macOS has but older versions do
not. If the symlink route above gives you `realpath: command not found`, either
`brew install coreutils` or run `bun /path/to/archboard/src/bin.ts` directly.

Board addresses are case-insensitive and Unicode-normalized on both platforms,
while note filenames preserve their original casing (ADR 0010). A legacy vault
containing names that differ only in case must have those collisions resolved;
`archboard semantic` on its own reports them.

## Finding boards

Use `archboard semantic` to discover boards in the configured vault and
`archboard semantic show <name>` to read a board. No manual repository-to-board
list is needed in the installed setup block.

### Optional live session

When a person asks to see that persisted board in a connected browser, show it
on an explicit pane:

```bash
archboard browser show payments --pane primary
```
