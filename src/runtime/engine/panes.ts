// What the user is currently looking at.
//
// This exists for one reason. The voice model cannot see the screen, so "move
// that box over there" is uninterpretable unless the thread can ask what is on
// screen and what the user has selected. That is spatial deixis, and it
// is the whole justification for this module.
//
// So this reports VIEW STATE, never board contents. It is meant to be called on
// every turn, which it can only be if it stays small: inlining the elements "to
// save a round trip" would make it expensive, which would make it uncallable
// every turn, which defeats the point. `describe` and `compare` report contents;
// this reports where the panes are, which board each holds, how much of it is on
// screen, and what is picked in each — bounded no matter how big the board is.
//
// A pane is known to the server only while its socket is open (see server.ts):
// a closed tab or an unsplit takes its registration with it, so there are no
// ghosts. No pane at all is the normal state of a headless canvas, not an error.

import { type BoardIdentity, boardKey, parseBoardKey } from "@/runtime/engine/board";
import { nameSelection } from "@/runtime/engine/describe";
import {
	type Arrangement,
	type PaneContext,
	type PaneRegistration,
	type PaneReport,
	type PaneSelection,
	type PanesReport,
	MAX_IDS,
	arrangementOf,
	panesInOrder,
} from "@/runtime/engine/lib/panes-layout";
import {
	HOW_TO_OPEN_A_PANE,
	MAX_PANES,
	paneWords,
	resolvePaneSpec,
	soloPane,
} from "@/runtime/engine/lib/panes-addressing";

/**
 * What the read-out says beyond naming the panes: the things an agent needs
 * to know that are not visible in the list itself.
 * @param panes The panes on screen.
 * @param arrangement How they are laid out.
 * @param sameBoard Whether they all show one board.
 * @returns The lines, in the order they are read.
 */
function advice(
	panes: readonly PaneReport[],
	arrangement: Arrangement,
	sameBoard: boolean,
): string[] {
	const lines: string[] = [];
	if (arrangement === "overlapping") {
		// Not a split: two browsers on the same canvas. Saying so stops a thread
		// offering "the left one" as a way to tell them apart.
		lines.push(
			"These are separate tabs or windows on the same canvas, not a split — nothing is to the left of anything.",
		);
	}
	if (panes.length === 1) {
		// One pane is one board on screen, and a comparison needs two. Said here
		// because this is the report an agent reads every turn, and an agent that
		// does not know a second pane is obtainable reuses the first one — which
		// means overwriting whatever the human was looking at.
		lines.push(
			`Only one board is on screen. To put another beside it, keeping this one: ${HOW_TO_OPEN_A_PANE}`,
		);
	}
	lines.push(...boardAdvice(panes, sameBoard));
	return lines;
}

/**
 * What the read-out says about which boards the panes are on.
 * @param panes The panes on screen.
 * @param sameBoard Whether they all show one board.
 * @returns The lines.
 */
function boardAdvice(panes: readonly PaneReport[], sameBoard: boolean): string[] {
	if (!sameBoard) {
		// The consequence of disagreement, said where the disagreement is visible:
		// a caller that names no board is refused rather than guessed at (ADR 0009).
		const other = panes.find((p) => p.board !== panes[0]!.board)!.board;
		return [
			"The panes disagree, so commands that name no board are refused until one is named — " +
				`\`--board ${panes[0]!.board}\`, or \`--board ${other}\`.`,
		];
	}
	if (panes.length > 1) {
		// Said once, not per pane. Two identical lines used to need explaining
		// because the server could not do anything else; now they are a choice, and
		// what a reader needs is how to make the other one.
		return [
			"These panes are all on the same board. Point one somewhere else with " +
				"`browser show <name> --pane <left|right|…>`.",
		];
	}
	return [];
}

/**
 * The read-out when nothing is on screen.
 * @param arrangement How the panes are laid out, which is "none".
 * @param context Where to read the canvas URL from.
 * @returns The report.
 */
function emptyReport(arrangement: Arrangement, context: PaneContext): PanesReport {
	const where = context.canvasUrl
		? ` Open ${context.canvasUrl} to put it in front of somebody.`
		: "";
	const summary = `No pane is open, so nothing is on screen.${where}`;
	return {
		paneCount: 0,
		arrangement,
		focused: null,
		sameBoard: true,
		panes: [],
		summary,
		text:
			summary + "\nThe board itself is unaffected — it lives on the server, not in the browser.",
	};
}

/**
 * One pane as the report holds it.
 * @param pane The pane.
 * @param index Where it sits in reading order.
 * @param place The phrase that names where it is.
 * @param context Where to read its board and selection from.
 * @returns The pane's entry.
 */
function paneReport(
	pane: PaneRegistration,
	index: number,
	place: string,
	context: PaneContext,
): PaneReport {
	const identity = context.identity(pane.board) ?? parseBoardKey(pane.board);
	return {
		paneId: pane.paneId,
		clientId: pane.clientId,
		position: index + 1,
		place,
		focused: pane.focused,
		primary: pane.primary,
		board: boardKey(identity),
		identity,
		elementCount: pane.elementCount,
		viewport: pane.viewport,
		rect: pane.rect,
		selection: selectionOf(pane, context),
		at: pane.at,
	};
}

const LAYOUT_PHRASE: Record<string, string> = {
	grid: "in a grid",
	overlapping: "in the same place",
	"side-by-side": "side by side",
	stacked: "stacked",
};

/**
 * How many panes there are and how they sit, in the words a report opens with.
 * @param arrangement How they are laid out.
 * @param count How many there are.
 * @returns The phrase.
 */
function layoutPhrase(arrangement: Arrangement, count: number): string {
	if (arrangement === "single") {
		return "1 pane on screen";
	}
	return `${count} panes, ${LAYOUT_PHRASE[arrangement] ?? arrangement}`;
}

/**
 * What the panes are showing, named once when they all show the same board.
 * @param panes The panes.
 * @param sameBoard Whether they all show one board.
 * @returns The phrase.
 */
function showingPhrase(panes: readonly PaneReport[], sameBoard: boolean): string {
	if (sameBoard) {
		return `, showing ${boardPhrase(panes[0]!.identity)}`;
	}
	return `, showing ${panes.map((p) => boardPhrase(p.identity)).join(" and ")}`;
}

/**
 * A coordinate as a report prints it: whole pixels, because a viewport read
 * to six decimal places says nothing more than one read to none.
 * @param n The coordinate.
 * @returns The rounded value.
 */
const round = (n: number): number => Math.round(n);

/**
 * What one pane has picked, named rather than counted where it can be.
 * @param pane The pane.
 * @param context Where to read the board and the selection from.
 * @returns The selection, with the sentence a report reads out.
 */
function selectionOf(pane: PaneRegistration, context: PaneContext): PaneSelection {
	const picked = context.selection(pane.clientId);
	const ids = picked?.elementIds ?? [];
	const at = picked?.at ?? null;
	if (ids.length === 0) {
		return {
			count: 0,
			elementIds: [],
			moreIds: 0,
			nodeCount: 0,
			names: [],
			summary: "nothing selected",
			at,
		};
	}
	const named = nameSelection(ids, context.elements(pane.board));
	return {
		count: ids.length,
		elementIds: ids.slice(0, MAX_IDS),
		moreIds: Math.max(0, ids.length - MAX_IDS),
		nodeCount: named.nodeCount,
		names: named.names,
		summary: describeSelection(named),
		at,
	};
}

/**
 * What a selection is, in one phrase: how many things, what they are called,
 * and how many of them the board no longer holds.
 * @param named The selection, already named.
 * @returns The sentence.
 */
function describeSelection(named: ReturnType<typeof nameSelection>): string {
	const things =
		named.nodeCount === named.count
			? `${named.count} ${plural("node", named.count)}`
			: `${named.count} ${plural("element", named.count)}${nodesAmong(named.nodeCount)}`;
	const list =
		named.names.length > 0
			? ` — ${named.names.map((n) => `"${n}"`).join(", ")}${named.more > 0 ? `, and ${named.more} more` : ""}`
			: "";
	const missing = named.missing > 0 ? `, ${named.missing} no longer on the board` : "";
	return `${things}${list}${missing}`;
}

/**
 * How many of a selection's elements are nodes, said only where some are.
 * @param nodeCount How many nodes.
 * @returns The parenthetical, or nothing.
 */
function nodesAmong(nodeCount: number): string {
	return nodeCount > 0 ? ` (${nodeCount} ${plural("node", nodeCount)})` : "";
}

/**
 * A word, pluralised by the number in front of it.
 * @param word The singular.
 * @param count How many.
 * @returns The word as it reads.
 */
function plural(word: string, count: number): string {
	return count === 1 ? word : `${word}s`;
}

/**
 * A board as a report names it: its key, and what variant and level it is.
 * @param identity The board.
 * @returns The phrase.
 */
function boardPhrase(identity: BoardIdentity): string {
	const name =
		identity.variant === "current" ? identity.board : `${identity.board}@${identity.variant}`;
	const detail = [identity.variant, identity.level].filter(Boolean).join(", ");
	return `${name} (${detail})`;
}

/**
 * One pane as a line of the read-out: where it is, what it shows, what is in
 * view, and what is picked.
 * @param pane The pane.
 * @returns The line.
 */
function paneLine(pane: PaneReport): string {
	const view = pane.viewport;
	const parts = [
		`${pane.position}. ${pane.place}`,
		boardPhrase(pane.identity),
		`${pane.elementCount} element${pane.elementCount === 1 ? "" : "s"}`,
		`view (${round(view.x)},${round(view.y)}) ${round(view.width)}x${round(view.height)} @${view.zoom.toFixed(2)}x`,
		pane.selection.count > 0 ? `selected: ${pane.selection.summary}` : "nothing selected",
	];
	if (pane.focused) {
		parts.push("focused");
	}
	if (pane.primary) {
		parts.push("answers screenshots");
	}
	return parts.join(" · ");
}

/**
 * Build the read-out. Cost is one pass over the registry plus, for each pane
 * that has something selected, one pass over its board to name it — not over
 * the elements themselves, which never appear here.
 * @param registrations The panes on screen.
 * @param context Where to read boards, selections and the canvas URL from.
 * @returns The report, and the text an agent reads out.
 */
function buildPanesReport(registrations: PaneRegistration[], context: PaneContext): PanesReport {
	const inOrder = panesInOrder(registrations);
	const ordered = inOrder.map((entry) => entry.pane);
	const arrangement = arrangementOf(ordered);
	if (ordered.length === 0) {
		return emptyReport(arrangement, context);
	}
	const panes: PaneReport[] = inOrder.map((entry, index) =>
		paneReport(entry.pane, index, entry.place, context),
	);
	const sameBoard = new Set(panes.map((p) => p.board)).size === 1;
	const focused = panes.find((p) => p.focused)?.paneId ?? null;
	const summary = `${layoutPhrase(arrangement, panes.length)}${showingPhrase(panes, sameBoard)}.`;
	const lines = [
		summary,
		...advice(panes, arrangement, sameBoard),
		...panes.map((pane) => `  ${paneLine(pane)}`),
	];
	return {
		paneCount: panes.length,
		arrangement,
		focused,
		sameBoard,
		panes,
		summary,
		text: lines.join("\n"),
	};
}

export type {
	Arrangement,
	PaneContext,
	PaneRegistration,
	PaneReport,
	PaneSelection,
	PanesReport,
	Rect,
} from "@/runtime/engine/lib/panes-layout";
export {
	HOW_TO_OPEN_A_PANE,
	MAX_PANES,
	buildPanesReport,
	paneWords,
	panesInOrder,
	resolvePaneSpec,
	soloPane,
};
