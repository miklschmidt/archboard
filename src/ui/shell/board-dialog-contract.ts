import type { BoardIdentity } from "../types";

export type BoardDialogMode = "open" | "new" | "save-as";

export interface BoardDialogPane {
	clientId: string;
	label: string;
	board: string | null;
}

export interface BoardDialogProps {
	mode: BoardDialogMode;
	/** The board in the pane being worked in, to seed "another variant of this". */
	current: BoardIdentity | null;
	/** The panes a board can be opened into. */
	panes?: BoardDialogPane[];
	/** The pane to offer first: the one being worked in. */
	defaultPane?: string | null;
	busy?: boolean;
	error?: string | null;
	onSubmit: (address: { board: string; variant?: string; level?: string; pane?: string }) => void;
	onCancel: () => void;
}
