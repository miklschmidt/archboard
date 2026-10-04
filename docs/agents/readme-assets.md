# The README's assets

Every file in `docs/readme` comes from one command, `bun run readme:assets`.
The manifest `docs/readme/assets.json` lists each asset: its files, the command
that makes it, whether it needs a Codex sign-in, the sources it shows, and a
hash of those sources. The kit that makes them is `scripts/readme-assets`.

## Check and refresh

```bash
bun run readme:check                      # list the stale assets; exit 1 when any is stale
bun run readme:assets --dry-run           # print what a run would do; start nothing
bun run readme:assets                     # make every asset that needs no Codex sign-in
bun run readme:assets hero plan           # make the named assets, Codex ones included
bun run readme:assets --codex             # make every asset
```

An asset is stale when the kit never made it, when its sources changed since
it was made, or when one of its files is missing. The hash covers the content
of every file the asset's sources name, tracked or new, except files under a
`tests` directory. `readme:check` also reports a source that names no file and
a file in `docs/readme` that no asset makes. It is not part of `bun run check`:
a stale README is listed, and it does not fail the gate.

Refresh an asset when `readme:check` lists it after your change. Then:

1. Look at every file it wrote. A clip that films the wrong thing still gets a
   new hash.
2. Read the README text around it. Change an alt text or a caption that no
   longer says what the picture shows.
3. Commit the files with `docs/readme/assets.json`, which now holds their hash.

## The assets

| Asset                                                | What makes it                                                                               | Codex |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----- |
| `architecture`, `sequence`, `web-shop`               | `semantic render` in light and dark, faces cut to the characters drawn; two add a thumbnail | no    |
| `hero`, `plan`, `history`, `drill-down`, `take-back` | the real shell filmed in headless Chromium while the CLI writes, encoded to WebP            | no    |
| `ask`                                                | the shell filmed while a Codex agent answers a question in the agent dock                   | yes   |
| `explainer`, `pr-walkthrough`, `newcomer`            | `semantic record`, narrated by the Codex voice; the loop and thumbnail are cut from it      | yes   |
| `banner`                                             | Codex image generation, with the wordmark laid over it                                      | yes   |

Each clip writes its index thumbnail (`idx-*.webp`) too. `explainer` writes
nothing in the repository.

The clips are filmed over fresh copies of the tracked files of
`examples/web-shop` or `.archboard/vault`, never over a vault from elsewhere.
The hero's change is `scripts/readme-assets/hero-change.json`, written as an
agent writes one.

## What needs Codex, and what it spends

A Codex asset runs only when you name it or pass `--codex`, because it spends
the account's Codex usage.

- `ask`, `explainer`, `pr-walkthrough` and `newcomer` run on a server that uses
  the machine's Archboard Codex sign-in. If Codex is not signed in, they stop
  before anything is spent. Sign in from the agent dock of any Archboard server.
- The narrated MP4s stay in the scratch directory. GitHub plays a video with
  sound only from an attachment, so upload each MP4 through GitHub's editor and
  put its new address in `README.md` by hand.
- `banner` runs `codex exec` with the image tool, with your own Codex CLI
  sign-in (`CODEX_HOME`, by default `~/.codex`). Its prompts are kept outside
  the repository: `ARCHBOARD_README_BANNER_PROMPTS` names a directory that holds
  `dark.txt` and `light.txt`. The light prompt edits the dark art. The art is
  not reproducible, so the PNGs in `docs/assets` are the canonical art.

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
