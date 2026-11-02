// Small model documents for the tests of reading a level down: a model of
// named variants, a model of one card that opens another model, and a model of
// two cards that open two models, with the picture the server draws of it.

import { drawing } from "#tests/ui/support/canvas/render-answers.ts";

/**
 * One model document.
 * @param name What the model is called.
 * @param variants Its variants, in the order it states them.
 * @param current Which variant is the current one.
 * @param views The ways this model can be read.
 * @returns The document.
 */
function documentOf(
	name: string,
	variants: readonly Record<string, unknown>[],
	current: string,
	views: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: name === "pipeline" ? "bd1" : "bd2",
		name,
		level: name === "pipeline" ? "system" : "module",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views,
		current,
		variants,
	};
}

/**
 * A card that drills down to another model's current variant.
 * @param id The card's id.
 * @param name What the card is called.
 * @param below The model it opens.
 * @returns The node.
 */
function cardOpening(id: string, name: string, below: string): Record<string, unknown> {
	return {
		id,
		name,
		kind: "module",
		drillDown: { board: below, variant: { kind: "current" } },
	};
}

/**
 * A model of one card, n1, that drills down to another model's current variant.
 * @param name What the model is called.
 * @param below The model its card opens, or undefined for a card that opens none.
 * @returns The document.
 */
function cardDocument(name: string, below: string | undefined): Record<string, unknown> {
	const card = { id: "n1", name: name + " card", kind: "module" };
	const node = below === undefined ? card : cardOpening("n1", name + " card", below);
	return documentOf(
		name,
		[{ id: "v1", name: "as it is", lifecycle: "current", content: { nodes: [node], edges: [] } }],
		"v1",
	);
}

/**
 * The pipeline with two cards: n1 opens the engine and n2 opens the store.
 * @returns The document.
 */
function twoCardPipeline(): Record<string, unknown> {
	const nodes = [
		cardOpening("n1", "engine card", "engine"),
		cardOpening("n2", "store card", "store"),
	];
	return documentOf(
		"pipeline",
		[{ id: "v1", name: "as it is", lifecycle: "current", content: { nodes, edges: [] } }],
		"v1",
	);
}

/**
 * The server's picture of the pipeline with a second card, #card2, beside the first.
 * @returns The render route's success body.
 */
function twoCardDrawing(): Record<string, unknown> {
	const one = drawing(1);
	const second = `<g data-semantic-kind="node" data-semantic-id="n2"><rect id="card2" width="80" height="40"></rect></g>`;
	return {
		...one,
		svg: String(one["svg"]).replace("</svg>", `${second}</svg>`),
		atlas: {
			nodes: {
				n1: { x: 0, y: 0, width: 80, height: 40 },
				n2: { x: 100, y: 0, width: 80, height: 40 },
			},
			edges: { e1: { x: 80, y: 20, width: 40, height: 2 } },
			regions: {},
		},
	};
}

export { documentOf, cardDocument, twoCardDrawing, twoCardPipeline };
