// What the address bar needs from the workspace it addresses. The application
// implements this over the panes it already owns; the router knows nothing
// about pane sessions, notices or dialogs.

import type { WorkspaceAddress } from "@/ui/board-routing/address";

/**
 * Why a navigation was refused before anything moved.
 *
 * `pending` is an edit the server has not taken yet, `hold` a board that has
 * stopped saving (ADR 0006): in both, the pane's canvas holds work that exists
 * nowhere else, and pointing it at another board would throw that work away.
 */
interface NavigationBlock {
	readonly kind: "pending" | "hold";
	readonly paneId: string;
}

/** Whether a navigation may proceed. */
type GuardVerdict = { readonly kind: "clear" } | NavigationBlock;

/** How pointing one pane at one board ended. */
type OpenOutcome = { readonly kind: "opened" } | { readonly kind: "unreachable" };

/** The workspace the address bar reads, addresses and guards. */
interface WorkspacePort {
	/** What is on screen now, from the panes themselves. */
	readonly displayed: WorkspaceAddress;
	/** Whether a pane can be addressed yet: it has reached the server. */
	readonly ready: (paneId: string) => boolean;
	/**
	 * Whether these panes may lose what they show. Called before anything
	 * changes, for every pane a navigation would close or move.
	 */
	readonly guard: (paneIds: readonly string[]) => GuardVerdict;
	/** Point one pane at one board, through the application's open command. */
	readonly open: (paneId: string, boardKey: string) => Promise<OpenOutcome>;
	/**
	 * The panes this shell can have, whether or not they are open. An address
	 * naming anything else is asking for a workspace that cannot exist.
	 */
	readonly paneIds: readonly string[];
	/**
	 * Open, close or focus a pane. Each answers whether it changed anything:
	 * a restore reads the workspace once per render, so a command that changed
	 * nothing leaves that reading good and the next step may follow at once,
	 * while one that changed something is waited on until the render arrives.
	 * @returns True when the workspace changed.
	 */
	readonly addPane: () => boolean;
	readonly closePane: (paneId: string) => boolean;
	readonly selectPane: (paneId: string) => boolean;
	/** A navigation was refused: show that pane's recovery. */
	readonly reportBlocked: (block: NavigationBlock) => void;
	/** A restore could not reach these boards; the workspace is what is shown. */
	readonly reportUnreachable: (boardKeys: readonly string[]) => void;
}

export type { GuardVerdict, NavigationBlock, OpenOutcome, WorkspacePort };
