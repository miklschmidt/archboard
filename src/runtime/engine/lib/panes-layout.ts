// What the panes are and where they sit.
//
// A pane is known to the server only while its socket is open (see server.ts):
// a closed tab or an unsplit takes its registration with it, so there are no
// ghosts. No pane at all is the normal state of a headless canvas, not an
// error.

import { type ServerElement } from "@/runtime/engine/types";
import { type BoardIdentity } from "@/runtime/engine/board";

/** A rectangle. Page coordinates for `rect`, scene coordinates for `viewport`. */
interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * What one pane tells the server about itself.
 *
 * The pane reports the board key it *adopted*, never the server's idea of what
 * it should be holding. That is what makes this report a description of the
 * scene rather than a restatement of server state: if a pane were somehow
 * rendering a board the server did not think it had, this would say so.
 */
interface PaneRegistration {
	/** The pane's identity to the server: also its websocket and selection key. */
	clientId: string;
	/** Stable within the tab, and what the human sees on the pane tab. */
	paneId: string;
	/** Board key, e.g. `payments` or `payments@option-a`. */
	board: string;
	/** Is this the default pane for browser capture and viewport requests? */
	primary: boolean;
	/** Is this the pane the user last interacted with? */
	focused: boolean;
	elementCount: number;
	/** Where the pane sits in the page, in CSS pixels. */
	rect: Rect;
	/** Which part of the board is on screen, in scene coordinates. */
	viewport: Rect & { zoom: number };
	/**
	 * The entry script this tab loaded, e.g. `/assets/index-B1qk9.js`. Absent
	 * from a tab served by the vite dev server, and from any client that is not
	 * a browser (TASK-056).
	 */
	build?: string;
	at: string;
}

interface PaneSelection {
	count: number;
	/** Capped: a select-all must not make this report expensive. */
	elementIds: string[];
	moreIds: number;
	nodeCount: number;
	names: string[];
	/** One phrase, e.g. `2 nodes — "Gateway", "Payments"`. */
	summary: string;
	at: string | null;
}

interface PaneReport {
	paneId: string;
	clientId: string;
	/** 1-based, in reading order. */
	position: number;
	/** Where it is, said the way a human would: `left`, `right`, `top`… */
	place: string;
	focused: boolean;
	primary: boolean;
	board: string;
	identity: BoardIdentity;
	elementCount: number;
	viewport: Rect & { zoom: number };
	rect: Rect;
	selection: PaneSelection;
	/** When this pane last told the server about itself. */
	at: string;
}

type Arrangement =
	| "none"
	| "single"
	| "side-by-side"
	| "stacked"
	| "grid"
	/**
	 * Two panes in the same place: separate tabs or windows, not a split. Worth
	 * its own name because "the left one" means nothing here, and an agent that
	 * assumed a split would point the human at the wrong screen.
	 */
	| "overlapping";

interface PanesReport {
	paneCount: number;
	arrangement: Arrangement;
	/** paneId of the pane the user last interacted with. */
	focused: string | null;
	/** Are all panes showing the same board? */
	sameBoard: boolean;
	panes: PaneReport[];
	summary: string;
	text: string;
}

/** What the report needs from the server, without importing the server. */
interface PaneContext {
	/** The identity the board registry holds for a key, if it holds one. */
	identity(board: string): BoardIdentity | null;
	/** The board's elements — used only to name what is selected, never listed. */
	elements(board: string): ServerElement[];
	/** What this client last reported picking. */
	selection(clientId: string): { elementIds: string[]; at: string } | null;
	/** Where to open the canvas, for the no-pane case. */
	canvasUrl?: string;
}

/** One pane, with where it sits and what that place is called. */
type PlacedPane = { pane: PaneRegistration; position: number; place: string };

/** Panes within this many pixels of each other are in the same row or column. */
const BAND = 24;

/** Beyond this many selected ids, the report says how many rather than which. */
const MAX_IDS = 20;

/**
 * Reading order for panes: top to bottom in rows, then left to right, which
 * is the order a person names them in.
 * @param a One pane.
 * @param b The other.
 * @returns Negative when the first comes first.
 */
const readingOrder = (a: PaneRegistration, b: PaneRegistration): number =>
	Math.abs(a.rect.y - b.rect.y) > BAND ? a.rect.y - b.rect.y : a.rect.x - b.rect.x;

/**
 * Distinct positions along one axis, collapsing anything within a band: two
 * panes a few pixels apart are in the same row or column, not two.
 * @param values The positions.
 * @returns The distinct ones, ascending.
 */
function bands(values: number[]): number[] {
	const sorted = [...values].toSorted((a, b) => a - b);
	const out: number[] = [];
	for (const value of sorted) {
		if (out.length === 0 || value - out[out.length - 1]! > BAND) {
			out.push(value);
		}
	}
	return out;
}

/**
 * Which band a position falls in.
 * @param edges The bands' leading edges.
 * @param value The position.
 * @returns The band's index.
 */
const bandIndex = (edges: number[], value: number): number => {
	let index = 0;
	edges.forEach((edge, i) => {
		if (value - edge > -BAND) {
			index = i;
		}
	});
	return index;
};

/**
 * How the panes are laid out, in the words a report uses.
 * @param panes The panes on screen.
 * @returns The arrangement.
 */
function arrangementOf(panes: PaneRegistration[]): Arrangement {
	if (panes.length < 2) {
		return panes.length === 0 ? "none" : "single";
	}
	const rows = bands(panes.map((p) => p.rect.y)).length;
	const columns = bands(panes.map((p) => p.rect.x)).length;
	return gridArrangement(rows, columns);
}

/**
 * What a grid of rows and columns is called. One of each is two panes in the
 * same place — separate tabs on one canvas, not a split.
 * @param rows How many rows the panes fall in.
 * @param columns How many columns.
 * @returns The arrangement.
 */
function gridArrangement(rows: number, columns: number): Arrangement {
	if (rows === 1) {
		return columns === 1 ? "overlapping" : "side-by-side";
	}
	return columns === 1 ? "stacked" : "grid";
}

const ROW_NAMES = ["top", "middle", "bottom"];
const COLUMN_NAMES = ["left", "middle", "right"];

/**
 * What one pane is called: the phrase a person would use to point at it, and
 * the phrase `--pane` accepts back.
 * @param pane The pane.
 * @param index Where it sits in reading order.
 * @param panes Every pane on screen.
 * @param arrangement How they are laid out.
 * @returns The phrase.
 */
function placeOf(
	pane: PaneRegistration,
	index: number,
	panes: PaneRegistration[],
	arrangement: Arrangement,
): string {
	switch (arrangement) {
		case "single":
			return "the only pane";
		case "side-by-side":
			return alongAxis(index, panes.length, COLUMN_NAMES, "column");
		case "stacked":
			return alongAxis(index, panes.length, ROW_NAMES, "row");
		case "overlapping":
			return `tab ${index + 1} of ${panes.length}`;
		default:
			return gridPlace(pane, panes);
	}
}

/**
 * Where one pane sits along a single axis: the two-pane words, the three-pane
 * words, and a numbered place past that.
 * @param index Where it sits in reading order.
 * @param count How many panes there are.
 * @param names What the three-pane places are called.
 * @param axis What a numbered place is called.
 * @returns The phrase.
 */
function alongAxis(index: number, count: number, names: readonly string[], axis: string): string {
	if (count === 2) {
		return index === 0 ? names[0]! : names[2]!;
	}
	if (count === 3) {
		return names[index]!;
	}
	return `${axis} ${index + 1} of ${count}`;
}

/**
 * Where one pane sits in a grid, as a row and a column.
 * @param pane The pane.
 * @param panes Every pane on screen.
 * @returns The phrase.
 */
function gridPlace(pane: PaneRegistration, panes: PaneRegistration[]): string {
	const rows = bands(panes.map((p) => p.rect.y));
	const columns = bands(panes.map((p) => p.rect.x));
	return `row ${bandIndex(rows, pane.rect.y) + 1}, column ${bandIndex(columns, pane.rect.x) + 1}`;
}

/**
 * The panes in reading order, each with the phrase that names where it is.
 *
 * Shared on purpose: the report and pane addressing (`--pane right`) have to
 * agree about which one "right" is, and they can only be guaranteed to agree
 * by asking the same function.
 * @param registrations The panes on screen.
 * @returns Each pane, its position and the phrase that names where it is.
 */
function panesInOrder(
	registrations: PaneRegistration[],
): Array<{ pane: PaneRegistration; position: number; place: string }> {
	const ordered = [...registrations].toSorted(readingOrder);
	const arrangement = arrangementOf(ordered);
	return ordered.map((pane, index) => ({
		pane,
		position: index + 1,
		place: placeOf(pane, index, ordered, arrangement),
	}));
}

export {
	type Arrangement,
	type PaneContext,
	type PaneRegistration,
	type PaneReport,
	type PaneSelection,
	type PanesReport,
	type PlacedPane,
	type Rect,
	MAX_IDS,
	arrangementOf,
	panesInOrder,
};
