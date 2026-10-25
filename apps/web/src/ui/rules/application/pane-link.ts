// Which panes are linked (TASK-538.02). Two panes are linked while both show the
// same board of the same vault and neither presents a walkthrough. A part picked
// in one is then picked in the other, so two designs of one board are read part
// by part.
//
// Each pane's status names the board on screen, which after a drill-down is the
// board followed into. So a drill-down or another board in either pane ends the
// link, and the same board in both makes it again. The link is derived from the
// statuses on every read and never stored.

import type { PaneStatus } from "#ui/rules/pane-session/session-types.ts";
import { boardAddressOf, sameBoardName } from "#ui/rules/semantic-board-canvas/board/address.ts";

/** The pane one pane is linked to, and the variant that pane shows. */
interface LinkedPane {
	readonly paneId: string;
	/** The variant it shows, by id or name, or null for the board's current one. */
	readonly variant: string | null;
}

/** Each linked pane's partner, by pane id: empty while no two panes are linked. */
type PaneLinks = Readonly<Record<string, LinkedPane>>;

/** No two panes are linked. */
const UNLINKED: PaneLinks = Object.freeze({});

/** What a link is made of in one pane. */
interface Linkable {
	readonly paneId: string;
	readonly vault: string;
	readonly board: string;
	readonly variant: string | null;
}

/**
 * What one pane shows that a link can hold.
 * @param status The pane's status.
 * @returns The vault, board and variant on screen, or null for a pane on no
 * board or one presenting a walkthrough.
 */
function linkable(status: PaneStatus): Linkable | null {
	const address = boardAddressOf(status.boardKey);
	if (address === null || status.vault === null || status.presenting) {
		return null;
	}
	const { paneId, vault } = status;
	return { paneId, vault, board: address.board, variant: address.variant ?? null };
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
		[a.paneId]: { paneId: b.paneId, variant: b.variant },
		[b.paneId]: { paneId: a.paneId, variant: a.variant },
	});
}

/**
 * Whether two sets of links say the same.
 * @param a One.
 * @param b The other.
 * @returns True when each pane has the same partner showing the same variant.
 */
function sameLinks(a: PaneLinks, b: PaneLinks): boolean {
	const panes = Object.keys(a);
	return (
		panes.length === Object.keys(b).length &&
		panes.every(
			(paneId) =>
				a[paneId]?.paneId === b[paneId]?.paneId && a[paneId]?.variant === b[paneId]?.variant,
		)
	);
}

export { paneLinks, sameLinks, type PaneLinks };
