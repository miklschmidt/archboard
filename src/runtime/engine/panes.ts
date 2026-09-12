// What the user is currently looking at.
//
// This exists for one reason. The voice model cannot see the screen, so "move
// that box over there" is uninterpretable unless the thread can ask what is on
// screen and what the user has selected. That is spatial deixis, and it
// is the whole justification for this module.
//
// So this reports VIEW STATE, never board contents. It is meant to be called on
// every turn, which it can only be if it stays small: inlining the architecture
// "to save a round trip" would make it expensive, which would make it uncallable
// every turn, which defeats the point. `semantic show` reports contents; this
// reports where the panes are, which board and variant each holds, which view it
// is read through, and what is picked in each — bounded no matter how big the
// board is.
//
// A pane is known to the server only while its socket is open (see server.ts):
// a closed tab or an unsplit takes its registration with it, so there are no
// ghosts. No pane at all is the normal state of a headless canvas, not an error.

import { type BoardIdentity, paneBoardAddress, parseBoardKey } from "@/runtime/engine/board";
import {
	type Arrangement,
	type PaneContext,
	type PaneReading,
	type PaneRegistration,
	type PaneReport,
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
		const first = panes[0]!;
		const other = panes.find((p) => p.identity?.board !== first.identity?.board)!;
		return [
			"The panes disagree, so commands that name no board are refused until one is named — " +
				`\`--board ${first.board ?? "none"}\`, or \`--board ${other.board ?? "none"}\`.`,
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
	const identity = identityOf(pane.board, context);
	return {
		paneId: pane.paneId,
		clientId: pane.clientId,
		position: index + 1,
		place,
		focused: pane.focused,
		primary: pane.primary,
		board: identity === null ? null : paneBoardAddress(identity),
		identity,
		rect: pane.rect,
		reading: readingOf(pane, context),
		at: pane.at,
	};
}

/**
 * What board a pane is on, when it is on one.
 * @param board The board key the pane reported, or null.
 * @param context Where board keys are resolved.
 * @returns The identity, or null when the pane is showing no board.
 */
function identityOf(board: string | null, context: PaneContext): BoardIdentity | null {
	if (board === null) {
		return null;
	}
	return context.identity(board) ?? parseBoardKey(board);
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
 * What the panes are showing.
 *
 * Named once only when they are reading it the same way. Two panes on one board
 * at two variants are the comparison somebody set up, and a read-out that said
 * the board once would hide the thing they are looking at.
 * @param panes The panes.
 * @param sameBoard Whether they all show one board.
 * @returns The phrase.
 */
function showingPhrase(panes: readonly PaneReport[], sameBoard: boolean): string {
	const shown = panes.map((pane) => shownPhrase(pane));
	if (sameBoard && new Set(shown).size === 1) {
		return `, showing ${shown[0]!}`;
	}
	return `, showing ${shown.join(" and ")}`;
}

/**
 * What one pane is reading, as the report holds it.
 *
 * A pane that has said nothing yet reads as nothing being shown, which is the
 * truth about a pane that has just mounted rather than a gap in the report.
 * @param pane The pane.
 * @param context Where to read what each pane reported.
 * @returns The reading, with the phrase a report reads out.
 */
function readingOf(pane: PaneRegistration, context: PaneContext): PaneReading {
	const read = context.reading(pane.clientId);
	if (read === null) {
		return {
			variant: null,
			view: null,
			selection: [],
			moreSelected: 0,
			summary: "nothing selected",
			version: null,
			at: null,
		};
	}
	const shown = read.selection.slice(0, MAX_IDS);
	return {
		...read,
		selection: shown,
		moreSelected: Math.max(0, read.selection.length - MAX_IDS),
		summary: describeSelection(read.selection),
	};
}

/**
 * What a selection is, in one phrase: how many things and what they are
 * called.
 * @param selection The subjects the person picked out.
 * @returns The sentence.
 */
function describeSelection(
	selection: readonly { id: string; kind?: string; name?: string }[],
): string {
	if (selection.length === 0) {
		return "nothing selected";
	}
	const kinds = new Set(selection.map((subject) => subject.kind ?? "subject"));
	const thing = kinds.size === 1 ? [...kinds][0]! : "subject";
	const named = selection
		.slice(0, MAX_IDS)
		.map((subject) => `"${subject.name ?? subject.id}"`)
		.join(", ");
	const more = selection.length > MAX_IDS ? `, and ${selection.length - MAX_IDS} more` : "";
	return `${selection.length} ${plural(thing, selection.length)} — ${named}${more}`;
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
 * What one pane is showing, named the way somebody would say it out loud.
 *
 * The variant by its lasting name when the pane has drawn one, because that is
 * what a person chose to call the proposal; the address's own spelling
 * otherwise, which is all there is before anything is drawn. A read-out that
 * said `payments@WtdAURWA (WtdAURWA)` would be naming an id twice and the
 * proposal not at all.
 * @param pane The pane.
 * @returns The phrase.
 */
function shownPhrase(pane: PaneReport): string {
	const named = pane.reading.variant?.name;
	if (pane.identity === null || named === undefined) {
		return boardPhrase(pane.identity);
	}
	return `${pane.identity.board} (${named})`;
}

/**
 * A board as a report names it: its key, and what variant and level it is.
 * @param identity The board.
 * @returns The phrase.
 */
function boardPhrase(identity: BoardIdentity | null): string {
	if (identity === null) {
		return "no board";
	}
	const name =
		identity.variant === "current" ? identity.board : `${identity.board}@${identity.variant}`;
	const detail = [identity.variant, identity.level].filter(Boolean).join(", ");
	return `${name} (${detail})`;
}

/**
 * One pane as a line of the read-out: where it is, what it shows, how it is
 * being read, and what is picked.
 * @param pane The pane.
 * @returns The line.
 */
function paneLine(pane: PaneReport): string {
	const { reading } = pane;
	const parts = [
		`${pane.position}. ${pane.place}`,
		shownPhrase(pane),
		reading.variant === null ? "nothing drawn yet" : `variant ${reading.variant.name}`,
		reading.view === null ? "whole variant" : `view ${reading.view.name} (${reading.view.grammar})`,
		reading.summary,
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
 * Build the read-out. Cost is one pass over the registry: what each pane is
 * reading is what that pane itself reported, so nothing here reads a board.
 * @param registrations The panes on screen.
 * @param context Where to read board identities, readings and the canvas URL from.
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
	// One board, whichever variants of it are on screen. Two panes comparing a
	// proposal against what is current are reading one document, and a command
	// that names no board is not ambiguous between them — it is the comparison
	// this tool exists for.
	const sameBoard = new Set(panes.map((p) => p.identity?.board ?? null)).size === 1;
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
	PaneReading,
	PaneRegistration,
	PaneReport,
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
