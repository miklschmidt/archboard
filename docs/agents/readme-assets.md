# The README's assets

Every file in `docs/readme` comes from one command, `bun run readme:assets`.
The manifest `docs/readme/assets.json` lists each asset: its files, the command
that makes it, whether it needs a Codex sign-in, the sources it shows, and a
hash of those sources. The kit that makes them is `scripts/readme-assets`. The
animated clips and the narrated videos are too large for the
repository. The kit writes them to the scratch directory, and you attach them
to the README (see Attached assets below).

## Check and refresh

```bash
bun run readme:check                      # list the stale assets; exit 1 when any is stale
bun run readme:assets --dry-run           # print what a run would do; start nothing
bun run readme:assets                     # make every asset that needs no Codex sign-in
bun run readme:assets hero plan           # make the named assets, Codex ones included
bun run readme:assets code-evidence module-interfaces git-history # make the code and history demonstrations
bun run readme:assets --codex             # make every asset
bun run readme:assets --replay            # render the narrated videos again from their kept talks
```

An asset is stale when the kit never made it, when its sources changed since
it was made, or when one of its files is missing. The `architecture` SVGs are
the exception: `archboard check` owns their staleness (see Tracked embeds
below), so their manifest sources are only the kit code that draws them. The hash covers the content
of every file the asset's sources name, tracked or new, except files under a
`tests` directory and Markdown files. `readme:check` also reports a source that names no file and
a file in `docs/readme` that no asset makes. It is not part of `bun run check`:
a stale README is listed, and it does not fail the gate.

Refresh an asset when `readme:check` lists it after your change. Then:

1. Look at every file it wrote. A clip that films the wrong thing still gets a
   new hash.
2. Read the README text around it. Change an alt text or a caption that no
   longer says what the picture shows.
3. Attach every file that the kit says to attach, and put the new address in
   `README.md` in place of the old one.
4. Commit the files in `docs/readme` with `docs/readme/assets.json`, which now
   holds their hash.

## The assets

| Asset                                                | What makes it                                                                                                                  | Codex |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `architecture`, `sequence`, `web-shop`               | `semantic render` in light and dark, faces cut to the characters drawn; two add a thumbnail; `architecture` is a tracked embed | no    |
| `hero`, `plan`, `history`, `drill-down`, `take-back` | the real shell filmed in headless Chromium while the CLI writes, encoded to a WebP to attach                                   | no    |
| `code-evidence`, `module-interfaces`, `git-history`  | the real shell and CLI results from a generated checkout, encoded to a WebP with an index still                                | no    |
| `ask`                                                | the shell filmed while a Codex agent answers a question typed into the conversation                                            | yes   |
| `explainer`, `pr-walkthrough`, `newcomer`            | `semantic record`, narrated by the Codex voice; the MP4 is attached                                                            | yes   |
| `banner`                                             | `semantic render` of a web-shop proposal, laid as vector beside the lockup in Chromium                                         | no    |

Most assets also write an index thumbnail (`idx-*.webp`), which stays in the
repository. The manifest lists the files of each asset in the repository. The
clips and the MP4s are not in it. `explainer` and `hero` write nothing
in the repository.

The filmed clips are lossless animated WebP at 30 frames a second. GitHub
refuses an attached image over 10 MB (HTTP 422), so a clip must stay under it:
a clip that grows needs a narrower width or a shorter cut. A README section that has a narrated video does not also keep
a loop of it. An animated WebP stores each frame as the rectangle that changed, and a
lossy encoder counts a pixel that moved by a few levels as unchanged. A fading shadow or the glow of a pulse then leaves a ghost, in
blocks, for the rest of the clip (the sidebar of `drill-down` did). ffmpeg
offers no keyframe interval for it, so a lossy clip cannot be repaired. Check a
new clip by brightening an empty part of the canvas in a frame (`magick
clip.webp -coalesce -delete 0-99 -delete 1--1 -level 94%,100% frame.png`): it must be flat.

The banner's lockup, the mark beside the name, comes from
`scripts/readme-assets/lockup.ts`. A test in the repository lane holds that mark
to the one the shell draws in `apps/web/src/ui/components/shell/Brand.tsx`. The banner
also writes `docs/assets/archboard-social-card.jpg`, GitHub's social preview, cut
from the dark banner. GitHub does not read it from the repository: the owner
uploads it by hand under Social preview in the repository's settings.

The clips are filmed over fresh copies of the tracked files of
`examples/web-shop` or `.archboard/vault`, never over a vault from elsewhere.
Only the tracked embeds are drawn over `.archboard/vault` in place.
The kit runs the `bin/archboard` of the checkout that it is in, and it starts
each server on a free port of its own. So in a worktree, it films the
worktree's source. It never uses the server that `archboard` reaches: port
3000 in the main checkout, or the worktree's own port.
The hero's change is `scripts/readme-assets/hero-change.json`, written as an
agent writes one.

The three code and history demonstrations add a small checkout example to their
copied vault. `scripts/readme-assets/evidence-fixture.ts` holds its source and fixed
Git history. The harness creates the source repository under the take's scratch
directory. It registers that repository and authors the board through the CLI.
It leaves Archboard's source files and tracked vault unchanged.

`code-evidence` runs `archboard check code` and selects its resolved missing-call
warning in the browser. Its terminal shows the source lines behind the finding.
`module-interfaces` opens two proposals and selects Orders in each. Their
inspectors show three entry points versus one entry point and two hidden parts.
`git-history` shows recent commits and two parts that change together. It then
compares the branch with a proposal through `semantic footprint`.

Each take uses real command answers and the live browser. The terminal summarizes
those answers. The sample code and commits are synthetic. Each scene stops if
the feature no longer produces the result that it demonstrates. Screenshots of
the key moments stay under `takes/<asset>` in the scratch directory for inspection.

## Tracked embeds

The `architecture` SVGs are tracked embeds (ADR 0057). The kit draws the
`Archboard` board from `.archboard/vault` in place, on a server of its own,
with `semantic render --track`, straight into `docs/readme`. The board lists
both files, and each file keeps its render recipe. `archboard check` in this
repository reads that recipe, draws the board again, and warns
`EMBED_OUTDATED` when the board changed what the picture shows. The first run
on a board writes the list and raises its version, so commit
`.archboard/vault` with the files.

The kit then cuts the faces of each file down to the characters it draws.
That cut keeps the recipe, and the recipe's picture digest is of the drawing
before the recipe went in and before the cut, so a cut file still compares.
`archboard check --fix` draws an outdated file again from its recipe, as the
full render with whole faces. Run `bun run readme:assets architecture` after
it to cut the faces again.

The `sequence` and `web-shop` SVGs are drawn from a copy of
`examples/web-shop`. That example is no vault in place: inside a Git checkout
only `<root>/.archboard/vault` is a vault, and a recipe names its vault only by
the repository identity. No check can find their board, so the kit leaves
their recipe out, and the manifest's source hash says when they are stale.

## What needs Codex, and what it spends

A Codex asset runs only when you name it or pass `--codex`, because it spends
the account's Codex usage.

- `ask`, `explainer`, `pr-walkthrough` and `newcomer` run on a server that uses
  the machine's Archboard Codex sign-in. If Codex is not signed in, they stop
  before anything is spent. Sign in from the agent dock of any Archboard server.
- A recording keeps its talk (the board, the steps, the words and the voice)
  in the scratch directory. When only the renderer changed, the walkthrough and
  the voice did not, so `--replay` renders the kept talk again with
  `semantic replay`, cuts the thumbnail from it, and spends no
  Codex usage. It stops when no recording kept a talk. Record again only when
  the walkthrough or the voice should change. A replay records the hash of all
  the sources, so `readme:check` cannot tell that the board or the walkthrough
  changed after the talk was recorded: check that yourself before you replay.
- GitHub plays a video with sound only from an attachment, so the narrated
  MP4s are attached like the clips (see below).

## Attached assets

After it makes an asset, the kit prints one line for each file to attach: the
clips and the narrated MP4s. They are in `attachments` and
`narrated` in the scratch directory. Run `gh attach <file>` (the
`joseustra/gh-attach` extension, which uploads to the current repository) on
each, and put the address it prints in `README.md`: as the `src` of the clip's
`<img>`, or as the address of the video. An attachment is public once it is
uploaded, so look at the file first. GitHub refuses an image over 10 MB, and
the kit says so in place of the line to attach it. Make such a clip narrower or
shorter.

## What the kit needs

Run `bun install` first. The kit builds the frontend itself before it films.

| Variable                      | What it names                        | When it is not set                                           |
| ----------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `ARCHBOARD_README_SCRATCH`    | where takes, frames and copies go    | `archboard-readme-assets` in the system temporary directory  |
| `ARCHBOARD_RENDERER_CHROMIUM` | the Chromium the takes are filmed in | Chromium or Google Chrome on `PATH`                          |
| `ARCHBOARD_FFMPEG`            | an ffmpeg with libwebp and libx264   | ffmpeg on `PATH`, else `nixpkgs#ffmpeg-headless` through Nix |
| `ARCHBOARD_PYFTSUBSET`        | fontTools' `pyftsubset`              | `pyftsubset` on `PATH`, else nixpkgs' fonttools through Nix  |

A clip is filmed in real time: Chromium sends a frame each time the page
repaints. A busy machine drops frames, and the clip stutters. Run clips on a
quiet machine. The command makes one asset at a time.

## Adding an asset

Add a producer to `scripts/readme-assets/assets.ts` and an entry to the
manifest with `"hash": null`. The kit refuses to run, and the repository lane's
test fails, while the two disagree about an asset's kind, Codex need or files.
