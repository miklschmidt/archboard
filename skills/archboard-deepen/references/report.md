# Write the report

The report shows the advisors, and later the owner, each deepening candidate at a glance.
The pictures carry it. Prose stays short and uses the skill's vocabulary and the repository's domain words: "the order intake module", not the name of a class.

## Where it lives

Make one directory per run outside the checkout: `${TMPDIR:-/tmp}/archboard-deepen-<timestamp>/`.
It holds `report.html`, the decision log `decisions.md`, and the rendered pictures.
Nothing of it lands in the repository.

## The page

Write one self-contained HTML file: inline CSS, each picture inlined as SVG, no script and no network request.
It reads in a light and a dark theme, and at phone width.
Draw every picture with `archboard model render --theme auto`. Never draw a module graph by hand or in Mermaid, because only a render matches the model.

Lay it out in this order:

1. A header: the repository, the date, the findings or direction that set the scope, and a legend of the render marks.
2. One card per candidate.
3. The top recommendation: one candidate, one sentence on why it goes first, and a link to its card.

## A card

Each card holds:

- **Title**: the deepening, such as "Collapse order intake into one module".
- **Badges**: its strength, `Strong`, `Worth exploring` or `Speculative`, and the class of each dependency.
- **Files**: the modules and files it touches, in a monospaced list.
- **Friction**: one sentence on what hurts, with the findings and locality that show it.
- **Change**: one sentence on what the deepened module hides, and where its seam goes.
- **Locality and leverage**: short bullets in those words, such as "leverage: one interface, 14 call sites" or "locality: retry logic moves out of 3 callers".
- **Tests**: which tests survive at the seam, which ones the seam replaces, and what was untestable before.
- **Before and after**: two pictures side by side with the same scope, Current on the left and the sketch proposal on the right, each with a caption that names its state.
- **ADR**: when the candidate contradicts an ADR, one line that names it and says why the friction is worth reopening it.

Raise a candidate that an ADR forbids only when its friction is real; leave out the refactors an ADR settled for good reason.
When a card needs a paragraph to explain its pictures, narrow their scope and render them again.

## Check it

Open the page in a browser and look at each card in both themes.
Each picture's legend counts match `model compare` for its sketch.
