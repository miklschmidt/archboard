// Which panes are linked (TASK-538.02). Two panes are linked while both show the
// same board of the same vault and neither presents a walkthrough. A part picked
// in one is then picked in the other, so two designs of one board are read part
// by part. A view chosen in one is read in the other too (TASK-538.03), but only
// in a pane that reads the board it was opened on, because a level somebody
// drilled into keeps a view of its own.
//
// Each pane's status names the board on screen, which after a drill-down is the
// board followed into. So a drill-down or another board in either pane ends the
// link, and the same board in both makes it again. The link is derived from the
// pane records each time they change, and kept as the same object while it says
// the same, so pane news that moves no link draws no pane again.

import type { PaneRecords } from "#ui/rules/application/pane-records.ts";
import type { PaneStatus } from "#ui/rules/pane-session/session-types.ts";
import { boardAddressOf, sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";

/** The pane one pane is linked to, the variant that pane shows, and whether it reads its own board. */
interface LinkedPane {
	readonly paneId: string;
	/** The variant it shows, by id or name, or null for the board's current one. */
	readonly variant: string | null;
	/** Whether it reads the board it was opened on, rather than one it drilled into. */
	readonly ownBoard: boolean;
}

/** Each linked pane's partner, by pane id: empty while no two panes are linked. */
type PaneLinks = Readonly<Record<string, LinkedPane>>;

/** No two panes are linked. */
const UNLINKED: PaneLinks = Object.freeze({});

/** What a link is made of in one pane. */
interface Linkable extends LinkedPane {
	readonly vault: string;
	readonly board: string;
}

/**
 * What one pane shows that a link can hold.
 * @param status The pane's status.
 * @returns The vault, board and variant on screen and whether it is the board
 * the pane was opened on, or null for a pane on no board or one presenting a
 * walkthrough.
 */
function linkable(status: PaneStatus): Linkable | null {
	const address = boardAddressOf(status.boardKey);
	if (address === null || status.vault === null || status.presenting) {
		return null;
	}
	const { paneId, vault } = status;
	// A drill-down leads to another board, so the board the pane was opened on
	// names the one on screen only while the pane reads it.
	const opened = boardAddressOf(status.opened);
	const ownBoard = opened !== null && sameBoardName(opened.board, address.board);
	return { paneId, vault, board: address.board, variant: address.variant ?? null, ownBoard };
}

/**
 * Whether two panes show one board of one vault.
 * @param a What one shows.
 * @param b What the other shows.
 * @returns True when they show the same board.
 */
function sameBoard(a: Linkable, b: Linkable): boolean {
	return a.vault === b.vault && sameBoardName(a.board, b.board);
}

/**
 * Which panes are linked, and what each one's partner shows.
 * @param statuses The statuses of the panes, in reading order.
 * @returns Each linked pane's partner, or no links.
 */
function paneLinks(statuses: readonly PaneStatus[]): PaneLinks {
	const [a, b] = statuses.map(linkable);
	if (!a || !b || !sameBoard(a, b)) {
		return UNLINKED;
	}
	return Object.freeze({
		[a.paneId]: { paneId: b.paneId, variant: b.variant, ownBoard: b.ownBoard },
		[b.paneId]: { paneId: a.paneId, variant: a.variant, ownBoard: a.ownBoard },
	});
}

/**
 * Whether a pane has the same partner in two sets of links.
 * @param one Its partner in one set.
 * @param other Its partner in the other, if it has one there.
 * @returns True when the partner is the same pane, showing the same variant at the same level.
 */
function samePartner(one: LinkedPane, other: LinkedPane | undefined): boolean {
	return (
		other !== undefined &&
		one.paneId === other.paneId &&
		one.variant === other.variant &&
		one.ownBoard === other.ownBoard
	);
}

/**
 * Whether two sets of links say the same.
 * @param a One.
 * @param b The other.
 * @returns True when each pane has the same partner in both.
 */
function sameLinks(a: PaneLinks, b: PaneLinks): boolean {
	const panes = Object.entries(a);
	return (
		panes.length === Object.keys(b).length &&
		panes.every(([paneId, partner]) => samePartner(partner, b[paneId]))
	);
}

/** The records of the open panes, and the links they make. */
interface LinkedRecords {
	readonly records: PaneRecords;
	readonly links: PaneLinks;
}

/** No pane has said anything yet, so none is linked. */
const NO_PANES: LinkedRecords = Object.freeze({ records: Object.freeze({}), links: UNLINKED });

/**
 * The records after a change, with the links they make: the links held before
 * when they say the same.
 * @param before The records and links before the change.
 * @param records The records after it.
 * @returns The records and their links.
 */
function relinked(before: LinkedRecords, records: PaneRecords): LinkedRecords {
	if (records === before.records) {
		return before;
	}
	const found = paneLinks(Object.values(records).map((record) => record.status));
	return { records, links: sameLinks(before.links, found) ? before.links : found };
}

export { NO_PANES, paneLinks, relinked, type LinkedRecords, type PaneLinks };
