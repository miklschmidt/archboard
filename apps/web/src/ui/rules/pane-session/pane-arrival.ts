// A pane arriving where the server points it: a board, the vault it is a board
// of, and the repository that vault is listed under (ADR 0050). The pane
// follows the server, so everything it reads from here on is of the board and
// the vault it arrived at.

import type { LivePaneStatus } from "#ui/state/pane-session/pane-status.ts";
import type { PanePlace } from "#ui/rules/pane-session/socket-messages.ts";
import type { BoardIdentity, DoingEntry } from "#ui/rules/pane-session/session-types.ts";

/** What an arrival changes, and whom it tells. */
interface PaneArrivalParts {
	readonly status: LivePaneStatus;
	/** The server put the pane in another vault. */
	readonly setVault: (vault: string) => void;
	readonly setOpened: (key: string | null) => void;
	readonly setBoard: (board: BoardIdentity | null) => void;
	readonly setDoing: (entries: DoingEntry[]) => void;
	/** The board on screen moved: who holds it and what was reported of it are not known yet. */
	readonly forgetBoard: () => void;
	/** The server pointed the pane somewhere other than the board on screen. */
	readonly arrived: (key: string, previousKey: string | null) => void;
	/** Tell the shell what the pane is now. */
	readonly publish: () => void;
	/** Tell the server what the pane shows, now. */
	readonly report: () => void;
}

/**
 * Whether the server named a board at all.
 *
 * It says so with a board key or with nothing, and nothing is a real answer:
 * a vault that holds no board yet leaves every pane showing none.
 * @param key What the server sent.
 * @returns True when there is a board to adopt.
 */
function named(key: string | null | undefined): key is string {
	return key !== undefined && key !== null && key !== "";
}

/**
 * A pane's arrivals.
 * @param parts What an arrival changes, and whom it tells.
 * @returns Adopt what the server addressed to the pane.
 */
function createPaneArrival(
	parts: PaneArrivalParts,
): (
	key: string | null | undefined,
	identity: BoardIdentity | null | undefined,
	place: PanePlace | null,
) => void {
	const { status } = parts;

	/**
	 * The pane is where the server says it is.
	 * @param place Where the server put the pane, or null when it did not say.
	 * @returns Whether the pane moved into another vault.
	 */
	function adoptPlace(place: PanePlace | null): boolean {
		if (place === null) {
			return false;
		}
		status.repository = place.repository;
		if (place.vault === status.vault) {
			return false;
		}
		status.vault = place.vault;
		parts.setVault(place.vault);
		return true;
	}

	/**
	 * Put a board on screen.
	 * @param key The board key.
	 * @param identity Its identity, when the server sent one.
	 * @param otherVault Whether the pane just moved into another vault.
	 */
	function arrive(
		key: string,
		identity: BoardIdentity | null | undefined,
		otherVault: boolean,
	): void {
		const previousKey = status.opened;
		// The board on screen moves, even when the pane is pointed back at the board
		// it was opened on: a drill-down had put another board there. The same board
		// of another checkout is another board too: another file, version and writer.
		const moved = otherVault || previousKey !== key || status.boardKey !== key;
		// Arriving sets both: the pane is showing the board it was pointed at,
		// and that is also where any later drill starts from.
		status.opened = key;
		status.boardKey = key;
		status.board = identity ?? { board: key, variant: "current" };
		parts.setOpened(key);
		parts.setBoard(status.board);
		if (moved) {
			// A different board is a different version and a different writer, and
			// what an agent said about the last one is not news about this one.
			status.version = null;
			status.doing = [];
			parts.setDoing([]);
			parts.forgetBoard();
			parts.arrived(key, previousKey);
		}
	}

	/**
	 * This pane is on a board: the one the server addressed to it.
	 *
	 * A server that names no board is telling this pane there is nothing to
	 * show yet, which is news worth sending and nothing to adopt.
	 * @param key The board key, or null when the server named none.
	 * @param identity Its identity, when the server sent one.
	 * @param place The vault the pane is in now, when the server said.
	 */
	return function adoptBoard(key, identity, place): void {
		const otherVault = adoptPlace(place);
		if (named(key)) {
			arrive(key, identity, otherVault);
		} else if (otherVault) {
			// Canonical arrivals carry no legacy board key. The server still drops
			// the former vault's capture, even if this picture stays visible until
			// the destination draws. Its next report must not be deduplicated.
			parts.forgetBoard();
		}
		parts.publish();
		// Immediately, not on the debounce: `browser panes` is read every turn.
		if (named(key) || otherVault) {
			parts.report();
		}
	};
}

export { createPaneArrival };
