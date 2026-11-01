// What the address bar needs from the workspace it addresses. The application
// implements this over the panes it already owns; the router knows nothing
// about pane sessions, notices or dialogs.

import type {
	AddressOpen,
	ModelAddress,
	WorkspaceAddress,
} from "#ui/rules/board-routing/address.ts";

/**
 * Where the server says it put a pane: the key it resolved the board to, which
 * is the only spelling that can be compared with what a pane reports, and the
 * repository the pane is in now, which is what the pane reports beside it.
 */
interface OpenedBoard {
	readonly boardKey: string | null;
	/** The repository the server lists the pane's vault under, or null when none. */
	readonly repository: string | null;
}

/** A board an address asked for, and the repository it named, or null for the pane's own. */
type AskedBoard = Pick<AddressOpen, "boardKey" | "repository" | "model">;

/** How pointing one pane at one board ended. */
type OpenOutcome = ({ readonly kind: "opened" } & OpenedBoard) | { readonly kind: "unreachable" };

/** The workspace the address bar reads and addresses. */
interface WorkspacePort {
	/** What is on screen now, from the panes themselves. */
	readonly displayed: WorkspaceAddress;
	/** Whether a pane can be addressed yet: it has reached the server. */
	readonly ready: (paneId: string) => boolean;
	/**
	 * Point one pane at one board, through the application's open command.
	 * @param paneId The pane.
	 * @param boardKey The board.
	 * @param repository The repository the board is in, or null for the one the pane is in.
	 */
	readonly open: (
		paneId: string,
		boardKey: string | null,
		repository: string | null,
		model?: ModelAddress,
	) => Promise<OpenOutcome>;
	/**
	 * Read the board one pane is already showing through one of its views, or
	 * through none for the whole variant. Nothing is opened and nothing is taken
	 * away, so this is not an operation the command slot carries.
	 * @returns True when the pane was reading it some other way.
	 */
	readonly read: (paneId: string, view: string | null) => boolean;
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
	/** A restore could not reach these boards; the workspace is what is shown. */
	readonly reportUnreachable: (boards: readonly AskedBoard[]) => void;
}

export type { AskedBoard, OpenedBoard, OpenOutcome, WorkspacePort };
