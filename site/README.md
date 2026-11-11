# The Archboard site

This folder holds the marketing site of Archboard. It is a static [Astro](https://astro.build)
site. It is published at <https://usearchboard.dev/>.

The site is a separate project with its own `package.json` and `bun.lock`. The root workspaces,
lint and tests do not read it, but the root format check does. `bun run build` here
type-checks it with `astro check`.

## Work on the site

The hero, the window under it and the section about Archboard's own model use the product's
painter. The painter and
its paintings must come from one build of the renderer core. Make both from the repository root,
inside `nix develop`:

```sh
bun install
bun run build:core
bun site/scripts/paint.ts
```

Run `bun site/scripts/paint.ts` again after a change to the renderer core, to `site/model`, to
`examples/web-shop` or to `.archboard/vault`. The paintings go to `src/paintings/`, which Git
ignores.

Then run these commands in this folder:

```sh
bun install
bun run dev
```

Open <http://localhost:4321/>. When you save a file, the page reloads.

To see the production build, run:

```sh
bun run build
bun run preview
```

## Where the content comes from

Every diagram on the page is real output of the Archboard renderer, in the dark theme.

- The example shop, its sequence diagram and Archboard's own architecture come from
  `docs/readme/`, which the README also uses.
- The other drawings are in `src/diagrams/`. `bun run render` draws them again from
  `examples/web-shop`.
- The hero draws `site/model`, a small model made for the site. It shows how an agent states a
  system through the CLI and how Archboard draws it for the people who read it. `scripts/paint.ts`
  renders it with every container open, in flat relief, and records where each card, tray, label
  and route lies beside the painting. The painting has no lines, because the hero draws each line
  itself.
- The hero's code is in `src/scripts/hero/`. The product's painter, imported from
  `packages/renderer/src/ui/clients/painter.ts`, paints the picture once on the CPU into still
  images. One WebGL shader then does everything that moves: it lays the images on a table in
  perspective, raises each card as a tile and sinks each tray. It draws each line as a laser that
  floats above the line's real route, with the line's label on a plate. The light that draws the
  lasers reaches each card by the quickest route from the agents, so the entry has no hand-placed
  timing.
- The window under the hero paints `examples/web-shop` live, as the README draws it. When the
  agent's edit lands, the painter brings the picture in with the app's own entrance. The README's
  SVG of the same picture stands in without script, with reduced motion, or where the painter does
  not start.
- The section about Archboard's own model paints the top reading of `.archboard/vault` live, with
  the renderer's legend under it. The whole picture fits the screen, and the painter brings it in
  with the app's own entrance once the figure's foot is in view. The renderer's SVG of the same
  reading stands in without script or where no painter draws. The caption links to that SVG at
  full size, so readers can inspect the diagram and legend on a narrow screen.
- The fonts come from `packages/renderer/assets/fonts/`, the same files the renderer uses.
- The voice orb is the product's own code, imported from `packages/workbench/src/ui/workbench-client/orb/clients/`
  and `packages/workbench/src/ui/workbench-client/orb/rules/`. The site points `@archboard/timing` at
  `packages/timing` in `astro.config.mjs` and `tsconfig.json`, because it does not install the
  repository's workspaces.
- The social card is `docs/assets/archboard-social-card.jpg`.

The counts in Measures and Changes together are real rows of Archboard's own model, read on
2026-11-04. They are in `src/lib/measures.ts`.

## Change the hero's model

`site/model` is a canonical model in a flat folder, so the CLI does not find it in this checkout.
To read or change it, copy it into a scratch holder outside the checkout and use a private
server, as `scripts/render-diagrams.sh` does. Run these commands from the repository root, with
a free port in `ARCHBOARD_URL`:

```sh
work=$(mktemp -d)
mkdir -p "$work/holder/.archboard"
cp -r site/model "$work/holder/.archboard/vault"
git init -q "$work/holder"
export ARCHBOARD_URL="http://127.0.0.1:4390" ARCHBOARD_REPOS="$work/repos.json"
export ARCHBOARD_NO_AUTOSTART=1 XDG_STATE_HOME="$work/state"
bin/archboard repo add "$work/holder"
bin/archboard start
bin/archboard -C "$work/holder" model read
```

Change it with `model claim` and `model edit`, as the [archboard skill](../skills/archboard/SKILL.md)
describes. The holder uses its Git repository for signed history. `model archive-init` applies only
to vaults outside Git repositories. Copy the vault's files back into `site/model`.
Run `bin/archboard stop`, then paint the hero again.

## Audit the site

The site shows real renderer output, and it mocks the shell in `src/components/window/` and in
the demos in `src/components/demos/`. Nothing tests that the mocks still look like the shell, or
that an overlay still lies on its drawing. If you change the renderer or the shell, audit the site:

1. Paint the pictures and draw the diagrams again, as the sections above and below say.
2. Run the site and the app on `examples/web-shop`, with `bunx agent-browser`.
3. Go through every section of the site. Play each demo through to its end, and take a
   screenshot of each state.
4. Compare each mock with the same view of the running app, and with
   [the shell's design](../DESIGN.md). Make each mock show the controls, the labels and the
   layout that the shell shows now.
5. Make sure that each highlight, ring and label over a drawing lies on the thing it marks.
6. Commit the fixes and the new drawings with your change.

## Draw the diagrams again

If a renderer change alters how a drawing looks, draw the site's drawings again and commit
them. The site build does not render, because rendering needs the full Archboard build.
From the repository root, prepare the renderer:

```sh
nix develop
bun install
bun run build
cd site
```

Then draw the site diagrams:

```sh
bun run render
```

The script starts a private Archboard server with its own port and repository registry.
On Linux, `XDG_STATE_HOME` also isolates its runtime state. macOS uses the shared Archboard
state directory. The script reads a copy of the example shop, so it changes no registered
repository. It stops the server before it removes temporary files. If the server fails to
stop, the script keeps those files and prints a command to retry the stop.

## Deploy

`.github/workflows/site.yml` builds the site on each pull request that changes the site, the
README drawings, the social card, the fonts, the voice orb's code, the renderer core, the example
shop or Archboard's own model. It builds the core and paints the site's pictures inside
`nix develop` first. A push to `main` with such a change deploys it.
You can also start the workflow by hand from the Actions tab.

The deploy runs `wrangler deploy` with `site/wrangler.jsonc`. It uploads `dist/` to the
Cloudflare Worker `archboard-site`, which serves the files at <https://usearchboard.dev/> and runs
no code. The deploy job runs in the `site` environment, which only `main` can use. That
environment holds the secret `CLOUDFLARE_API_TOKEN` and the variable `CLOUDFLARE_ACCOUNT_ID`. The
token can deploy this one Worker and nothing else. Because such a token cannot create a Worker or
attach a domain, the owner created the Worker and gave it the custom domain once, in the
Cloudflare dashboard.

To build and attach the docs of a release again, for example after a change to the build, start
the workflow by hand on `main` and enter the release tag, such as `v0.3.0`.

The site is built for the root of `https://usearchboard.dev`. To build it for another host or
path, set `SITE_ORIGIN` and `SITE_BASE`:

```sh
SITE_ORIGIN=https://example.com SITE_BASE=/archboard bun run build
```
