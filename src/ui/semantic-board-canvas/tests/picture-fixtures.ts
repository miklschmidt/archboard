// Pictures of the board `pipeline` as the renderer draws them, for the tests
// that hold a transition or an entrance to what it does with one.

import type { SemanticDrawing } from "@/ui/semantic-board-canvas";
import { TRANSITION_ATTRIBUTE } from "@/ui/semantic-board-canvas/transitions";

/** A box, as the atlas spells it. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** One card to draw. */
interface Card {
	readonly id: string;
	readonly box: Box;
	readonly title: string;
	readonly dashed?: boolean;
	/** Whether a standing's pin sits astride the card's top-left corner. */
	readonly pinned?: boolean;
	/** Whether the card is drawn as a removed subject, its whole group a ghost. */
	readonly ghost?: boolean;
}

/** One line to draw. */
interface Line {
	readonly id: string;
	readonly d: string;
	readonly masked?: boolean;
	/** Whether the line is drawn as a removed subject, its whole group a ghost. */
	readonly ghost?: boolean;
}

/**
 * A card as the renderer draws one: a halo, a body, a chip and two texts.
 * @param card The card.
 * @returns Its group.
 */
function cardMarkup(card: Card): string {
	const { x, y, width, height } = card.box;
	const outline =
		card.dashed === true ? ' stroke-dasharray="4 3" stroke="#f0b429"' : ' stroke="#555"';
	return (
		`<g data-semantic-kind="node" data-semantic-id="${card.id}"${card.ghost === true ? ' opacity="0.4"' : ""}>` +
		`<rect class="ab-halo" x="${x - 3}" y="${y - 3}" width="${width + 6}" height="${height + 6}" rx="9" fill="none"/>` +
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#222"${outline}/>` +
		`<rect x="${x + 16}" y="${y + 16}" width="24" height="24" rx="5" fill="#888"/>` +
		`<text x="${x + 52}" y="${y + 30}" font-size="14">${card.title}</text>` +
		(card.pinned === true
			? `<g transform="translate(${x + 3},${y + 3})"><circle r="9.2" fill="#f0b429"/></g>`
			: "") +
		`</g>`
	);
}

/**
 * A line as the renderer draws one: a halo path under the stroke.
 * @param line The line.
 * @returns Its group.
 */
function lineMarkup(line: Line): string {
	const mask = line.masked === true ? ' mask="url(#crossing-1)"' : "";
	return (
		`<g data-semantic-kind="edge" data-semantic-id="${line.id}"${mask}${line.ghost === true ? ' opacity="0.4"' : ""}>` +
		`<path class="ab-halo" d="${line.d}" fill="none"/>` +
		`<path d="${line.d}" fill="none" stroke="#999" marker-end="url(#head)"/>` +
		`</g>`
	);
}

/**
 * One drawn picture of the board `pipeline`.
 * @param cards Its cards.
 * @param lines Its lines.
 * @param identity Which variant and view it is of, and on which ground.
 * @returns The drawing, as the render route answers it.
 */
function picture(
	cards: readonly Card[],
	lines: readonly Line[],
	identity: Partial<
		Pick<SemanticDrawing, "board" | "variant" | "view" | "theme" | "width" | "height">
	> = {},
): SemanticDrawing {
	const width = identity.width ?? 600;
	const height = identity.height ?? 400;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
		lines.map(lineMarkup).join("") +
		cards.map(cardMarkup).join("") +
		`</svg>`;
	return {
		kind: "drawn",
		success: true,
		board: "pipeline",
		version: 1,
		variant: { id: "v1", name: "current", lifecycle: "current" },
		theme: "dark",
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width,
		height,
		svg,
		atlas: {
			nodes: Object.fromEntries(cards.map((card) => [card.id, card.box])),
			edges: Object.fromEntries(
				lines.map((line) => [line.id, { x: 0, y: 0, width: 1, height: 1 }]),
			),
			regions: {},
		},
		...identity,
	};
}

/**
 * A surface to draw on.
 * @returns The element, attached to the document.
 */
function surfaceElement(): HTMLDivElement {
	const surface = document.createElement("div");
	document.body.append(surface);
	return surface;
}

/**
 * The body rect of a card on the surface.
 * @param surface The surface.
 * @param id The card's id.
 * @returns Its box as drawn.
 */
function bodyOf(surface: Element, id: string): Box {
	const rect = surface.querySelectorAll(`g[data-semantic-id="${id}"] > rect`)[1];
	if (rect === undefined) {
		throw new Error(`no body for ${id}`);
	}
	return {
		x: Number(rect.getAttribute("x")),
		y: Number(rect.getAttribute("y")),
		width: Number(rect.getAttribute("width")),
		height: Number(rect.getAttribute("height")),
	};
}

/**
 * One wrapper the transition added to the picture.
 * @param surface The surface.
 * @param role What the wrapper holds.
 * @returns The wrapper.
 */
function wrapper(surface: Element, role: string): SVGGElement {
	const found = surface.querySelector<SVGGElement>(`[${TRANSITION_ATTRIBUTE}="${role}"]`);
	if (found === null) {
		throw new Error(`no ${role} wrapper`);
	}
	return found;
}

const A: Card = { id: "n1", box: { x: 10, y: 10, width: 100, height: 60 }, title: "Alpha" };
const B: Card = { id: "n2", box: { x: 200, y: 10, width: 100, height: 60 }, title: "Beta" };
const AB: Line = { id: "e1", d: "M110,40 L200,40" };

export { A, AB, B, bodyOf, picture, surfaceElement, wrapper, type Box, type Card, type Line };
