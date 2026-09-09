// Pure helpers behind the board dialog: its wording per mode, and the request
// it reports. Nothing here reads the DOM.

import type {
	BoardDialogDraft,
	BoardDialogField,
	BoardDialogIssue,
	BoardDialogMode,
	BoardDialogRequest,
} from "@/ui/board-dialogs/types/contracts";
import type { PersistedBoardListing } from "@/ui/types";

/** The words one mode uses. */
interface BoardDialogCopy {
	title: string;
	description: string;
	submitLabel: string;
	busyText: string;
}

const COPY: Readonly<Record<BoardDialogMode, BoardDialogCopy>> = {
	open: {
		title: "Open board",
		description: "Choose a persisted board from the vault to show in this pane.",
		submitLabel: "Open board",
		busyText: "Opening the board…",
	},
	create: {
		title: "Create board",
		description: "Name a new board. It is written to the vault as a note when it is created.",
		submitLabel: "Create board",
		busyText: "Creating the board…",
	},
	"save-as": {
		title: "Save as",
		description:
			"Write this board under another name or variant. The pane you are on stays where it is.",
		submitLabel: "Save as",
		busyText: "Saving the board…",
	},
};

/**
 * The title, description and action words for one mode.
 * @param mode The dialog's mode.
 * @returns The copy for that mode.
 */
function boardDialogCopy(mode: BoardDialogMode): BoardDialogCopy {
	return COPY[mode];
}

/**
 * Trim a field and drop it when nothing is left.
 * @param value The raw field.
 * @returns The trimmed value, or undefined when empty.
 */
function optionalField(value: string | null): string | undefined {
	const trimmed = value?.trim() ?? "";
	return trimmed === "" ? undefined : trimmed;
}

/**
 * The request a create or save-as submission reports. Empty variant and level
 * are dropped rather than sent as "", so the host applies its defaults.
 * @param mode The dialog's mode.
 * @param draft What the person typed.
 * @returns The typed request.
 */
function buildBoardDialogRequest(
	mode: BoardDialogMode,
	draft: BoardDialogDraft,
): BoardDialogRequest {
	const request: BoardDialogRequest = { mode, board: draft.board.trim() };
	const variant = optionalField(draft.variant);
	if (variant !== undefined) {
		request.variant = variant;
	}
	const level = optionalField(draft.level);
	if (level !== undefined) {
		request.level = level;
	}
	return request;
}

/**
 * The request an open submission reports: the identity of the chosen listing
 * entry, never the key string re-parsed.
 * @param boards The persisted listing.
 * @param key The chosen board key.
 * @returns The open request, or null when the key names no listed board.
 */
function buildOpenRequest(
	boards: PersistedBoardListing | null,
	key: string | null,
): BoardDialogRequest | null {
	const entry = boards?.boards.find((candidate) => candidate.key === key);
	if (!entry) {
		return null;
	}
	const request: BoardDialogRequest = {
		mode: "open",
		board: entry.identity.board,
		variant: entry.identity.variant,
	};
	if (entry.identity.level !== undefined) {
		request.level = entry.identity.level;
	}
	return request;
}

/**
 * Whether a draft can be submitted at all: a board needs a name. Everything
 * else is the host's validation, reported back through `issues`.
 * @param draft What the person typed.
 * @returns True when the name is not blank.
 */
function draftHasBoardName(draft: BoardDialogDraft): boolean {
	return draft.board.trim() !== "";
}

/**
 * The messages under one field.
 * @param issues Every issue the host reported.
 * @param field The field being rendered.
 * @returns That field's messages, in the order reported.
 */
function issuesFor(
	issues: readonly BoardDialogIssue[],
	field: BoardDialogField | "form",
): readonly string[] {
	return issues.filter((issue) => issue.field === field).map((issue) => issue.message);
}

export {
	boardDialogCopy,
	buildBoardDialogRequest,
	buildOpenRequest,
	draftHasBoardName,
	issuesFor,
	type BoardDialogCopy,
};
