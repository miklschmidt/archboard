// Paint the drawings that the site's painter draws live: the whole of Archboard's own model, read
// from the repository's vault and drawn by the renderer core into a painting, the scene that the
// painter (ADR 0071) draws on a canvas. A painting belongs to the painter of the same build, so the
// site's build makes both from one checkout and keeps neither in Git.
//
// The hero lays its painting on the table, without a ground, and raises the cards itself. The
// model's viewport shows the drawing as the app does.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun site/scripts/paint.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectModel } from "@archboard/model/content";
import { readArchitectureModel } from "@archboard/model/store-read";
import { renderArchitecture } from "@archboard/renderer/bun";

const OUT = join(import.meta.dir, "../src/paintings");

const model = await readArchitectureModel(".archboard/vault", undefined, undefined, {});
if (!model.success)
	throw new Error(`The repository's vault did not read: ${JSON.stringify(model)}`);
const reading = projectModel(model, null, null, {}, undefined);
const request = {
	content: reading.content,
	variant: reading.complete,
	held: reading.held,
	standing: reading.standing,
	unsettled: reading.unsettled,
	grammar: "architecture",
	policy: model.policy,
	theme: "dark",
} as const;
const [drawn, slab] = await Promise.all([renderArchitecture(request), renderArchitecture(request)]);

// The hero lays the drawing on its own ground, so its painting draws none.
const painting = JSON.parse(drawn.painting) as { scene: { background: unknown } };
painting.scene.background = { colour: "transparent" };

// The rounded plates the painting draws, by where each stands: a card's tile on the site stands on
// the plate the painter draws for it, which the atlas places a unit apart.
const plates = [
	...drawn.painting.matchAll(
		/"purpose":"plate","geometry":\{"kind":"rect","rect":\{"x":([\d.-]+),"y":([\d.-]+),"width":([\d.]+),"height":([\d.]+)\},"radius":([\d.]+)/g,
	),
].map((match) => match.slice(1).map(Number));

// Each card, the plate it is painted on, and what it lights with it: its own lines and the cards
// at their other ends.
const { nodes, edges } = drawn.atlas;
const cards = Object.entries(nodes).map(([id, box]) => {
	const plate = plates
		.filter(
			([x = 0, y = 0, width = 0]) => Math.abs(x - box.x) <= 2 && y === box.y && width === box.width,
		)
		.toSorted((one, other) => (other[3] ?? 0) - (one[3] ?? 0))[0];
	if (!plate) throw new Error(`The painting draws no plate for the card ${id}.`);
	const lines = reading.content.edges.filter(
		(edge) => (edge.from === id || edge.to === id) && edge.id in edges,
	);
	return {
		id,
		box: plate.slice(0, 4),
		radius: plate[4],
		lines: lines.map((edge) => edge.id),
		ends: [...new Set(lines.map((edge) => (edge.from === id ? edge.to : edge.from)))],
	};
});
const corner = Math.max(...cards.map((card) => card.radius ?? 0));

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "own.painting.json"), JSON.stringify(painting));
writeFileSync(join(OUT, "own.slab.painting.json"), slab.painting);
writeFileSync(
	join(OUT, "own.json"),
	`${JSON.stringify({ width: drawn.width, height: drawn.height, corner, cards }, null, "\t")}\n`,
);
console.log(`wrote src/paintings/own.painting.json (${drawn.width} × ${drawn.height})`);
process.exit(0);
