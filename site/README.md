# The Archboard site

This folder holds the marketing site of Archboard. It is a static [Astro](https://astro.build)
site. GitHub Pages publishes it at <https://miklschmidt.github.io/archboard/>.

The site is a separate project with its own `package.json` and `bun.lock`. The root workspaces,
lint and tests do not read it, but the root format check does. `bun run build` here
type-checks it with `astro check`.

## Work on the site

Run these commands in this folder:

```sh
bun install
bun run dev
```

Open <http://localhost:4321/archboard/>. When you save a file, the page reloads.

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
- The fonts come from `packages/renderer/assets/fonts/`, the same files the renderer uses.
- The social card is `docs/assets/archboard-social-card.jpg`.

The counts in Measures and Changes together are real rows of Archboard's own model, read on
2026-11-04. They are in `src/lib/measures.ts`.

## Draw the diagrams again

If a renderer change alters how a drawing looks, draw the site's drawings again and commit
them. The site build does not render, because rendering needs the full Archboard build. Run
this command from a built checkout, inside `nix develop`:

```sh
bun run render
```

The script starts a private Archboard server with its own port and state. It reads a copy of
the example shop, so it changes no registered repository.

## Deploy

`.github/workflows/site.yml` builds the site on each pull request that changes the site, the
README drawings, the social card or the fonts. A push to `main` with such a change deploys it.
You can also start the workflow by hand from the Actions tab.

GitHub Pages must use GitHub Actions as its source. To set it, open the repository settings,
then Pages, then set Source to GitHub Actions. Do this once.

The site is built for the path `/archboard`. To build it for another host or path, set
`SITE_ORIGIN` and `SITE_BASE`:

```sh
SITE_ORIGIN=https://example.com SITE_BASE=/ bun run build
```
