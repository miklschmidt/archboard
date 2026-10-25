// Pictures of the board `pipeline` as the renderer draws them, for the tests
// that hold a transition or an entrance to what it does with one.

import type { SemanticDrawing } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { TRANSITION_ATTRIBUTE } from "#ui/clients/semantic-board-canvas/picture/picture-transition.ts";

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
	/** Whether the card is the label drawn for a connection rather than a node. */
	readonly label?: boolean;
	/** How far below its top a container's frame rules off its header, when it is one. */
	readonly rule?: number;
}

/** One line to draw. */
interface Line {
	readonly id: string;
	readonly d: string;
	readonly masked?: boolean;
	/** Whether the line is drawn as a removed subject, its whole group a ghost. */
	readonly ghost?: boolean;
	/** Whether traffic rides the line, in its own layer over every line. */
	readonly traffic?: boolean;
}

/**
 * A card's chip as the renderer draws one: one element both views share, drawn
 * at its near place, with its near and far places as properties of its own.
 * @param x Where its near place starts, across.
 * @param y Where its near place starts, down.
 * @returns Its group.
 */
function chipMarkup(x: number, y: number): string {
	return (
		`<g class="ab-chip" transform="translate(${x},${y}) scale(1)"` +
		` style="--near:translate(${x}px,${y}px) scale(1);--far:translate(${x - 4}px,${y + 2}px) scale(2.1667)">` +
		`<rect x="0" y="0" width="24" height="24" rx="5" fill="#888"/></g>`
	);
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
		`<g data-semantic-kind="${card.label === true ? "edge" : "node"}" data-semantic-id="${card.id}"${card.ghost === true ? ' opacity="0.4"' : ""}>` +
		`<rect class="ab-halo" x="${x - 3}" y="${y - 3}" width="${width + 6}" height="${height + 6}" rx="9" fill="none"/>` +
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="#222"${outline}/>` +
		chipMarkup(x + 16, y + 16) +
		`<text x="${x + 52}" y="${y + 30}" font-size="14">${card.title}</text>` +
		(card.rule === undefined
			? ""
			: `<line x1="${x}" y1="${y + card.rule}" x2="${x + width}" y2="${y + card.rule}" stroke="#555"/>`) +
		(card.pinned === true
			? `<g transform="translate(${x + 3},${y + 3})"><circle r="9.2" fill="#f0b429"/></g>`
			: "") +
		`</g>`
	);
}

/**
 * A line as the renderer draws one: the arrowhead it defines, then a halo path
 * under the stroke.
 * @param line The line.
 * @returns Its group.
 */
function lineMarkup(line: Line): string {
	const mask = line.masked === true ? ' mask="url(#crossing-1)"' : "";
	return (
		`<g data-semantic-kind="edge" data-semantic-id="${line.id}"${mask}${line.ghost === true ? ' opacity="0.4"' : ""}>` +
		`<defs><marker id="head"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>` +
		`<path class="ab-halo" d="${line.d}" fill="none"/>` +
		`<path d="${line.d}" fill="none" stroke="#999" marker-end="url(#head)"/>` +
		`</g>`
	);
}

/**
 * A line's traffic as the renderer draws it: a pulse in a layer of its own.
 * @param line The line.
 * @returns Its layer, or nothing when no traffic rides it.
 */
function trafficMarkup(line: Line): string {
	return line.traffic === true
		? `<g data-traffic="${line.id}"><g class="ab-pulse"><path d="M0,0 L4,0" stroke="#999"/></g></g>`
		: "";
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
	identity: Partial<Pick<SemanticDrawing, "board" | "variant" | "view" | "width" | "height">> = {},
): SemanticDrawing {
	const width = identity.width ?? 600;
	const height = identity.height ?? 400;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
		lines.map(lineMarkup).join("") +
		lines.map(trafficMarkup).join("") +
		cards.map(cardMarkup).join("") +
		`</svg>`;
	return {
		kind: "drawn",
		success: true,
		board: "pipeline",
		version: 1,
		variant: { id: "v1", name: "current", lifecycle: "current" },
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
		appearances: [],
		key: null,
		drawn: {
			nodes: cards.map((card) => ({ id: card.id, name: card.id })),
			edges: lines.map((line) => ({ id: line.id, name: line.id })),
			flows: [],
			steps: [],
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
